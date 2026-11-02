// Playback for CheckpointBranches.astro. The server markup is the finished figure; this
// fetches the same recorded data and replays all four futures together from the save:
// trails grow sample by sample (never interpolated), markers sit at the latest sample,
// and each panel shows its engine ending once the battle clock passes it. No motion
// under reduced motion; pauses off-screen, in a hidden tab, or from the Pause toggle.
import { clock } from './replay-core';
import { frameFor, indexAt, radius, stateAt, trail, type BranchData } from './branches';

/** Battle seconds per real second. */
const SPEED = 10;
/** Real seconds: still on the saved moment before playing, and on the endings after. */
const LEAD_S = 1.2;
const HOLD_S = 4;

export function initBranches(root: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const src = root.dataset.src;
  if (!src) return;
  let started = false;
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting) || started) return;
    started = true;
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: BranchData) => play(root, d))
      .catch(() => { /* the finished figure stays */ });
  }, { rootMargin: '200px' });
  io.observe(root);
}

function play(root: HTMLElement, d: BranchData) {
  const fr = frameFor(d);
  const t0 = d.save_ms;
  const t1 = Math.max(...d.futures.map((f) => f.end_ms));
  const span = (t1 - t0) / 1000 / SPEED + LEAD_S + HOLD_S;
  const now = root.querySelector<HTMLElement>('[data-cb-now]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-cb-toggle]');
  const men0 = Object.fromEntries(d.units.map((u) => [u.id, u.men0]));

  const panels = d.futures.map((f, k) => {
    const el = root.querySelector<HTMLElement>(`[data-cb-panel="${k}"]`)!;
    return {
      f,
      stamp: el.querySelector<HTMLElement>('[data-cb-stamp]'),
      trails: Object.fromEntries([...el.querySelectorAll<SVGPathElement>('.cb__trail')].map((p) => [p.dataset.u!, p])),
      units: Object.fromEntries([...el.querySelectorAll<SVGGElement>('.cb__unit')].map((g) => [g.dataset.u!, g])),
      last: -2,
    };
  });

  let paused = false;
  let visible = true;
  let elapsed = 0; // real seconds into the loop
  let prev: number | null = null;

  function draw(T: number) {
    if (now) now.textContent = clock(T / 1000);
    for (const p of panels) {
      const i = indexAt(p.f.t, Math.min(T, p.f.end_ms));
      if (i === p.last) continue;
      p.last = i;
      for (const [id, path] of Object.entries(p.trails)) path.setAttribute('d', trail(fr, p.f.pos[id], i));
      for (const [id, g] of Object.entries(p.units)) {
        const s = stateAt(p.f.pos[id], Math.max(0, i));
        if (!s) continue;
        const r = radius(s[2], men0[id]);
        g.setAttribute('transform', `translate(${s[0] - fr.x0} ${fr.z1 - s[1]})`);
        g.classList.toggle('cb__unit--flee', s[3] === 1);
        const mk = g.firstElementChild as SVGElement | null;
        if (mk?.tagName === 'circle') mk.setAttribute('r', String(r));
        else if (mk?.tagName === 'rect') {
          mk.setAttribute('x', String(-r * 0.85)); mk.setAttribute('y', String(-r * 0.85));
          mk.setAttribute('width', String(r * 1.7)); mk.setAttribute('height', String(r * 1.7));
        } else if (mk) mk.setAttribute('d', `M0 ${-r}L${r} 0 0 ${r}${-r} 0z`);
      }
      if (p.stamp) p.stamp.toggleAttribute('data-hidden', T < p.f.end_ms);
    }
  }

  function frame(ts: number) {
    if (prev !== null && !paused && visible) elapsed = (elapsed + (ts - prev) / 1000) % span;
    prev = ts;
    const T = t0 + Math.max(0, elapsed - LEAD_S) * SPEED * 1000;
    draw(Math.min(T, t1));
    requestAnimationFrame(frame);
  }

  new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting) && !document.hidden;
  }).observe(root);
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; });

  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      paused = !paused;
      toggle.textContent = paused ? 'Play' : 'Pause';
      toggle.setAttribute('aria-pressed', String(paused));
    });
  }
  requestAnimationFrame(frame);
}
