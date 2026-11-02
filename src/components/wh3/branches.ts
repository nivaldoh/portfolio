// Shared geometry for CheckpointBranches: the server draws the finished figure from
// these functions and the client redraws it at each playback time from the same data
// (public/media/game-agents/wh3-checkpoint-branches.json, scripts/export_wh3_branches.py).
// Positions are drawn as recorded: the latest sample at or before the time, never
// interpolated. North is up (screen y = -z).

/** [x, z, men, fleeing] or null (enemy not visible, or destroyed). */
export type Pos = [number, number, number, number] | null;

export interface Series {
  t: number[];
  pos: Record<string, Pos[]>;
}

export interface Future extends Series {
  id: string;
  label: string;
  result: 'won' | 'lost' | string;
  end_ms: number;
  same_as: { attempt: string; order: string }[];
}

export interface BranchData {
  save_ms: number;
  units: { id: string; side: 'model' | 'ai'; name: string; men0: number }[];
  trunk: Series;
  futures: Future[];
}

export interface Frame {
  x0: number;
  z1: number;
  side: number;
}

/** A square crop around every position after the save, plus a margin (metres). */
export function frameFor(d: BranchData, margin = 28): Frame {
  let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (const f of d.futures) {
    for (const list of Object.values(f.pos)) {
      for (const p of list) {
        if (!p) continue;
        xmin = Math.min(xmin, p[0]); xmax = Math.max(xmax, p[0]);
        zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]);
      }
    }
  }
  const side = Math.ceil(Math.max(xmax - xmin, zmax - zmin) + 2 * margin);
  return { x0: Math.round((xmin + xmax) / 2 - side / 2), z1: Math.round((zmin + zmax) / 2 + side / 2), side };
}

/** Index of the latest sample at or before T, or -1. */
export function indexAt(t: readonly number[], T: number): number {
  let lo = 0, hi = t.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= T) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return best;
}

/** SVG path through a unit's samples 0..last; gaps (null) break the line. */
export function trail(fr: Frame, list: readonly Pos[], last: number, from = 0): string {
  let d = '';
  let open = false;
  for (let i = from; i <= last && i < list.length; i++) {
    const p = list[i];
    if (!p) { open = false; continue; }
    d += `${open ? 'L' : 'M'}${p[0] - fr.x0} ${fr.z1 - p[1]}`;
    open = true;
  }
  return d;
}

/** The unit's latest recorded state at sample index i (searching back over gaps). */
export function stateAt(list: readonly Pos[], i: number): Pos {
  for (let j = Math.min(i, list.length - 1); j >= 0; j--) if (list[j]) return list[j];
  return null;
}

/** Marker radius from the unit's remaining men (area ~ men). */
export const radius = (men: number, men0: number) => 6 + 10 * Math.sqrt(Math.max(0, men) / men0);
