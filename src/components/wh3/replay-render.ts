// Markup for the replay, as strings, so the server's first paint and the
// browser's later frames come from the same code. Map units are metres:
// x grows east, z grows north, drawn north up (screen y = zmax - z).
import {
  FLEEING,
  MELEE,
  clock,
  clockTenths,
  idsIn,
  lastAtOrBefore,
  secondsText,
  type Moment,
  type Replay,
  type Sample,
  type Unit,
} from './replay-core';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();

/** Marker sizes in map units at --mk: 1 (the CSS scales them on narrow maps). */
const R_MODEL = 7.5;
const R_AI = 9.5;
const R_RING = 12.5;
const R_TARGET = 16;
const LABEL_FS = 12.5;
/** Observed movement drawn brighter behind each unit, seconds. */
export const RECENT_S = 20;
/** The model's view joins an outline to the unit when they differ by this much. */
const VIEW_MIN_M = 3;
/** Positions further apart in time than this are not joined (1.5 × the 1 s interval). */
const GAP_S = 1.5;

export interface Frame {
  w: number;
  h: number;
  X: (x: number) => number;
  Y: (z: number) => number;
}

export function frameOf(r: Replay): Frame {
  const b = r.bounds;
  return {
    w: b.xmax - b.xmin,
    h: b.zmax - b.zmin,
    X: (x) => x - b.xmin,
    Y: (z) => b.zmax - z,
  };
}

export const viewBox = (fr: Frame) => `0 0 ${f1(fr.w)} ${f1(fr.h)}`;

const shape = (side: Unit['side'], r = side === 'model' ? R_MODEL : R_AI) =>
  side === 'model' ? `<circle r="${r}"/>` : `<path d="M0 ${-r}L${r} 0 0 ${r}${-r} 0Z"/>`;

const rOf = (side: Unit['side']) => (side === 'model' ? R_MODEL : R_AI);

/* ------------------------------------------------------------------ */
/* Static ground: field, terrain, grid, scale bar and north.           */
/* ------------------------------------------------------------------ */

export function groundSVG(r: Replay): string {
  const fr = frameOf(r);
  let out = `<rect class="m-field" width="${f1(fr.w)}" height="${f1(fr.h)}"/>`;

  // Faint 100 m grid.
  const b = r.bounds;
  let grid = '';
  for (let x = Math.ceil(b.xmin / 100) * 100; x <= b.xmax; x += 100)
    grid += `M${f1(fr.X(x))} 0V${f1(fr.h)}`;
  for (let z = Math.ceil(b.zmin / 100) * 100; z <= b.zmax; z += 100)
    grid += `M0 ${f1(fr.Y(z))}H${f1(fr.w)}`;
  out += `<path class="m-grid" d="${grid}"/>`;

  // Restricted ground: '#' cells, merged into runs along each row.
  const t = r.terrain;
  if (t) {
    let d = '';
    const c = t.cell_m;
    const clampX = (x: number) => Math.min(fr.w, Math.max(0, x));
    const clampY = (y: number) => Math.min(fr.h, Math.max(0, y));
    t.rows.forEach((row, j) => {
      const top = clampY(fr.Y(t.z0 + j * c + c / 2));
      const bottom = clampY(fr.Y(t.z0 + j * c - c / 2));
      if (bottom <= top) return;
      for (let i = 0; i < row.length; i++) {
        if (row[i] !== '#') continue;
        let n = 1;
        while (row[i + n] === '#') n++;
        const left = clampX(fr.X(t.x0 + i * c - c / 2));
        const right = clampX(fr.X(t.x0 + (i + n) * c - c / 2));
        if (right > left) d += `M${f1(left)} ${f1(top)}H${f1(right)}V${f1(bottom)}H${f1(left)}z`;
        i += n - 1;
      }
    });
    out += `<path class="m-terrain" d="${d}"/>`;
  }
  return out;
}

