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
# ?scenario=<id> links open that scenario in the full report. ?battle=<key>&t=<seconds> opens
# one of the page's battles at that moment instead of playing the featured key moment.
script = replace_once(script,
    '''    await renderScenario(Math.max(0, data.scenarios.indexOf(headline)));
    renderInterface(entries.get(scenario.featured), payload);''',
    '''    const params = new URLSearchParams(location.search);
    const battle = shown.has(params.get("battle")) ? params.get("battle") : null;
    const requestedIndex = battle
      ? data.scenarios.findIndex((item) => item.battles.includes(battle))
      : data.scenarios.findIndex((item) => item.id === params.get("scenario"));
    await renderScenario(requestedIndex >= 0 ? requestedIndex : Math.max(0, data.scenarios.indexOf(headline)), !battle);
    const first = scenario.featured;
    if (battle) {
      await openRun(battle, false);
      const t = Number(params.get("t"));
      if (params.get("t") && Number.isFinite(t) && openKey === battle) Viewer.seek(t * 1000);
      $("watch").scrollIntoView({ block: "start" });
    }
    renderInterface(entries.get(first), openKey === first ? payload : await decode(first).catch(() => null));''')
script = replace_once(script, '    if (!featured || reduceMotion) return;',
    '    if (battle || !featured || reduceMotion) return;')
# Once set up, the address follows the viewer through replaceState (never a new history entry):
# scenario and battle when the battle changes, t when playback pauses or the time is moved.
script = replace_once(script, '  const listeners = [];\n', '  const listeners = [],\n    moves = [];\n')
script = replace_once(script, '''  function pause() {
    playing = false;
    until = null;
    updatePlay();
  }''', '''  function pause() {
    playing = false;
    until = null;
    updatePlay();
    for (const listener of moves) listener();
  }''')
script = replace_once(script, '''    watching = null;
    render();
  }
  const reveal =''', '''    watching = null;
    render();
    for (const listener of moves) listener();
  }
  const reveal =''')
script = replace_once(script, '    onTime: (listener) => listeners.push(listener),', '''    onTime: (listener) => listeners.push(listener),
    // Called when playback pauses or the time is moved.
    onMove: (listener) => moves.push(listener),''')
script = replace_once(script, '  const watchFeatured = (intoView = true) => {', '''  let linked = false,
    linkTime = false,
    linkTimer = null;
  function writeLink() {
    if (!linked) return;
    clearTimeout(linkTimer);
    linkTimer = setTimeout(() => {
      const params = new URLSearchParams(location.search);
      for (const name of ["scenario", "battle", "t"]) params.delete(name);
      params.set("scenario", scenario.id);
      params.set("battle", openKey);
      if (linkTime && payload?.frames?.length)
        params.set("t", String(Math.round(Viewer.time / 100) / 10));
      if (`?${params}` === location.search) return;
      try {
        history.replaceState(history.state, "", `?${params}${location.hash}`);
      } catch {
        // A sandboxed copy of the page cannot change its address.
      }
    }, 300);
  }
  let lastInput = -Infinity;
  for (const type of ["pointerdown", "keydown"])
    document.addEventListener(type, () => (lastInput = performance.now()), true);
  Viewer.onMove(() => {
    if (performance.now() - lastInput > 1500) return;
    linkTime = true;
    writeLink();
  });

  const watchFeatured = (intoView = true) => {''')
script = replace_once(script, '''    $("download-replay").disabled = true;
    $("watch-featured").hidden = true;''', '''    linkTime = false;
    writeLink();
    $("download-replay").disabled = true;
    $("watch-featured").hidden = true;''')
script = replace_once(script, '  setup();\n})();', '  setup().finally(() => (linked = true));\n})();')

# Plain wording for visitors: no internal scenario status, and Figure 1 named as the one fixed
# round it always shows. The masthead summary, which mixes rounds, is left out.
assert len(data['scenarios']) == 6
headline = max((s for s in data['scenarios'] if s.get('controlled')), key=lambda s: s['controlled']['launches'])
assert headline['short'] == 'Cavalry assault'
assert headline['controlled']['launches'] == 6 and headline['controlled']['once']
assert {data['battles'][key]['date'][:10] for key in headline['controlled']['battles']} == {'2026-10-15'}
script = replace_once(script, '"Provisional candidates, one per intended decision problem.',
    '"One candidate per intended decision problem.')
