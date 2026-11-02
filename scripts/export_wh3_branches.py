#!/usr/bin/env python3
"""Export one saved Total War: WARHAMMER III battle moment and its recorded futures.

Provenance
----------
The source is the checkpoint-RL audit in the game-agents repository
(github.com/nivaldoh/slay_the_spire_ai, docs/twwarhammer3/checkpoint-rl.md):

- ``runs/twwarhammer3/rl/checkpoints/<root>/source/observations.jsonl``: the battle the
  checkpoint was saved from, one observation every 300 ms of battle time;
- ``runs/twwarhammer3/rl/audits/<name>/table.json``: every launch restored from the saved
  tick, the order batch it applied and the engine's ending;
- ``runs/twwarhammer3/rl/audits/<name>/attempt-NNNN/observations.jsonl``: what each
  restored launch observed after the handover to live play.

This script only reads those files. It runs no game or network call and writes nothing
except the output file. Positions are the game's metres (``x`` east, ``z`` north), rounded
to 1 m and never interpolated. Rows published while the restore fast-forwarded to the
saved tick lag behind the battle and are dropped: a launch's samples start at the first
row at or after the save. An enemy unit missing from a row is ``null``: not visible to the
army, or destroyed. Launches whose recorded rows are equal are one future; the output
names the others in ``same_as``.

Usage::

    python3 -I scripts/export_wh3_branches.py RL_DIR AUDIT_NAME out.json
    # e.g. <repo>/runs/twwarhammer3/rl hard-late public/media/game-agents/wh3-checkpoint-branches.json
"""

import argparse
import json
import re
from pathlib import Path

LABELS = {
    'noop': 'No new orders',
    'attack_nearest': 'Both units attack',
    'rush_nearest': 'Both units attack at a run',
    'fall_back_f2': 'Handgunners fall back',
    'charge_f1': 'Spearmen charge',
}
# Plain unit names from the game's unit keys.
NAMES = {
    'wh_main_emp_inf_spearmen_1': 'Spearmen',
    'wh_main_emp_inf_handgunners': 'Handgunners',
    'wh_main_grn_inf_savage_orcs': 'Savage Orcs',
}
TRUNK_STEP_MS = 3000  # the shared history before the save is drawn, not animated


def rows(path: Path):
    """(time_ms, {unit id: [x, z, men, fleeing]}) for each observation with units."""
    out = []
    units = {}
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        obs = json.loads(line)['observation']
        if obs.get('time_ms') is None or not obs.get('friendly'):
            continue
        frame = {}
        for side, key in (('model', 'friendly'), ('ai', 'enemy')):
            for u in obs.get(key) or []:
                units.setdefault(u['id'], {'id': u['id'], 'side': side,
                                           'name': NAMES.get(u['type'], u['type']),
                                           'men0': u['men0']})
                fleeing = bool({'routing', 'shattered'} & set(u.get('state') or []))
                frame[u['id']] = [round(u['x']), round(u['z']), u['men'], int(fleeing)]
        out.append((obs['time_ms'], frame))
    return out, units


def series(samples, ids):
    return {'t': [t for t, _ in samples],
            'pos': {i: [f.get(i) for _, f in samples] for i in ids}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rl_dir', type=Path)
    ap.add_argument('audit')
    ap.add_argument('out', type=Path)
    a = ap.parse_args()

    table = json.loads((a.rl_dir / 'audits' / a.audit / 'table.json').read_text())
    (rung,) = table['rungs']
    save_ms = rung['context']['time_ms']
    root = rung['root']
    source, units = rows(a.rl_dir / 'checkpoints' / root / 'source' / 'observations.jsonl')
    ids = sorted(units, key=lambda i: (units[i]['side'] != 'model', i))

    trunk, last = [], None
    for t, f in source:
        if t > save_ms:
            break
        if last is None or t - last >= TRUNK_STEP_MS or t == save_ms:
            trunk.append((t, f))
            last = t

    futures = []
    for att in rung['attempts']:
        name = Path(att['attempt']).name
        samples, more = rows(a.rl_dir / 'audits' / a.audit / name / 'observations.jsonl')
        units.update({k: v for k, v in more.items() if k not in units})
        samples = [s for s in samples if s[0] >= save_ms]
        ending = att['engine_ending']
        assert ending['ended_by'] == 'engine_result' and samples[-1][0] == ending['battle_ms']
        same = next((f for f in futures if f['_samples'] == samples), None)
        if same:
            assert same['result'] == ending['result']
            same['same_as'].append({'attempt': name, 'order': att['candidate']})
            continue
        futures.append({
            'id': att['candidate'], 'label': LABELS.get(att['candidate'], att['candidate']),
            'orders': next(c['orders'] for c in rung['candidates'] if c['id'] == att['candidate']),
            'attempt': name, 'applied_ms': att['applied_ms'],
            'result': ending['result'], 'end_ms': ending['battle_ms'],
            'same_as': [], '_samples': samples,
        })

    # The saved moment is one state: every future must start from it.
    first = {json.dumps(f['_samples'][0]) for f in futures}
    assert len(first) == 1, 'futures disagree at the saved tick'

    out = {
        'source': {
            'repository': 'github.com/nivaldoh/slay_the_spire_ai',
            'audit': f'runs/twwarhammer3/rl/audits/{a.audit}',
            'checkpoint': f'runs/twwarhammer3/rl/checkpoints/{root}/{rung["tick"]}',
            'scenario': 'emp-handgunners-grn-savage-orcs-hard',
            'note': 'Positions in metres, x east, z north; never interpolated.',
        },
        'save_ms': save_ms,
        'repeats': rung.get('repeats', []),
        'units': [units[i] for i in ids],
        'trunk': series(trunk, ids),
        'futures': [{**{k: v for k, v in f.items() if k != '_samples'},
                     **series(f['_samples'], ids)} for f in futures],
    }
    a.out.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print(f'{a.out}: {len(futures)} futures from {sum(1 + len(f["same_as"]) for f in futures)} '
          f'launches, save at {save_ms} ms')


if __name__ == '__main__':
    main()
