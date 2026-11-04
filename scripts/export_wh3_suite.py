#!/usr/bin/env python3
"""Export the coordination suite and the first multiplayer battle for the homepage maps.

Provenance
----------
Both sources are in the game-agents repository (github.com/nivaldoh/slay_the_spire_ai):

- ``runs/twwarhammer3/reports/suite.html``: the suite report; each battle's result, who
  controlled which unit (the battle's own partition record) and its recorded replay;
- ``runs/twwarhammer3/native-multiplayer/mp1/combined/``: what each client recorded in the
  first PC + cloud VM battle (``events-A.jsonl``, ``events-B.jsonl``) and their comparison
  (``compare.json``).

This script only reads those files. It runs no game or network call. Positions are the
game's metres rounded to 1 m, taken from recorded samples at least STEP_MS apart and never
interpolated. A unit with no men, or an enemy the army could not see, is ``null``.

Usage::

    python3 -I scripts/export_wh3_suite.py SUITE_HTML MP1_DIR public/media/game-agents
"""

import argparse
import base64
import gzip
import hashlib
import json
import re
from pathlib import Path

STEP_MS = 2000
MARGIN_M = 40  # as the suite page frames its maps
KEEP = 0.98  # share of fighting positions the suite maps frame: long chases stretch the map
OUT_DIR = 'wh3-suite'
MP_OUT = 'wh3-two-clients.json'
TAGS = {'single': 'M', 'tips': 'M+', 'team': 'T', 'commander': 'C', 'gap': 'R', 'skills': 'S'}


def kind_of(glyph):
    """The suite page's unit kinds: infantry, guns, knights."""
    if re.search('missile|artillery', glyph or ''):
        return 'guns'
    if re.search('cavalry|monster', glyph or ''):
        return 'knights'
    return 'infantry'


def able(u):
    return u['men'] > 0 and not ({'routing', 'shattered'} & set(u.get('state') or []))


def placed(u):
    return isinstance(u.get('x'), (int, float)) and isinstance(u.get('z'), (int, float))


def state(u):
    """[x, z, 1 if no longer fighting] or None when the unit has no men left."""
    if u['men'] <= 0 or not placed(u):
        return None
    return [round(u['x']), round(u['z']), 0 if able(u) else 1]


def samples(frames):
    """Recorded frames at least STEP_MS apart, always ending on the last one."""
    kept, due = [], None
    for frame in frames:
        if due is None or frame['time_ms'] >= due:
            kept.append(frame)
            due = frame['time_ms'] + STEP_MS
    if kept[-1] is not frames[-1]:
        kept.append(frames[-1])
    return kept


def square(points, keep=1.0):
    """A square around the middle `keep` share of the points on each axis, plus a margin.
    Units that run past the frame leave the map; nothing is moved to fit."""
    xs = sorted(p[0] for p in points)
    zs = sorted(p[1] for p in points)
    cut = int(len(xs) * (1 - keep) / 2)
    xs = xs[cut:len(xs) - cut]
    zs = zs[cut:len(zs) - cut]
    side = round(max(xs[-1] - xs[0], zs[-1] - zs[0]) + 2 * MARGIN_M)
    return {
        'x0': round((xs[0] + xs[-1]) / 2 - side / 2),
        'z1': round((zs[0] + zs[-1]) / 2 + side / 2),
        'side': side,
    }


def blocked(terrain, frame):
    """Impassable cells inside the frame as one path, in map units (y down)."""
    cell = terrain['cell_m']
    x0, z0 = terrain['x0'], terrain['z0']
    path = ''
    for j, row in enumerate(terrain['rows']):
        for match in re.finditer('#+', row):
            left = x0 + match.start() * cell - cell / 2 - frame['x0']
            top = frame['z1'] - (z0 + j * cell + cell / 2)
            width = len(match[0]) * cell
            if left + width < 0 or left > frame['side'] or top + cell < 0 or top > frame['side']:
                continue
            path += f'M{left:g} {top:g}h{width:g}v{cell:g}h{-width:g}z'
    return path


def hue(method, owners, unit_id):
    """Who controls a unit, as the suite page colours it."""
    if not method['models']:
        return 'scripts'
    if 'all' in method['models']:
        return 'all'
    return owners[unit_id]


