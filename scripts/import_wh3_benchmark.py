#!/usr/bin/env python3
"""Package the supplied standalone report; never regenerate or alter recordings.

Usage: python scripts/import_wh3_benchmark.py [dev/benchmark.html]
The source stays private. Compressed replay bytes are copied exactly; only the
report's loading, navigation, theme, and no-JavaScript fallback are adapted.
"""
import base64
import hashlib
import html
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dev/benchmark.html'
OUT = ROOT / 'public/benchmarks/total-war'


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError(f'Report template changed; review adapter: {old[:80]}')
    return text.replace(old, new, 1)


source_bytes = SOURCE.read_bytes()
source = source_bytes.decode()
match = re.search(r'<script id="report-data" type="application/json">(.*?)</script>', source, re.S)
if not match:
    raise ValueError('No embedded report-data found')
data = json.loads(match[1])
assert data['schema'] == 3 and data['evidence_kind'] == 'recorded'
script_match = re.search(r'<script>(.*?)</script>', source, re.S)
script = script_match[1]

# This round is identified by recorded job names, not by the model-level totals
# (those pool different harnesses). The two initial caster trials completed M1.
models = ['gpt-6-sol', 'gpt-6-luna']
scenarios = []
for scenario in data['scenarios']:
    results = {model: [] for model in models}
    for g, group in enumerate(data['report']['groups']):
        if group['definition']['scenario_name'] != scenario['name']:
            continue
        for t, trial in enumerate(group['trials']):
            job = trial['instance']
            if not (job.startswith('bench-b12-m1-') or job == 'bench-b12-caster-assault-20261016'):
                continue
            model = trial['card'].get('model')
            if model not in results:
                continue
            assert trial['valid'] and trial['policy'].split('@')[0] == 'llm_rules'
            assert trial['card']['effort'] == 'low'
            results[model].append({'id': f'g{g}-t{t}', 'won': trial['outcome'] == 'won'})
    assert all(len(trials) == 3 for trials in results.values()), scenario['name']
    scenarios.append({
        **{key: scenario[key] for key in ['id', 'name', 'short', 'mode', 'armies', 'terrain', 'start']},
        'results': results,
    })
summary = {
    'source_sha256': hashlib.sha256(source_bytes).hexdigest(),
    'snapshot': '2026-10-16',
    'round': 'M1',
    'models': models,
    'scenarios': scenarios,
}

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
script = replace_once(script, '    openKey = key;', '''    openKey = key;
    $("retry-replay")?.remove();
    Viewer.clear("Loading the recording…");''')
script = replace_once(script, '    $("map-army").textContent =', '''    if (problem) {
      const retry = el("button", "Retry loading the recording");
      retry.id = "retry-replay";
      retry.addEventListener("click", () => openRun(key, false));
      $("moment").append(retry);
    }
    $("map-army").textContent =''')
# ?scenario=<id> links open that scenario in the full report.
script = replace_once(script,
    '    await renderScenario(Math.max(0, data.scenarios.indexOf(headline)));',
    '''    const requested = new URLSearchParams(location.search).get("scenario");
    const requestedIndex = data.scenarios.findIndex((item) => item.id === requested);
    await renderScenario(requestedIndex >= 0 ? requestedIndex : Math.max(0, data.scenarios.indexOf(headline)));''')
# Use the report's existing light-on-dark data palette for the dark paper too.
script = replace_once(script, '  const NEUTRAL =', '  HUES.forEach((pair) => { pair[0] = pair[1]; });\n  const NEUTRAL =')
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
.portfolio-nav { display:flex; flex-wrap:wrap; gap:1rem; padding-block:1rem;
  border-bottom:1px solid var(--line); font-size:var(--t-s); }
.portfolio-fallback { padding-block:2rem; }
.portfolio-fallback table { width:100%; border-collapse:collapse; margin-block:1rem; }
.portfolio-fallback th, .portfolio-fallback td { padding:.5rem; text-align:left; border-bottom:1px solid var(--line); }
'''
output = replace_once(output, '</style>', theme + '</style>')
output = output.replace('background: #f1f0eb;', 'background: var(--note);')
output = replace_once(output, '<body>', '''<body>
  <nav class="wrap portfolio-nav" aria-label="Portfolio">
    <a href="/#work">← Nivaldo Tokuda / Selected work</a>
    <a href="/projects/game-agents/">About this project</a>
    <span>Development snapshot · 16 October 2026</span>
  </nav>''')
rows = ''.join('<tr><th scope="row">' + html.escape(s['short']) + '</th>' +
    ''.join(f'<td>{sum(t["won"] for t in s["results"][m])} / 3</td>' for m in models) + '</tr>' for s in scenarios)
fallback = '''<noscript><style>#watch, main.wrap, #method { display:none; }</style><section class="wrap portfolio-fallback">
  <h2>Matched development round (M1)</h2>
  <p>The interactive report needs JavaScript. These are the recorded wins from three battles per model per scenario, on low reasoning effort with a rules-only prompt and very hard game AI. Prompts were developed on these scenarios; this is not a held-out leaderboard.</p>
  <table><thead><tr><th>Scenario</th><th>gpt-6-sol</th><th>gpt-6-luna</th></tr></thead><tbody>''' + rows + '''</tbody></table>
  <p><a href="/projects/game-agents/">Read the case study and view a recorded battle still</a>.</p>
  </section></noscript>'''
output, count = re.subn(r'<noscript>.*?</noscript>', lambda _: fallback, output, flags=re.S)
assert count == 1

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
    'source': 'benchmark.html', 'source_sha256': summary['source_sha256'],
    'snapshot': summary['snapshot'], 'missing_dependencies': [],
    'replays': files,
}, indent=2) + '\n')
print(f'Packaged {len(files)} unchanged compressed replays; report {len(output.encode()):,} bytes.')
print(f'Source SHA-256: {summary["source_sha256"]}')
