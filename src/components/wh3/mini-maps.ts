// Small synced battle maps, drawn from one function so the static figure and the playback
// cannot disagree. Data comes from scripts/export_wh3_suite.py. Positions are drawn as
// recorded: the latest sample at or before the time, never interpolated. Colour is who
// controls a unit; shape is its kind. Classes are styled in global.css (.mm).
import { indexAt } from './branches';

/** [x, z, 1 if no longer fighting] or null (no men left, or an enemy nobody can see). */
export type MapPos = [number, number, number] | null;

export interface MapUnit {
  id: string;
  hue: string;
  shape: 'infantry' | 'guns' | 'knights' | 'enemy';
}

export interface MapPanel {
  id: string;
  result?: string;
  end_ms: number;
  t: number[];
  units: MapUnit[];
  pos: Record<string, MapPos[]>;
}

export interface MapSet {
  frame: { x0: number; z1: number; side: number };
  blocked: string;
  panels: MapPanel[];
}

export const endOf = (set: MapSet) => Math.max(...set.panels.map((p) => p.end_ms));

function marker(shape: MapUnit['shape'], x: number, y: number, r: number, cls: string): string {
  const at = `${x} ${y}`;
  if (shape === 'guns') return `<path class="${cls}" d="M${x} ${y - 1.15 * r}l${1.1 * r} ${2 * r}h${-2.2 * r}z"/>`;
  if (shape === 'knights') return `<path class="${cls}" d="M${x - r} ${y - r}h${2 * r}v${2 * r}h${-2 * r}z"/>`;
  if (shape === 'enemy') return `<path class="${cls}" d="M${x} ${y - 1.2 * r}l${1.2 * r} ${1.2 * r}${-1.2 * r} ${1.2 * r}${-1.2 * r}${-1.2 * r}z"/>`;
  return `<circle class="${cls}" transform="translate(${at})" r="${r}"/>`;
}

/** One map at battle time T (ms). Friendly units leave a path while they are fighting. */
export function mapSvg(set: MapSet, p: MapPanel, T: number): string {
  const { x0, z1, side } = set.frame;
  const r = Math.round(side * 0.024 * 10) / 10;
  const last = indexAt(p.t, Math.min(T, p.end_ms));
  let paths = '';
  let marks = '';
  for (const u of p.units) {
    const list = p.pos[u.id];
    if (u.shape !== 'enemy') {
      let d = '';
      let open = false;
      for (let i = 0; i <= last; i += i + 2 > last && i < last ? last - i : 2) {
        const s = list[i];
        if (!s || s[2]) { open = false; continue; }
        d += `${open ? 'L' : 'M'}${s[0] - x0} ${z1 - s[1]}`;
        open = true;
      }
      if (d) paths += `<path class="mm-${u.hue} mm-path" d="${d}"/>`;
    }
    const s = last >= 0 ? list[last] : null;
    if (s) marks += marker(u.shape, s[0] - x0, z1 - s[1], r, `mm-${u.hue} mm-unit${s[2] ? ' mm-flee' : ''}`);
  }
  const ground = set.blocked ? `<path class="mm-blocked" d="${set.blocked}"/>` : '';
  return `<svg class="mm" viewBox="0 0 ${side} ${side}" aria-hidden="true">${ground}${paths}${marks}</svg>`;
}

export interface Slot {
  map: HTMLElement;
  panel: MapPanel;
  stamp?: HTMLElement | null;
}

/** Plays every slot on one clock in a loop; pauses off-screen and in a hidden tab. */
export function playMaps(
  root: HTMLElement,
  set: MapSet,
  slots: Slot[],
  now: HTMLElement | null,
  clock: (s: number) => string,
  speed: number,
  { lead = 0.8, hold = 4 } = {},
) {
  const end = endOf(set);
  const span = end / 1000 / speed + lead + hold;
  const seen = slots.map(() => -2);
  let paused = false;
  let visible = true;
  let stopped = false;
  let elapsed = 0;
  let prev: number | null = null;

  const io = new IntersectionObserver((entries) => {
    visible = entries.some((e) => e.isIntersecting);
  });
  io.observe(root);

  function draw(T: number) {
    if (now) now.textContent = clock(T / 1000);
    slots.forEach((s, k) => {
      const i = indexAt(s.panel.t, Math.min(T, s.panel.end_ms));
      if (i !== seen[k]) {
        seen[k] = i;
        s.map.innerHTML = mapSvg(set, s.panel, T);
      }
      s.stamp?.toggleAttribute('hidden', T < s.panel.end_ms);
    });
  }

  function frame(ts: number) {
    if (stopped) return;
    if (prev !== null && !paused && visible && !document.hidden) elapsed = (elapsed + (ts - prev) / 1000) % span;
    prev = ts;
    draw(Math.min(Math.max(0, elapsed - lead) * speed * 1000, end));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    toggle() { paused = !paused; return paused; },
    setPaused(value: boolean) { paused = value; },
    stop() { stopped = true; io.disconnect(); },
  };
}
