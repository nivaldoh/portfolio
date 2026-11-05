// Playback for SuiteGrid.astro. The server markup is one finished battle; this replays it and
// swaps the six maps when a row is picked. Reduced motion shows each battle finished.
import { clock } from './replay-core';
import { endOf, mapSvg, playMaps, type MapPanel, type MapSet } from './mini-maps';

const SPEED = 20; // battle seconds per real second

export function initSuite(root: HTMLElement) {
  const { base, full, first } = root.dataset;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rows = [...root.querySelectorAll<HTMLElement>('[data-sg-row]')];
  const cols = [...root.querySelectorAll<HTMLElement>('[data-sg-method]')];
  const title = root.querySelector<HTMLElement>('[data-sg-title]');
  const time = root.querySelector<HTMLElement>('[data-sg-time]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-sg-toggle]');
  const cache = new Map<string, Promise<MapSet>>();
  let player: ReturnType<typeof playMaps> | null = null;
  let turn = 0;
  let paused = false;

  const load = (id: string) => {
    if (!cache.has(id)) {
      cache.set(id, fetch(`${base}/${id}.json`).then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<MapSet>;
      }));
    }
    return cache.get(id)!;
  };

  async function show(id: string) {
    const mine = ++turn;
    for (const row of rows) {
      const on = row.dataset.sgRow === id;
      row.classList.toggle('sg__row--on', on);
      row.querySelector('button')?.setAttribute('aria-pressed', String(on));
      if (on && title) title.textContent = row.dataset.title ?? '';
    }
    let set: MapSet;
    try {
      set = await load(id);
    } catch {
      cache.delete(id);
      return; // the last battle stays on screen
    }
    if (mine !== turn) return;
    player?.stop();
    player = null;

    const slots = cols.flatMap((col) => {
      const arm = col.dataset.sgMethod!;
      const panel: MapPanel | undefined = set.panels.find((p) => p.id === arm);
      const link = col.querySelector<HTMLAnchorElement>('[data-sg-panel]')!;
      const map = col.querySelector<HTMLElement>('[data-sg-map]')!;
      const stamp = col.querySelector<HTMLElement>('[data-sg-stamp]')!;
      const name = col.querySelector('.sg__name')?.lastChild?.textContent ?? arm;
      col.querySelector<HTMLElement>('[data-sg-absent]')?.toggleAttribute('hidden', !!panel);
      if (!panel) {
        link.removeAttribute('href');
        link.removeAttribute('aria-label');
        map.innerHTML = '';
        stamp.hidden = true;
        return [];
      }
      const ending = `${panel.result === 'won' ? 'Won' : 'Lost'} ${clock(panel.end_ms / 1000)}`;
      link.href = `${full}?battle=${id}&arm=${arm}`;
      link.setAttribute('aria-label', `Watch ${name} on ${row(id)}: ${ending}`);
      stamp.textContent = ending;
      stamp.classList.toggle('sg__stamp--won', panel.result === 'won');
      stamp.classList.toggle('sg__stamp--lost', panel.result !== 'won');
      map.innerHTML = mapSvg(set, panel, Infinity);
      stamp.hidden = false;
      return [{ map, panel, stamp }];
    });

    if (still) {
      if (time) time.textContent = clock(endOf(set) / 1000);
      return;
    }
    player = playMaps(root, set, slots, time, clock, SPEED);
    player.setPaused(paused);
  }

  const row = (id: string) => rows.find((r) => r.dataset.sgRow === id)?.dataset.title ?? id;

  for (const r of rows) r.addEventListener('click', () => void show(r.dataset.sgRow!));

  if (toggle && !still) {
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
      paused = !paused;
      player?.setPaused(paused);
      toggle.textContent = paused ? 'Play' : 'Pause';
      toggle.setAttribute('aria-pressed', String(paused));
    });
  }

  if (still) return;
  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    void show(first!);
  }, { rootMargin: '200px' });
  io.observe(root);
}