def export_suite(html_path, out):
    source = Path(html_path).read_bytes()
    match = re.search(rb'<script id="report-data" type="application/json">(.*?)</script>', source, re.S)
    data = json.loads(match[1])
    suite = data['suite']
    page = suite['page']
    keys = {row['output']: row['battle_key'] for plan in data['benchmark_plans'] for row in plan['rows']}
    order = page['order']

    battles = []
    (out / OUT_DIR).mkdir(parents=True, exist_ok=True)
    for name in suite['scenarios']:
        picture = suite['pictures'][name]
        panels, points, terrain = [], [], None
        for battle in sorted(picture['battles'], key=lambda b: order.index(b['arm'])):
            replay = json.loads(gzip.decompress(base64.b64decode(data['replays'][keys[battle['output']]])))
            frames = [f for f in replay['frames'] if f['friendly']]
            terrain = terrain or replay['terrain']
            kinds = {r['id']: kind_of(r['glyph']) for r in replay['roster']}
            method = page['methods'][battle['arm']]
            kept = samples(frames)
            units = {}
            for side, shape_of in (('friendly', kinds.get), ('enemy', lambda _: 'enemy')):
                for frame in frames:
                    for u in frame[side]:
                        if u['id'] not in units:
                            units[u['id']] = {
                                'id': u['id'],
                                'hue': 'enemy' if side == 'enemy' else hue(method, battle['owners'], u['id']),
                                'shape': shape_of(u['id']),
                            }
                        if able(u) and placed(u):
                            points.append((u['x'], u['z']))
            pos = {uid: [] for uid in units}
            for frame in kept:
                seen = {u['id']: u for u in frame['friendly'] + frame['enemy']}
                for uid in units:
                    pos[uid].append(state(seen[uid]) if uid in seen else None)
            panels.append({
                'id': battle['arm'],
                'result': battle['outcome'],
                'end_ms': battle['battle_s'] * 1000,
                't': [f['time_ms'] for f in kept],
                'units': list(units.values()),
                'pos': pos,
            })
        frame = square(points, KEEP)
        (out / OUT_DIR / f'{name}.json').write_text(json.dumps({
            'id': name,
            'frame': frame,
            'blocked': blocked(terrain, frame),
            'panels': panels,
        }, separators=(',', ':')) + '\n')
        battles.append({
            'id': name,
            'title': picture['title'],
            'question': picture['question'],
            'results': {b['arm']: b['outcome'] for b in picture['battles']},
        })

    arms = suite['arms']
    (out / OUT_DIR / 'index.json').write_text(json.dumps({
        'source_sha256': hashlib.sha256(source).hexdigest(),
        'methods': [{
            'id': arm,
            'tag': TAGS[arm],
            'name': page['methods'][arm]['name'],
            'note': page['methods'][arm]['note'],
            'models': page['methods'][arm]['models'],
            'scripts': bool(page['methods'][arm].get('scripts')),
            'rules': bool(page['methods'][arm].get('rules')),
            'won': arms[arm]['wins'],
            'played': arms[arm]['completed'],
        } for arm in order],
        'battles': battles,
    }, indent=1) + '\n')
    print(f'suite: {sum(len(b["results"]) for b in battles)} battles in {len(battles)} scenarios')


def observations(path):
    """{battle time: {ui_id: unit}} and the terrain grid from one client's records.
    Both clients share ui_ids."""
    rows = {}
    terrain = None
    for line in Path(path).read_text().splitlines():
        event = json.loads(line).get('event') or {}
        if event.get('kind') != 'observation':
            continue
        obs = event['data']['observation']
        terrain = terrain or obs.get('terrain')
        units = (obs.get('native') or {}).get('units') or []
        if units:
            rows[obs['time_ms']] = {u['ui_id']: u for u in units}
    return rows, terrain


def export_multiplayer(mp_dir, out):
    mp = Path(mp_dir)
    compare = json.loads((mp / 'compare.json').read_text())['pairs'][0]
    assert compare['exact'] == compare['units_compared'] and compare['position_differences'] == 0
    a, terrain = observations(mp / 'events-A.jsonl')
    b, _ = observations(mp / 'events-B.jsonl')
    times = sorted(a.keys() & b.keys())
    kept = []
    for t in times:
        if not kept or t - kept[-1] >= STEP_MS or t == times[-1]:
            kept.append(t)
    roster = a[times[0]]
    hues = {'own': 'front', 'allied': 'ranged', 'enemy': 'enemy'}  # blue PC, green VM, as on A
    units = [{
        'id': str(ui),
        'hue': hues[u['owner']],
        'shape': 'enemy' if u['owner'] == 'enemy' else 'infantry',
    } for ui, u in sorted(roster.items())]
    panels = []
    points = []
    for pid, rows in (('pc', a), ('vm', b)):
        pos = {str(ui): [] for ui in roster}
        for t in kept:
            for ui in roster:
                u = rows[t][ui]
                pos[str(ui)].append([round(u['x']), round(u['z']), 0])
                points.append((u['x'], u['z']))
        panels.append({'id': pid, 'end_ms': kept[-1], 't': kept, 'units': units, 'pos': pos})
    frame = square(points)
    (out / MP_OUT).write_text(json.dumps({
        'frame': frame,
        'blocked': blocked(terrain, frame),
        'panels': panels,
        'compared_times': compare['compared_times'],
        'units_compared': compare['units_compared'],
        'exact': compare['exact'],
    }, separators=(',', ':')) + '\n')
    print(f'multiplayer: {compare["exact"]}/{compare["units_compared"]} exact, {len(kept)} samples drawn')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('suite_html')
    parser.add_argument('mp_dir')
    parser.add_argument('out', type=Path)
    args = parser.parse_args()
    export_suite(args.suite_html, args.out)
    export_multiplayer(args.mp_dir, args.out)


if __name__ == '__main__':
    main()