/** Scale bar (200 m) and north indicator, bottom right; drawn above the units. */
export function furnitureSVG(r: Replay): string {
  const fr = frameOf(r);
  const len = 200;
  const right = fr.w - 46;
  const y = fr.h - 20;
  const x0 = right - len;
  return (
    `<g class="m-furn" aria-hidden="true">` +
    `<path class="m-bar" d="M${f1(x0)} ${y - 5}v5h${len}v-5"/>` +
    `<g transform="translate(${f1(x0 + len / 2)} ${y})"><g class="mk"><text class="m-furn-t" y="-8" text-anchor="middle">200 m</text></g></g>` +
    `<g transform="translate(${f1(fr.w - 20)} ${y})"><g class="mk"><path class="m-north" d="M0 -27l5.5 12h-11z"/><text class="m-furn-t" y="0" text-anchor="middle">N</text></g></g>` +
    `</g>`
  );
}

/* ------------------------------------------------------------------ */
/* Dynamic layer: trails, the model's view, routes, units, labels.      */
/* ------------------------------------------------------------------ */

const placed = (p: Sample | undefined): p is NonNullable<Sample> => p != null;

/** Last sample at or before i where the unit was recorded, and its index. */
function lastSeen(r: Replay, id: string, i: number): { p: NonNullable<Sample>; j: number } | null {
  const s = r.pos[id];
  for (let j = i; j >= 0; j--) if (placed(s[j])) return { p: s[j] as NonNullable<Sample>, j };
  return null;
}

function stateWords(u: Unit, p: NonNullable<Sample>): string {
  const bits: string[] = [];
  if (u.men0 > 1) bits.push(`${p[2]} of ${u.men0} soldiers`);
  else if (p[4] != null) bits.push(`health ${Math.round(p[4] * 100)}%`);
  if (p[3] & FLEEING) bits.push('fleeing');
  if (p[3] & MELEE) bits.push('in melee');
  return bits.join(', ');
}

const sideName = (r: Replay, u: Unit) => (u.side === 'model' ? `${r.meta.model}’s army` : 'game AI');

interface LabelItem {
  id: string;
  x: number;
  y: number;
  r: number;
  text: string;
  note: string;
  cls: string;
  rank: number;
}

type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Short labels beside their markers, avoiding other markers and labels; leader lines when
 * pushed out. A label that finds no free place is hidden (shown on hover; the full name is
 * always in the marker's title and the unit list). */
function labelsSVG(items: LabelItem[], blocks: Box[], fr: Frame, mk: number): string {
  const fs = LABEL_FS * mk;
  const taken = [...blocks];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0.7, -0.7],
    [0.7, 0.7],
    [0, -1],
    [0, 1],
    [-0.7, -0.7],
    [-0.7, 0.7],
  ];
  let out = '';
  for (const l of items.sort((a, b) => a.rank - b.rank)) {
    const w = (l.text.length * 0.62 + (l.note ? l.note.length * 0.47 : 0)) * fs + 4 * mk;
    const h = fs * 1.05;
    let choice: { box: Box; lead: boolean; d: number[] } | null = null;
    for (const gap of [2.5, 14]) {
      for (const d of dirs) {
        const dist = l.r + gap * mk;
        const ax = l.x + d[0] * dist;
        const ay = l.y + d[1] * dist;
        // Anchor the box by its edge nearest the marker.
        const bx = d[0] > 0.1 ? ax : d[0] < -0.1 ? ax - w : ax - w / 2;
        const by = d[1] > 0.1 ? ay : d[1] < -0.1 ? ay - h : ay - h / 2;
        const box: Box = [bx, by, bx + w, by + h];
        if (box[0] < 2 || box[1] < 2 || box[2] > fr.w - 2 || box[3] > fr.h - 2) continue;
        if (taken.some((t) => overlaps(box, t))) continue;
        choice = { box, lead: gap > 3, d };
        break;
      }
      if (choice) break;
    }
    const note = l.note ? `<tspan class="lbl-n">${esc(l.note)}</tspan>` : '';
    if (!choice) {
      out += `<g class="lbl is-off" data-u="${l.id}" transform="translate(${f1(l.x)} ${f1(l.y)})"><g class="mk"><text class="lbl-t ${l.cls}" x="${f1(l.r / mk + 2.5)}" y="${f1(LABEL_FS * 0.35)}">${esc(l.text)}${note}</text></g></g>`;
      continue;
    }
    taken.push(choice.box);
    // Local coordinates inside the scaled group around the marker.
    const lx = (choice.box[0] - l.x) / mk + 1;
    const ly = (choice.box[1] - l.y) / mk + LABEL_FS * 0.8;
    let lead = '';
    if (choice.lead) {
      const cx = (choice.box[0] + choice.box[2]) / 2;
      const cy = (choice.box[1] + choice.box[3]) / 2;
      const ex = Math.max(choice.box[0], Math.min(l.x, choice.box[2]));
      const ey = Math.max(choice.box[1], Math.min(l.y, choice.box[3]));
      const tx = choice.d[0] === 0 ? cx : ex;
      const ty = choice.d[1] === 0 ? cy : ey;
      const len = Math.hypot(tx - l.x, ty - l.y) || 1;
      const sx = l.x + ((tx - l.x) / len) * (l.r + 1.5 * mk);
      const sy = l.y + ((ty - l.y) / len) * (l.r + 1.5 * mk);
      lead = `<line class="lbl-lead" x1="${f1((sx - l.x) / mk)}" y1="${f1((sy - l.y) / mk)}" x2="${f1((tx - l.x) / mk)}" y2="${f1((ty - l.y) / mk)}"/>`;
    }
    out += `<g class="lbl" data-u="${l.id}" transform="translate(${f1(l.x)} ${f1(l.y)})"><g class="mk">${lead}<text class="lbl-t ${l.cls}" x="${f1(lx)}" y="${f1(ly)}">${esc(l.text)}${note}</text></g></g>`;
  }
  return out;
}

