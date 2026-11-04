#!/usr/bin/env python3
"""Package the coordination suite's standalone report; never alter recordings.

Usage: python3 -I scripts/import_wh3_suite.py SUITE_HTML

Compressed replay bytes are copied exactly and loaded on demand, as import_wh3_benchmark.py
does for the main report. Only loading, deep links, navigation and the dark theme change.
A link with ?battle=<scenario>&arm=<method> opens that battle's replay.
"""
import base64
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1])
OUT = ROOT / 'public/benchmarks/total-war/suite'


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f'Report template changed; review adapter: {old[:80]}')
    return text.replace(old, new, 1)


source_bytes = SOURCE.read_bytes()
source = source_bytes.decode()
match = re.search(r'<script id="report-data" type="application/json">(.*?)</script>', source, re.S)
data = json.loads(match[1])
assert data['schema'] == 3 and data['evidence_kind'] == 'recorded'
script_match = re.search(r'<script>(.*?)</script>', source, re.S)
script = script_match[1]

old_decode = script[script.index('  async function decode(key) {'):script.index('  // A projection of points')]
script = replace_once(script, old_decode, '''  async function decode(key) {
    const url = data.replays[key];
    if (!url) return null;
    if (!cache.has(key)) {
      cache.set(key, (async () => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}. Try loading again.`);
        const bytes = await response.arrayBuffer();
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
        return JSON.parse(await new Response(stream).text());
      })());
    }
    try {
      return await cache.get(key);
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  }

''')
script = replace_once(script, '    return choose(pictures[0]);', '''    const params = new URLSearchParams(location.search);
    const asked = params.get("battle");
    const name = pictures.includes(asked) ? asked : pictures[0];
    return choose(name).then(() => {
      const arm = params.get("arm");
      if (name === asked && scene[arm]) return watch(arm);
    });''')
script = script.replace('const ENEMY_INK = "#b86f00"', 'const ENEMY_INK = "#e69f00"')

replays = data['replays']
data['replays'] = {key: f'./replays/{key}.bin' for key in replays}
payload = json.dumps(data, separators=(',', ':'), ensure_ascii=False).replace('<', '\\u003c')
output = source[:match.start(1)] + payload + source[match.end(1):]
output = replace_once(output, script_match[0], f'<script>{script}</script>')
digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
output, count = re.subn(r"script-src 'sha256-[^']+'", f"connect-src 'self'; script-src 'sha256-{digest}'", output)
assert count == 1
theme = '''
/* Portfolio adaptation: same report and evidence, single dark theme. */
:root { color-scheme: dark; --page:#0a0c10; --sheet:#12141a;
  --ink:#ece5cf; --ink-2:#d6cfb8; --muted:#a49d8b; --faint:#8c8572;
  --line:#30333b; --bad:#e98d7c; --note:#1b1e25; --accent:#c8b270; }
button.primary { color:var(--page); }
.suite-grid td.won { background:#21382c; }
.suite-grid td.won button { color:#b7dcae; }
.portfolio-nav { display:flex; flex-wrap:wrap; gap:1rem; padding-block:1rem;
  border-bottom:1px solid var(--line); font-size:var(--t-s); }
'''
output = replace_once(output, '</style>', theme + '</style>')
output = output.replace('background: #f1f0eb;', 'background: var(--note);')
output = replace_once(output, '<body>', '''<body>
  <nav class="wrap portfolio-nav" aria-label="Portfolio">
    <a href="/#coordination">← Nivaldo Tokuda / Selected work</a>
    <a href="/projects/game-agents/">About this project</a>
    <span>Snapshot · 4 November 2026</span>
  </nav>''')

OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'replays').mkdir(exist_ok=True)
files = []
for key, encoded in replays.items():
    assert re.fullmatch(r'g\d+-t\d+', key)
    content = base64.b64decode(encoded, validate=True)
    assert len(content) < 25 * 1024 * 1024
    dest = OUT / 'replays' / f'{key}.bin'
    dest.write_bytes(content)
    files.append({'path': f'replays/{key}.bin', 'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
assert len(output.encode()) < 25 * 1024 * 1024
(OUT / 'index.html').write_text(output)
(OUT / 'manifest.json').write_text(json.dumps({
    'source': 'suite.html', 'source_sha256': hashlib.sha256(source_bytes).hexdigest(),
    'snapshot': '2026-11-04', 'replays': files,
}, indent=2) + '\n')
print(f'Packaged {len(files)} unchanged compressed replays; report {len(output.encode()):,} bytes.')
