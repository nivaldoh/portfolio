// Focused checks for the public replay's timing and missing-data behavior.
// Transpile the two pure TypeScript modules using the existing TS dependency.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name).exports;
  const filename = path.join(root, 'src/components/wh3', `${name}.ts`);
  const mod = new Module(filename, module);
  modules.set(name, mod);
  mod.require = id => id.startsWith('./') ? load(id.slice(2)) : require(id);
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return mod.exports;
}

const core = load('replay-core');
const render = load('replay-render');
const replay = JSON.parse(fs.readFileSync(path.join(root, 'public/media/game-agents/wh3-cavalry-flank.json')));
const applied = core.appliedOrder(replay.decisions);

test('recording samples and decision references agree with their recorded times', () => {
  assert.ok(replay.t.length > 1);
  replay.t.forEach((t, i) => {
    if (i) assert.ok(t > replay.t[i - 1]);
    assert.equal(core.sampleAt(replay.t, t), i);
    if (i < replay.t.length - 1) {
      assert.equal(core.sampleAt(replay.t, (t + replay.t[i + 1]) / 2), i);
    }
  });
  for (const unit of replay.units) assert.equal(replay.pos[unit.id].length, replay.t.length);
  for (const d of replay.decisions) {
    assert.equal(replay.t[d.obs_i], d.obs_t);
    if (d.t != null) assert.ok(d.t >= d.obs_t);
  }
});

test('orders change at application time, not when the observation was made', () => {
  applied.forEach((k, i) => {
    const t = replay.decisions[k].t;
    assert.equal(core.decisionAt(replay.decisions, applied, t), k);
    assert.equal(core.decisionAt(replay.decisions, applied, t - 0.001), i ? applied[i - 1] : -1);
  });
});

test('ties use the later reply; unapplied replies never become active', () => {
  const decisions = [{ t: 5 }, { t: null }, { t: 3 }, { t: 5 }];
  const order = core.appliedOrder(decisions);
  assert.deepEqual(order, [2, 0, 3]);
  assert.equal(core.decisionAt(decisions, order, 5), 3);
});

test('scrubbing between samples holds unit positions without interpolation', () => {
  const t = replay.key_moment.at;
  const i = core.sampleAt(replay.t, t);
  const next = Math.min(replay.t[i + 1], replay.decisions[applied[applied.indexOf(core.decisionAt(replay.decisions, applied, t)) + 1]].t);
  const before = core.momentAt(replay, applied, t);
  const between = core.momentAt(replay, applied, (t + next) / 2);
  assert.equal(render.unitsSVG(replay, before, { view: true, mk: 1 }), render.unitsSVG(replay, between, { view: true, mk: 1 }));
});

test('recorded key moment and endpoint select the correct note and final pending reply', () => {
  const key = core.momentAt(replay, applied, replay.key_moment.at);
  assert.equal(replay.notes[key.note].title, replay.key_moment.title);
  const final = core.momentAt(replay, applied, render.end(replay));
  assert.equal(final.i, replay.t.length - 1);
  assert.equal(final.k, applied.at(-1));
  assert.equal(replay.decisions[final.pending].t, null);
  assert.match(render.waitingText(replay, final), /battle ended before the reply/);
});

test('missing explanations, orders, and optional timing remain explicit', () => {
  const r = structuredClone(replay);
  const k = applied[0];
  Object.assign(r.decisions[k], { reply: null, memo: undefined, orders: [], age_s: null, think_s: null });
  const html = render.decisionHTML(r, core.momentAt(r, applied, r.decisions[k].t));
  assert.match(html, /No reason was recorded/);
  assert.match(html, /No new orders/);
  assert.doesNotMatch(html, /NaN|undefined/);
});

test('no replies or no acknowledgements never invent an application time', () => {
  for (const decisions of [[], [{ ...replay.decisions[0], t: null }]]) {
    const r = { ...replay, decisions };
    const html = render.decisionHTML(r, core.momentAt(r, core.appliedOrder(decisions), render.start(r)));
    assert.doesNotMatch(html, /first orders were applied|first reply reached|NaN|undefined/);
    assert.match(html, /No (model replies|applied reply) .*recorded/);
  }
});

test('missing positions and terrain render without invented coordinates', () => {
  const r = structuredClone(replay);
  r.terrain = null;
  for (const unit of r.units) r.pos[unit.id].fill(null);
  const m = core.momentAt(r, applied, r.key_moment.at);
  const svg = render.groundSVG(r) + render.unitsSVG(r, m, { view: true, mk: 1 });
  assert.doesNotMatch(svg, /NaN|undefined/);
  assert.match(render.unitListHTML(r, m), /not visible|not recorded/);
});

test('recorded model text is escaped before becoming HTML', () => {
  const r = structuredClone(replay);
  const k = applied[0];
  r.decisions[k].reply = '<img src=x onerror=alert(1)>';
  const html = render.decisionHTML(r, core.momentAt(r, applied, r.decisions[k].t));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});