function polyline(points: [number, number][], cls: string): string {
  if (points.length < 2) return '';
  return `<polyline class="${cls}" points="${points.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ')}"/>`;
}

/** Observed positions of one unit between two sample indices, split at gaps and absences. */
function pieces(r: Replay, fr: Frame, id: string, from: number, to: number): [number, number][][] {
  const s = r.pos[id];
  const out: [number, number][][] = [];
  let piece: [number, number][] = [];
  let prevT = -Infinity;
  for (let j = Math.max(0, from); j <= to; j++) {
    const p = s[j];
    if (!placed(p) || r.t[j] - prevT > GAP_S) {
      if (piece.length > 1) out.push(piece);
      piece = [];
    }
    if (placed(p)) {
      piece.push([fr.X(p[0]), fr.Y(p[1])]);
      prevT = r.t[j];
    }
  }
  if (piece.length > 1) out.push(piece);
  return out;
}

export interface MapOptions {
  /** Show the model's view: outlines and the issued orders of the decision in force. */
  view: boolean;
  /** Marker scale actually applied by CSS (for label placement). */
  mk: number;
}

export function unitsSVG(r: Replay, m: Moment, opts: MapOptions): string {
  const fr = frameOf(r);
  const { i } = m;
  const mk = opts.mk;
  const units = r.units;
  const recentFrom = lastAtOrBefore(r.t, r.t[i] - RECENT_S, (t) => t);
  let trails = '';
  let recent = '';
  for (const u of units) {
    // The model's army keeps its whole route (it shows the flank); the enemy only recent movement.
    if (u.side === 'model') for (const p of pieces(r, fr, u.id, 0, i)) trails += polyline(p, `tr tr--${u.side}`);
    for (const p of pieces(r, fr, u.id, Math.max(0, recentFrom), i))
      recent += polyline(p, `tr-now tr--${u.side}`);
  }

  // The model's view: where units stood in the observation behind the decision in force.
  let view = '';
  let routes = '';
  if (opts.view && m.k >= 0) {
    const d = r.decisions[m.k];
    const basis = d.obs_i;
    for (const u of units) {
      const then = r.pos[u.id][basis];
      if (!placed(then)) continue;
      const now = r.pos[u.id][i];
      const x0 = fr.X(then[0]);
      const y0 = fr.Y(then[1]);
      if (placed(now) && Math.hypot(now[0] - then[0], now[1] - then[1]) >= VIEW_MIN_M)
        view += `<line class="v-line" x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(fr.X(now[0]))}" y2="${f1(fr.Y(now[1]))}"/>`;
      view += `<g class="v" transform="translate(${f1(x0)} ${f1(y0)})"><g class="mk">${shape(u.side)}</g></g>`;
    }

    // Issued orders of that reply, from where the model saw each unit.
    const byUnit = new Map<string, typeof d.orders>();
    for (const o of d.orders) {
      if (!byUnit.has(o.unitId)) byUnit.set(o.unitId, []);
      byUnit.get(o.unitId)!.push(o);
    }
    for (const [id, orders] of byUnit) {
      const start = r.pos[id]?.[basis];
      if (!placed(start)) continue;
      let at: [number, number] = [fr.X(start[0]), fr.Y(start[1])];
      let route: [number, number][] = [at];
      let failed = false;
      for (const o of orders) {
        if (o.kind === 'move' && o.to) {
          const p: [number, number] = [fr.X(o.to[0]), fr.Y(o.to[1])];
          if (o.status === 'rejected' || failed) {
            failed = true;
            routes += polyline([at, p], 'rt-bad');
            routes += `<g transform="translate(${f1(p[0])} ${f1(p[1])})"><g class="mk"><path class="rt-x" d="M-5 -5l10 10m0-10l-10 10"/></g></g>`;
          } else {
            route.push(p);
            at = p;
            routes += `<g transform="translate(${f1(p[0])} ${f1(p[1])})"><g class="mk"><circle class="rt-wp" r="2.6"/></g></g>`;
          }
        } else if (o.kind === 'attack' && o.target && o.status !== 'rejected' && !failed) {
          const seen = lastSeen(r, o.target, i);
          if (!seen) continue;
          const tp: [number, number] = [fr.X(seen.p[0]), fr.Y(seen.p[1])];
          routes += polyline([at, tp], 'rt-atk');
          routes += `<g transform="translate(${f1(tp[0])} ${f1(tp[1])})"><g class="mk"><circle class="rt-tgt" r="${R_TARGET}"/></g></g>`;
        }
      }
      if (route.length > 1) routes = polyline(route, 'rt-move') + routes;
      route = [];
    }
  }

  // Units: current positions, and enemies out of sight where they were last seen.
  let ghosts = '';
  let markers = '';
  const labels: LabelItem[] = [];
  const blocks: Box[] = [];
  units.forEach((u, n) => {
    const p = r.pos[u.id][i];
    if (placed(p)) {
      const x = fr.X(p[0]);
      const y = fr.Y(p[1]);
      const melee = (p[3] & MELEE) !== 0;
      const fleeing = (p[3] & FLEEING) !== 0;
      const cls = `u u--${u.side}${melee ? ' is-melee' : ''}${fleeing ? ' is-fleeing' : ''}`;
      const title = `${u.name}, ${sideName(r, u)}: ${stateWords(u, p)}`;
      markers += `<g class="${cls}" data-u="${u.id}" transform="translate(${f1(x)} ${f1(y)})"><title>${esc(title)}</title><g class="mk">${melee ? `<circle class="u-ring" r="${R_RING}"/>` : ''}${shape(u.side)}</g></g>`;
      const rr = (melee ? R_RING : rOf(u.side)) * mk;
      blocks.push([x - rr, y - rr, x + rr, y + rr]);
      labels.push({
        id: u.id,
        x,
        y,
        r: rr,
        text: u.short,
        note: fleeing ? ' fleeing' : '',
        cls: `lbl-t--${u.side}`,
        rank: (u.side === 'model' ? 0 : 100) + n,
      });
    } else if (u.side === 'ai') {
      const seen = lastSeen(r, u.id, i);
      if (!seen) return;
      const x = fr.X(seen.p[0]);
      const y = fr.Y(seen.p[1]);
      const title = `${u.name}, game AI: out of sight of ${r.meta.model}’s army; last seen at ${clock(r.t[seen.j])}`;
      ghosts += `<g class="u u--ai is-unseen" data-u="${u.id}" transform="translate(${f1(x)} ${f1(y)})"><title>${esc(title)}</title><g class="mk">${shape(u.side)}</g></g>`;
      const rr = R_AI * mk;
      blocks.push([x - rr, y - rr, x + rr, y + rr]);
      labels.push({
        id: u.id,
        x,
        y,
        r: rr,
        text: u.short,
        note: ` seen ${clock(r.t[seen.j])}`,
        cls: 'lbl-t--ai is-unseen',
        rank: 200 + n,
      });
    }
  });
  // Keep the scale bar and north indicator clear of labels.
  blocks.push([fr.w - 260, fr.h - 52 * Math.max(1, mk * 0.8), fr.w, fr.h]);

  return (
    `<g class="m-trails">${trails}</g><g class="m-recent">${recent}</g>` +
    `<g class="m-view">${view}</g><g class="m-routes">${routes}</g>` +
    `<g class="m-units">${ghosts}${markers}</g>` +
    `<g class="m-labels">${labelsSVG(labels, blocks, fr, mk)}</g>`
  );
}

