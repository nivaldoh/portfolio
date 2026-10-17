// Pure logic for the recorded Total War replay: data types, time lookups and
// formatting. Shared by the server render and the browser; no DOM here.
//
// Rules carried over from the repository's offline report (replay.js):
// - Positions are never interpolated. At playback time T the map shows the
//   latest recorded sample with t <= T.
// - The decision in force at T is the one the game applied latest (t <= T,
//   ties go to the later reply). Its observation (obs_i) is the model's view.
// - "Waiting" counts from the observation behind the next reply that was asked
//   for but not yet applied (obs_t <= T < t).

/** [x, z, men, flags] (+ hp 0–1 for single-figure units), or null when absent. */
export type Sample = [number, number, number, number, number?] | null;

export const MELEE = 1;
export const FLEEING = 2;

export interface Unit {
  id: string;
  side: 'model' | 'ai';
  name: string;
  short: string;
  class: string;
  role: string | null;
  glyph: string;
  men0: number;
  commander: boolean;
  about: string | null;
}

export interface Order {
  unit: string;
  unitId: string;
  kind: string;
  action: string;
  status: string;
  error?: string;
  to?: [number, number];
  run?: boolean;
  target?: string;
  queued?: boolean;
  ability?: string;
  at?: [number, number];
}

export interface Decision {
  obs_t: number;
  obs_i: number;
  t: number | null;
  after_i: number | null;
  age_s: number | null;
  think_s: number | null;
  reply: string | null;
  orders: Order[];
  memo?: string;
}

export interface BattleEvent {
  t: number;
  kind: string;
  unit?: string;
  text: string;
}

export interface Note {
  t: number;
  start: number;
  end: number | null;
  title: string;
  text: string;
  units: string[];
  kind: string;
  feature: boolean;
}

export interface Replay {
  meta: {
    heading: string;
    model: string;
    effort: string;
    prompt: string;
    outcome: string;
    battle_s: number;
    recorded_on: string;
  };
  bounds: { xmin: number; xmax: number; zmin: number; zmax: number };
  terrain: {
    cell_m: number;
    x0: number;
    z0: number;
    rows: string[];
  } | null;
  units: Unit[];
  t: number[];
  pos: Record<string, Sample[]>;
  decisions: Decision[];
  events: BattleEvent[];
  notes: Note[];
  key_moment: { start: number; at: number; end: number | null; title: string } | null;
}

/** Index of the last element of a sorted list that is <= value, or -1. */
export function lastAtOrBefore<T>(list: readonly T[], value: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(list[mid]) <= value) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** The latest sample with t <= T (no interpolation); -1 before the first sample. */
export function sampleAt(times: readonly number[], T: number): number {
  return lastAtOrBefore(times, T, (t) => t);
}

/** Indices of the decisions the game applied, in order of application. */
export function appliedOrder(decisions: readonly Decision[]): number[] {
  return decisions
    .map((d, i) => [d.t, i] as const)
    .filter((pair): pair is readonly [number, number] => pair[0] != null)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([, i]) => i);
}

/** The decision in force at T (latest applied t <= T, ties to the later); -1 if none yet. */
export function decisionAt(decisions: readonly Decision[], applied: readonly number[], T: number): number {
  const k = lastAtOrBefore(applied, T, (i) => decisions[i].t as number);
  return k < 0 ? -1 : applied[k];
}

/** The next reply asked for but not yet applied at T (obs_t <= T < t); -1 if none. */
export function pendingAt(decisions: readonly Decision[], current: number, T: number): number {
  for (let j = current + 1; j < decisions.length; j++) {
    const d = decisions[j];
    if (d.obs_t > T) break;
    if (d.t == null || T < d.t) return j;
  }
  return -1;
}

/** The analyst note whose window holds T (latest start wins); -1 if none. */
export function noteAt(notes: readonly Note[], T: number): number {
  let found = -1;
  notes.forEach((n, k) => {
    const end = n.end ?? n.t + 20;
    if (n.start <= T && T <= end && (found < 0 || n.start >= notes[found].start)) found = k;
  });
  return found;
}

export interface Moment {
  /** Playback time, seconds on the battle clock. */
  T: number;
  /** Sample shown (latest t <= T). */
  i: number;
  /** Decision in force, -1 before the first applied reply. */
  k: number;
  /** Reply asked for but not yet applied, -1 if none. */
  pending: number;
  /** T - obs_t of the decision in force (age of the view behind it now). */
  viewAge: number | null;
  /** T - obs_t of the pending reply. */
  waiting: number | null;
  /** Analyst note whose window holds T, -1 if none. */
  note: number;
}

export function momentAt(r: Replay, applied: readonly number[], T: number): Moment {
  const i = Math.max(0, sampleAt(r.t, T));
  const k = decisionAt(r.decisions, applied, T);
  const pending = pendingAt(r.decisions, k, T);
  return {
    T,
    i,
    k,
    pending,
    viewAge: k < 0 ? null : T - r.decisions[k].obs_t,
    waiting: pending < 0 ? null : T - r.decisions[pending].obs_t,
    note: noteAt(r.notes, T),
  };
}

/** Battle clock m:ss (floored, as the game counts). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + 1e-6));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Battle clock with tenths, m:ss.t, for sequences a second apart. */
export function clockTenths(seconds: number): string {
  const tenths = Math.max(0, Math.floor(seconds * 10 + 1e-6));
  return `${clock(tenths / 10)}.${tenths % 10}`;
}

export const secondsText = (s: number) => `${(Math.round(s * 10) / 10).toFixed(1)} s`;

/** Raw unit ids (f2, e7) named in a reply, in order of first mention. */
export function idsIn(text: string | null, units: readonly Unit[]): Unit[] {
  if (!text) return [];
  const byId = new Map(units.map((u) => [u.id, u]));
  const seen: Unit[] = [];
  for (const m of text.matchAll(/\b([ef]\d+)\b/g)) {
    const u = byId.get(m[1]);
    if (u && !seen.includes(u)) seen.push(u);
  }
  return seen;
}
