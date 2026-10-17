// Browser side of the replay: fetches the recording when the widget nears the
// viewport (or on first interaction) and drives the server-rendered markup.
// Animation frames run only while playing; nothing plays on its own.
import { appliedOrder, momentAt, sampleAt, type Moment, type Replay } from './replay-core';
import {
  announceText,
  decisionHTML,
  end,
  mapLabel,
  noteHTML,
  pctOf,
  start,
  timeText,
  timeValueText,
  unitListHTML,
  unitsSVG,
  viewText,
  waitingText,
} from './replay-render';

const loads = new Map<string, Promise<Replay>>();
function load(url: string): Promise<Replay> {
  let p = loads.get(url);
  if (!p) {
    p = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return res.json() as Promise<Replay>;
    });
    p.catch(() => loads.delete(url));
    loads.set(url, p);
  }
  return p;
}

/** Snap distance for timeline marks, in CSS pixels. */
const SNAP_PX = 9;

export function enhance(root: HTMLElement): void {
  if (root.dataset.enhanced) return;
  root.dataset.enhanced = 'loading';

  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const map = $('.br__map');
  const svg = $<SVGSVGElement>('[data-map]');
  const dyn = $<SVGGElement>('[data-dyn]');
  const unitList = $('[data-unit-list]');
  const viewline = $('[data-viewline]');
  const play = $<HTMLButtonElement>('[data-act="play"]');
  const prev = $<HTMLButtonElement>('[data-act="prev"]');
  const next = $<HTMLButtonElement>('[data-act="next"]');
  const keyBtn = $<HTMLButtonElement>('[data-act="key"]');
  const viewBtn = $<HTMLButtonElement>('[data-act="view"]');
  const speedSel = $<HTMLSelectElement>('[data-speed]');
  const scrub = $<HTMLInputElement>('[data-scrub]');
  const strip = $('[data-strip]');
  const clockEl = $('[data-clock]');
  const pclock = $('[data-pclock]');
  const decision = $('[data-decision]');
  const waiting = $('[data-waiting]');
  const note = $('[data-note]');
  const live = $('[data-live]');
  const status = $('[data-status]');
  const retry = $<HTMLButtonElement>('[data-retry]');
  const seekButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-seek]')];

  let r: Replay | null = null;
  let applied: number[] = [];
  let T = Number(root.dataset.t);
  let playing = false;
  let speed = Number(speedSel.value) || 4;
  let view = true;
  let until: number | null = null;
  let raf = 0;
  let last: number | null = null;
  let mk = 1;
  const keys = { map: '', k: NaN, note: NaN, announced: NaN };
  let announceTimer = 0;

  const markScale = () => Number(getComputedStyle(svg).getPropertyValue('--mk')) || 1;

  function render(reason: 'play' | 'seek' | 'init' | 'layout') {
    if (!r) return;
    const m: Moment = momentAt(r, applied, T);
    const mapKey = `${m.i}|${m.k}|${view}|${mk}`;
    if (mapKey !== keys.map) {
      keys.map = mapKey;
      dyn.innerHTML = unitsSVG(r, m, { view, mk });
      unitList.innerHTML = unitListHTML(r, m);
      svg.setAttribute('aria-label', mapLabel(r, m));
    }
    if (m.k !== keys.k) {
      keys.k = m.k;
      decision.innerHTML = decisionHTML(r, m);
      decision.scrollTop = 0;
      scrollable();
      strip.querySelector('.st-t.is-current')?.classList.remove('is-current');
      if (m.k >= 0) strip.querySelector(`.st-t[data-k="${m.k}"]`)?.classList.add('is-current');
      const pos = applied.indexOf(m.k);
      prev.disabled = pos <= 0;
      next.disabled = pos >= applied.length - 1;
    }
    if (m.note !== keys.note) {
      keys.note = m.note;
      note.innerHTML = noteHTML(r, m);
      note.hidden = m.note < 0;
    }
    setText(waiting, waitingText(r, m));
    setText(viewline, view ? viewText(m) : 'Model’s view hidden: recorded positions and movement only.');
    const time = timeText(r, T);
    setText(clockEl, time);
    setText(pclock, time);
    scrub.value = String(T);
    scrub.setAttribute('aria-valuetext', timeValueText(r, T));
    strip.style.setProperty('--head', `${pctOf(r, T)}%`);
    updatePlay();
    if (reason === 'seek' && m.k !== keys.announced) {
      window.clearTimeout(announceTimer);
      announceTimer = window.setTimeout(() => {
        if (!r || playing) return;
        const now = momentAt(r, applied, T);
        keys.announced = now.k;
        live.textContent = announceText(r, now);
      }, 450);
    }
  }

  /** The decision region takes focus only when it scrolls (so keyboard users can scroll it). */
  function scrollable() {
    decision.tabIndex = decision.scrollHeight > decision.clientHeight + 1 ? 0 : -1;
  }

  function setText(el: Element, text: string) {
    if (el.textContent !== text) el.textContent = text;
  }

  function updatePlay() {
    if (!r) return;
    const label = playing ? 'Pause' : T >= end(r) ? 'Replay' : 'Play';
    setText(play, label);
    play.setAttribute('aria-pressed', String(playing));
  }

  function clamp(t: number) {
    return r ? Math.min(end(r), Math.max(start(r), t)) : t;
  }

  function startPlay() {
    if (!r) return;
    if (T >= end(r)) {
      T = start(r);
      until = null;
    }
    playing = true;
    last = null;
    keys.announced = NaN;
    if (!raf) raf = requestAnimationFrame(tick);
    render('play');
  }

  function pause() {
    playing = false;
    until = null;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    last = null;
    if (r) {
      keys.announced = momentAt(r, applied, T).k;
      updatePlay();
    }
  }

  function toggle() {
    if (playing) pause();
    else startPlay();
  }

  function tick(now: number) {
    raf = 0;
    if (!playing || !r) return;
    if (last != null) {
      T += ((now - last) / 1000) * speed;
      const stop = Math.min(end(r), until ?? Infinity);
      if (T >= stop) {
        T = stop;
        playing = false;
        until = null;
      }
      render('play');
    }
    last = now;
    if (playing) raf = requestAnimationFrame(tick);
  }

  /** Every manual move of the time pauses playback. */
  function seek(t: number) {
    if (!r) return;
    if (playing) pause();
    until = null;
    T = clamp(t);
    render('seek');
  }

  function stepDecision(dir: 1 | -1) {
    if (!r) return;
    const m = momentAt(r, applied, T);
    const pos = applied.indexOf(m.k);
    const target = pos < 0 ? (dir > 0 ? 0 : -1) : pos + dir;
    if (target < 0 || target >= applied.length) return;
    seek(r.decisions[applied[target]].t as number);
  }

  function stepSample(dir: 1 | -1) {
    if (!r) return;
    const i = Math.max(0, sampleAt(r.t, T));
    if (dir > 0) seek(r.t[Math.min(r.t.length - 1, i + 1)]);
    else seek(T > r.t[i] ? r.t[i] : r.t[Math.max(0, i - 1)]);
  }

  function watchKeyMoment() {
    if (!r || !r.key_moment) return;
    seek(r.key_moment.start);
    startPlay();
    until = r.key_moment.end;
  }

  // ---------- Timeline strip: tap or drag to seek; marks snap. ----------
  let dragging = false;
  function stripTime(e: PointerEvent, snap: boolean): number | null {
    if (!r) return null;
    const box = strip.getBoundingClientRect();
    const x = e.clientX - box.left;
    if (snap) {
      let best: { d: number; t: number } | null = null;
      for (const el of strip.querySelectorAll<HTMLElement>('.st-t, .st-e')) {
        const b = el.getBoundingClientRect();
        const d = Math.abs(b.left + b.width / 2 - e.clientX);
        if (d <= SNAP_PX && (!best || d < best.d)) best = { d, t: Number(el.dataset.t) };
      }
      if (best) return best.t;
    }
    return start(r) + (Math.min(Math.max(x, 0), box.width) / box.width) * (end(r) - start(r));
  }

  function ready(data: Replay) {
    const restoreFocus = document.activeElement === retry;
    r = data;
    applied = appliedOrder(r.decisions);
    root.dataset.enhanced = 'ready';
    status.textContent = '';
    retry.hidden = true;
    mk = markScale();
    for (const el of [play, prev, next, keyBtn, viewBtn, speedSel, scrub, ...seekButtons]) el.disabled = false;
    keyBtn.disabled = !r.key_moment;
    T = clamp(T);
    keys.announced = momentAt(r, applied, T).k;
    render('init');
    if (restoreFocus) play.focus({ preventScroll: true });

    play.addEventListener('click', toggle);
    prev.addEventListener('click', () => stepDecision(-1));
    next.addEventListener('click', () => stepDecision(1));
    keyBtn.addEventListener('click', watchKeyMoment);
    viewBtn.addEventListener('click', () => {
      view = !view;
      viewBtn.setAttribute('aria-pressed', String(view));
      render('layout');
    });
    speedSel.addEventListener('change', () => {
      speed = Number(speedSel.value) || 4;
    });
    scrub.addEventListener('input', () => seek(Number(scrub.value)));
    scrub.addEventListener('keydown', (e) => {
      const step: Record<string, () => void> = {
        ArrowLeft: () => stepSample(-1),
        ArrowDown: () => stepSample(-1),
        ArrowRight: () => stepSample(1),
        ArrowUp: () => stepSample(1),
        PageDown: () => seek(T - 10),
        PageUp: () => seek(T + 10),
        Home: () => seek(start(r!)),
        End: () => seek(end(r!)),
      };
      const action = step[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    });
    for (const b of seekButtons) b.addEventListener('click', () => seek(Number(b.dataset.seek)));

    strip.addEventListener('pointerdown', (e) => {
      if (!r || e.button > 0) return;
      dragging = true;
      strip.setPointerCapture(e.pointerId);
      const t = stripTime(e, true);
      if (t != null) seek(t);
    });
    strip.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const t = stripTime(e, false);
      if (t != null) seek(t);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      strip.addEventListener(type, () => {
        dragging = false;
      });

    map.addEventListener('keydown', (e) => {
      if (e.target !== map || e.altKey || e.ctrlKey || e.metaKey) return;
      const action: Record<string, () => void> = {
        ArrowLeft: () => stepSample(-1),
        ArrowRight: () => stepSample(1),
        Home: () => seek(start(r!)),
        End: () => seek(end(r!)),
      };
      if (action[e.key]) {
        e.preventDefault();
        action[e.key]();
      }
    });

    // Hovering a marker whose label did not fit shows it.
    let hovered: Element | null = null;
    svg.addEventListener('pointerover', (e) => {
      const id = (e.target as Element).closest?.('[data-u]')?.getAttribute('data-u');
      hovered?.classList.remove('is-hover');
      hovered = id ? svg.querySelector(`.lbl[data-u="${id}"]`) : null;
      hovered?.classList.add('is-hover');
    });
    svg.addEventListener('pointerleave', () => {
      hovered?.classList.remove('is-hover');
      hovered = null;
    });

    new ResizeObserver(() => {
      scrollable();
      const scale = markScale();
      if (scale !== mk) {
        mk = scale;
        render('layout');
      }
    }).observe(map);
  }

  // Space or K plays and pauses anywhere inside the widget, except where Space already
  // means something (buttons, links, form controls, disclosure summaries).
  root.addEventListener('keydown', (e) => {
    if (!r || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement;
    const tag = el.tagName;
    if (e.key === 'k' || e.key === 'K') {
      if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && (el as HTMLInputElement).type !== 'range')) return;
      e.preventDefault();
      toggle();
    } else if (e.key === ' ') {
      if (['BUTTON', 'SELECT', 'INPUT', 'TEXTAREA', 'A', 'SUMMARY'].includes(tag)) return;
      e.preventDefault();
      toggle();
    }
  });

  // Pause when the widget leaves the viewport or the tab is hidden.
  const visible = new IntersectionObserver((entries) => {
    if (playing && !entries[entries.length - 1].isIntersecting) pause();
  });
  visible.observe(root);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) pause();
  });

  // Fetch the recording when the widget nears the viewport, or on first interaction.
  let requested = false;
  const request = () => {
    if (requested) return;
    requested = true;
    root.dataset.enhanced = 'loading';
    retry.hidden = true;
    status.textContent = 'Loading the recording…';
    near.disconnect();
    load(root.dataset.src!)
      .then(ready)
      .catch(() => {
        requested = false;
        root.dataset.enhanced = 'failed';
        status.textContent = 'The recording could not be loaded, so only this moment is shown.';
        retry.hidden = false;
      });
  };
  const near = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) request();
    },
    { rootMargin: '600px 0px' }
  );
  near.observe(root);
  retry.addEventListener('click', request);
  // Once loading fails, only the explicit retry starts another request.
  // Otherwise approaching that button could hide it before the click lands.
  const requestOnApproach = () => {
    if (root.dataset.enhanced !== 'failed') request();
  };
  root.addEventListener('pointerenter', requestOnApproach, { once: true });
  root.addEventListener('focusin', requestOnApproach, { once: true });
}