/** Plain list of every unit's state at the shown sample, for screen readers. */
export function unitListHTML(r: Replay, m: Moment): string {
  return r.units
    .map((u) => {
      const p = r.pos[u.id][m.i];
      if (placed(p)) return `<li>${esc(`${u.short}, ${u.name} (${sideName(r, u)}): ${stateWords(u, p)}`)}</li>`;
      if (u.side === 'ai') {
        const seen = lastSeen(r, u.id, m.i);
        return `<li>${esc(`${u.short}, ${u.name} (game AI): out of sight${seen ? `, last seen at ${clock(r.t[seen.j])}` : ''}`)}</li>`;
      }
      return `<li>${esc(`${u.short}, ${u.name} (${sideName(r, u)}): not recorded`)}</li>`;
    })
    .join('');
}

export const mapLabel = (r: Replay, m: Moment) =>
  `Battle map at ${clock(m.T)} of ${clock(end(r))}: ${r.meta.model}’s units as circles, the game AI’s as diamonds.`;

/* ------------------------------------------------------------------ */
/* Panel                                                              */
/* ------------------------------------------------------------------ */

export const start = (r: Replay) => r.t[0];
export const end = (r: Replay) => r.t[r.t.length - 1];
export const timeText = (r: Replay, T: number) => `${clock(T)} / ${clock(end(r))}`;
export const timeValueText = (r: Replay, T: number) => `${clock(T)} of ${clock(end(r))}`;