script = replace_once(script, '''        [
          "Status",
          [scenario.split, scenario.status?.replaceAll("_", " ")].filter(Boolean).join(", "),
        ],
''', '')
script = replace_once(script,
    '''${item.controlled.launches} game launches, each commander ${item.controlled.once ? "once " : ""}per launch with the same test setup${level(item) ? `, against the game's AI on ${level(item)}` : ""}.${best != null ? " The tick marks the best scripted rule." : ""} Figure 3 pools every completed battle in this scenario, other launches included.`''',
    '''the six-launch round of 15 October 2026, one battle per commander per launch with the same test setup${level(item) ? `, against the game's AI on ${level(item)}` : ""}. This figure always shows that round; the scenario picker does not change it.${best != null ? " The tick marks the best scripted rule." : ""} Figure 3 pools every completed battle in each scenario, other launches included.`''')
script = replace_once(script, '    finding();\n', '')
script = replace_once(script, '    const columns = plansWidth >= 720 && items.length > 1 ? 2 : 1;',
    '    const columns = items.length > 1 && getComputedStyle(box).gridTemplateColumns.trim().split(/\\s+/).length > 1 ? 2 : 1;')
script = replace_once(script, '"API spend over every attempt in this report, incomplete ones included: "',
    '"API spend across all six scenarios, incomplete attempts included: "')
script = replace_once(script, 'The strongest-model screen and held-out evaluation are still ahead.',
    'The prompts were developed on these same scenarios, so none of this is held-out evaluation.')
# Use the report's existing light-on-dark data palette for the dark paper too.
script = replace_once(script, '  const NEUTRAL =', '  HUES.forEach((pair) => { pair[0] = pair[1]; });\n  const NEUTRAL =')
script = script.replace('const ENEMY_INK = "#b86f00"', 'const ENEMY_INK = "#e69f00"')

replays = data['replays']
data['replays'] = {key: f'./replays/{key}.bin' for key in replays}
payload = json.dumps(data, separators=(',', ':'), ensure_ascii=False).replace('<', '\\u003c')
payload = replace_once(payload, ' The current scenario remains provisional.', '')
payload = replace_once(payload,
    "In M1, Sol and gpt-6.1-sol each won one of three battles; Luna lost all three. Earlier wins reached the guns around the halberd screen, but repeatability at model latency remains unresolved. Preserve this difficulty as an anchor until the successful route is better understood. Recorded starting positions match within each M1 cavalry launch despite mixed outcomes; route execution remains a question even before testing other geometries.",
    "In the matched round of 16 October, gpt-6-sol won one of three battles and gpt-6-luna none; gpt-6.1-sol, run separately with the same setup, also won one of three. The wins reached the guns by going around the halberd screen; whether a model can repeat that route reliably, given its reply delay, is still open.")
output = source[:match.start(1)] + payload + source[match.end(1):]
output = replace_once(output, script_match[0], f'<script>{script}</script>')
digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
output, count = re.subn(r"script-src 'sha256-[^']+'", f"connect-src 'self'; script-src 'sha256-{digest}'", output)
assert count == 1
# The h1 and dek stay above the viewer; the scenario thumbnails move below it, before Results.
output = replace_once(output,
    'These scenarios are provisional: calibrating distinct decision problems comes before a broader comparison of the strongest models.',
    'Six scenarios, each built around a different tactical decision.')
output = replace_once(output, '\n    <p id="finding" class="finding"></p>', '')
output = replace_once(output, '\n    <nav id="index" class="index" aria-label="Scenarios"></nav>', '')
output = replace_once(output, '<main class="wrap">', '<main class="wrap">\n    <nav id="index" class="index" aria-label="Scenarios"></nav>')
output = replace_once(output, '<h2 id="results-heading">Results</h2>',
    '<h2 id="results-heading">Results: cavalry assault, 15 October 2026</h2>')
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
/* The scenario thumbnails sit below the viewer, so phones keep the labelled selects too. */
main > .index { margin-top:44px; }
@media (max-width: 760px) {
  #scenario-pick:not([hidden]) { display:grid; }
  .pick span { display:block; }
}
/* Figure 3's survival axis: on the narrowest phones keep only its two end labels. */
@media (max-width: 380px) {
  .matrix-axis .scale span:not(:first-child):not(:last-child) { display:none; }
}
'''
output = replace_once(output, '</style>', theme + '</style>')
output = output.replace('background: #f1f0eb;', 'background: var(--note);')
output = replace_once(output, '<body>', '''<body>
  <nav class="wrap portfolio-nav" aria-label="Portfolio">
    <a href="/#work">← Nivaldo Tokuda / Selected work</a>
    <a href="/projects/game-agents/">About this project</a>
    <span>Snapshot · 16 October 2026</span>
  </nav>''')
rows = ''.join('<tr><th scope="row">' + html.escape(s['short']) + '</th>' +
    ''.join(f'<td>{sum(t["won"] for t in s["results"][m])} / 3</td>' for m in models) + '</tr>' for s in scenarios)
fallback = '''<noscript><style>#watch, main.wrap, #method { display:none; }</style><section class="wrap portfolio-fallback">
  <h2>Matched round, 16 October 2026</h2>
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
