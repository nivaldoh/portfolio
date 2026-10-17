// Playback for FlankTrace.astro. The server markup is the complete trace; this
// replays it from the same numbers: each route grows sample by sample (t <= T,
// never interpolated), enemy marks jump to their last-seen state at T, and the
// loop holds the full trace before starting again. No motion under reduced
// motion; pauses off-screen, in a hidden tab, or from the Pause toggle.
import { clock, lastAtOrBefore, sampleAt } from './replay-core';

/** Battle seconds per real second. */
const SPEED = 28;
/** Real seconds: the start before the routes move, and the full trace at the end. */
const LEAD_S = 0.8;
const HOLD_S = 4;

type Point = [number, number];

const ints = (s: string | undefined) => (s?.match(/-?\d+/g) ?? []).map(Number);

interface Route {
  el: SVGPathElement;
  dot: SVGGElement | null;
  /** Runs of joined samples: first sample index and absolute points. */
  runs: { i: number; pts: Point[] }[];
}

interface Enemy {
  el: SVGGElement;
  /** Changes of state, by sample index. */
  at: { i: number; x: number; y: number; flee: boolean; unseen: boolean }[];
}

function parseRoute(el: SVGPathElement, dot: SVGGElement | null): Route {
  const starts = ints(el.dataset.i);
  const runs: Route['runs'] = [];
  for (const sub of (el.getAttribute('d') ?? '').split('M').slice(1)) {
    const [abs, rel = ''] = sub.split('l');
    const [x, y] = ints(abs);
    const pts: Point[] = [[x, y]];
    const d = ints(rel);
    for (let j = 0; j + 1 < d.length; j += 2) {
      const [px, py] = pts[pts.length - 1];
      pts.push([px + d[j], py + d[j + 1]]);
    }
    runs.push({ i: starts[runs.length] ?? 0, pts });
  }
  return { el, dot, runs };
}

function parseEnemy(el: SVGGElement): Enemy {
  const n = ints(el.dataset.k);
  const at: Enemy['at'] = [];
  let i = 0;
  let x = 0;
  let y = 0;
  for (let j = 0; j + 2 < n.length; j += 3) {
    const code = n[j];
    i += code >> 2;
    x += n[j + 1];
    y += n[j + 2];
    at.push({ i, x, y, flee: (code & 1) !== 0, unseen: (code & 2) !== 0 });
  }
  return { el, at };
}

const place = (el: SVGGElement, p: Point | null) => {
  if (!p) {
    el.setAttribute('visibility', 'hidden');
    return;
  }
  el.removeAttribute('visibility');
  el.setAttribute('transform', `translate(${p[0]} ${p[1]})`);
};

export function enhance(root: HTMLElement) {
  const steps = ints(root.dataset.t);
  if (steps.length < 2 || root.hasAttribute('data-ft-ready')) return;
  root.setAttribute('data-ft-ready', '');
  let acc = 0;
  const times = steps.map((s) => (acc += s) / 10);
  const last = times.length - 1;
  const t0 = times[0];
  const playS = (times[last] - t0) / SPEED;
  const cycleS = LEAD_S + playS + HOLD_S;

  const dots = [...root.querySelectorAll<SVGGElement>('.ft__dot')];
  const routes = [...root.querySelectorAll<SVGPathElement>('.ft__route')].map((el, j) =>
    parseRoute(el, dots[j] ?? null)
  );
  const enemies = [...root.querySelectorAll<SVGGElement>('.ft__ai')].map(parseEnemy);
  const clockEl = root.querySelector<HTMLElement>('[data-clock]');
  const button = root.querySelector<HTMLButtonElement>('[data-pause]');
  const buttonLabel = button?.querySelector<HTMLElement>('[data-pause-label]');
  const spanText = clockEl?.dataset.span ?? '';

  /** Draw the state at sample k (k = last: the complete trace, as the server drew it). */
  function draw(k: number) {
    for (const r of routes) {
      let d = '';
      let now: Point | null = null;
      for (const run of r.runs) {
        const n = Math.min(run.pts.length, k - run.i + 1);
        if (n <= 0) break;
        const pts = run.pts.slice(0, n);
        d += `M${pts.map((p) => p.join(' ')).join('L')}`;
        now = pts[n - 1];
      }
      r.el.setAttribute('d', d);
      if (r.dot) place(r.dot, now);
    }
    for (const e of enemies) {
      const j = lastAtOrBefore(e.at, k, (a) => a.i);
      const s = j < 0 ? null : e.at[j];
      place(e.el, s ? [s.x, s.y] : null);
      e.el.classList.toggle('is-fleeing', !!s?.flee);
      e.el.classList.toggle('is-unseen', !!s?.unseen);
    }
  }

  // Cycle position, real seconds: [lead at the first sample][replay][hold on the full trace].
  // Playback starts from the beginning; the full trace is the server's still.
  const holdAt = LEAD_S + playS;
  let c = 0;
  let shown = -1;
  let shownClock = '';
  let playing = false;
  let raf = 0;
  let prev = 0;
  let userPaused = false;
  let inView = false;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  function frame() {
    let k = last;
    let text = spanText;
    if (c < LEAD_S + playS) {
      const T = t0 + Math.max(0, c - LEAD_S) * SPEED;
      k = Math.max(0, sampleAt(times, T));
      text = clock(T);
    }
    if (k !== shown) {
      draw(k);
      shown = k;
    }
    if (clockEl && text !== shownClock) {
      clockEl.textContent = text;
      shownClock = text;
    }
    if (playing !== (text !== spanText)) {
      playing = !playing;
      root.toggleAttribute('data-playing', playing);
    }
  }

  function tick(now: number) {
    // A frame's step is capped, so a stalled tab resumes where it left off.
    c = (c + Math.min(0.1, Math.max(0, now - prev) / 1000)) % cycleS;
    prev = now;
    frame();
    raf = requestAnimationFrame(tick);
  }

  function update() {
    const run = !reduce.matches && !userPaused && inView && !document.hidden;
    if (run && !raf) {
      prev = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function setMotion() {
    if (reduce.matches) {
      // The complete trace, still, as without script.
      c = holdAt;
      frame();
      if (button) button.hidden = true;
    } else if (button) button.hidden = false;
    update();
  }

  button?.addEventListener('click', () => {
    userPaused = !userPaused;
    button.toggleAttribute('data-paused', userPaused);
    if (buttonLabel) buttonLabel.textContent = userPaused ? 'Play' : 'Pause';
    update();
  });

  // Plays while at least a fifth of the figure is on screen.
  new IntersectionObserver(
    (entries) => {
      inView = entries[entries.length - 1].intersectionRatio >= 0.19;
      update();
    },
    { threshold: [0, 0.2] }
  ).observe(root);
  document.addEventListener('visibilitychange', update);
  reduce.addEventListener('change', setMotion);
  setMotion();
}