export function decisionHTML(r: Replay, m: Moment): string {
  if (m.k < 0) {
    const first = r.decisions[0];
    const firstApplied = r.decisions
      .filter((d) => d.t != null)
      .reduce<number | null>((t, d) => t == null ? d.t : Math.min(t, d.t!), null);
    if (!first) return '<p class="p-empty">No model replies were recorded for this battle.</p>';
    return (
      `<p class="p-empty">No reply has reached the game yet. The model was first asked at ${clock(first.obs_t)}. ` +
      (firstApplied == null ? 'No applied reply was recorded.' : `The first reply reached the game at ${clock(firstApplied)}.`) + '</p>'
    );
  }
  const d = r.decisions[m.k];
  const applied = d.t as number;
  const named = idsIn(d.reply, r.units);
  const ids = named.length
    ? `<p class="p-ids">In this reply: ${named.map((u) => `${u.id} = ${esc(u.name)}`).join(', ')}</p>`
    : '';
  const orders = d.orders.length
    ? `<ul class="p-orders">${d.orders
        .map((o) => {
          const rejected = o.status === 'rejected';
          const status = rejected
            ? `<span class="p-status p-status--bad">Rejected${o.error ? `: ${esc(o.error)}` : ''}</span>`
            : o.status === 'queued'
              ? `<span class="p-status">queued after the step before</span>`
              : o.status === 'acknowledged'
                ? ''
                : `<span class="p-status">${esc(o.status)}</span>`;
          return `<li${rejected ? ' class="is-rejected"' : ''}><span class="p-unit">${esc(o.unit)}</span> — <span class="p-act">${esc(o.action)}</span>${status ? ` ${status}` : ''}</li>`;
        })
        .join('')}</ul>`
    : `<p class="p-none">No new orders in this reply.</p>`;
  const memo = d.memo
    ? `<details class="p-memo"><summary>Its battle notes, rewritten in this reply</summary><p>${esc(d.memo)}</p></details>`
    : '';
  const reply = d.reply
    ? `<figure class="p-reply"><figcaption>The model’s stated reason</figcaption><blockquote><p>“${esc(d.reply)}”</p></blockquote></figure>${ids}`
    : `<p class="p-none">No reason was recorded with this reply.</p>`;
  return (
    `<p class="p-applied"><span>Orders applied at <strong>${clock(applied)}</strong></span><span class="p-count">reply ${m.k + 1} of ${r.decisions.length}</span></p>` +
    reply +
    `<p class="p-h">Orders</p>${orders}` +
    `<p class="p-age">Acted on a view <strong>${secondsText(d.age_s ?? applied - d.obs_t)} old</strong>. ` +
    `<span>The battle kept running between the observation the model was given (${clockTenths(d.obs_t)}) and the game applying its reply (${clockTenths(applied)}).</span></p>` +
    memo
  );
}

export function waitingText(r: Replay, m: Moment): string {
  if (m.pending < 0) return '';
  const d = r.decisions[m.pending];
  if (d.t == null && m.T >= end(r))
    return `The battle ended before the reply asked for at ${clock(d.obs_t)} was applied.`;
  const which = m.k < 0 ? 'first' : 'next';
  const s = m.waiting ?? 0;
  if (s < 0.05) return `Asking the model for its ${which} reply.`;
  return `Waiting ${secondsText(s)} for the model’s ${which} reply.`;
}

export function viewText(m: Moment): string {
  if (m.viewAge == null) return 'Outlines appear once the first reply reaches the game.';
  return `Outlines: where units stood ${secondsText(m.viewAge)} ago, in the view behind the latest reply.`;
}

export function noteHTML(r: Replay, m: Moment): string {
  if (m.note < 0) return '';
  const n = r.notes[m.note];
  return (
    `<p class="p-note-label">Analyst note (an interpretation written after the battle)</p>` +
    `<p class="p-note-title">${esc(n.title)}</p><p class="p-note-text">${esc(n.text)}</p>`
  );
}

/** Announcement for the live region when the decision changes by stepping or seeking. */
export function announceText(r: Replay, m: Moment): string {
  if (m.k < 0) return `${clock(m.T)}. No reply has reached the game yet.`;
  const d = r.decisions[m.k];
  const n = d.orders.length;
  return `${clock(m.T)}. Reply ${m.k + 1}, applied at ${clock(d.t as number)}: ${d.reply ?? 'no reason recorded'} ${n ? `${n} order${n > 1 ? 's' : ''}.` : 'No new orders.'}`;
}

/* ------------------------------------------------------------------ */
/* Timeline strip under the scrubber                                  */
/* ------------------------------------------------------------------ */

export function stripHTML(r: Replay): string {
  const t0 = start(r);
  const span = end(r) - t0;
  const pct = (t: number) => `${Math.round(((t - t0) / span) * 10000) / 100}%`;
  const sideOf = new Map(r.units.map((u) => [u.id, u.side]));
  let notes = '';
  for (const n of r.notes)
    notes += `<span class="st-n" data-t="${n.start}" style="left:${pct(n.start)};width:${pct(t0 + ((n.end ?? n.t + 20) - n.start))}"></span>`;
  let ticks = '';
  r.decisions.forEach((d, k) => {
    if (d.t == null) return;
    const bad = d.orders.some((o) => o.status === 'rejected');
    const cls = bad ? 'st-t st-t--bad' : d.orders.length ? 'st-t' : 'st-t st-t--none';
    ticks += `<span class="${cls}" data-k="${k}" data-t="${d.t}" style="left:${pct(d.t)}"></span>`;
  });
  let events = '';
  for (const e of r.events) {
    if (e.kind !== 'rout' && e.kind !== 'end') continue;
    const side = e.unit ? sideOf.get(e.unit) : null;
    const cls = e.kind === 'end' ? 'st-e st-e--end' : `st-e st-e--${side}`;
    events += `<span class="${cls}" data-t="${e.t}" style="left:${pct(e.t)}"></span>`;
  }
  let minutes = '';
  for (let s = Math.ceil(t0 / 60) * 60; s <= end(r); s += 60)
    minutes += `<span style="left:${pct(s)}">${clock(s)}</span>`;
  return (
    `<div class="st-rows"><div class="st-row st-row--notes">${notes}</div>` +
    `<div class="st-row st-row--ticks">${ticks}</div>` +
    `<div class="st-row st-row--events">${events}</div>` +
    `<span class="st-head"></span></div><div class="st-minutes">${minutes}</div>`
  );
}

export const pctOf = (r: Replay, T: number) => ((T - start(r)) / (end(r) - start(r))) * 100;
