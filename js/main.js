import { simulate, parseTime, fmtTime, ARCH_LABELS } from './engine/simulate.js';
import { defaultParams, SOURCES, PARAMS } from './engine/assumptions.js';
import { monthlyCost } from './engine/cost.js';
import { createPanel } from './ui/panel.js';
import { renderSummary } from './ui/summary.js';
import { renderParams } from './ui/params.js';
import { openRoutingInfo, openRoutingInfoFirstTime } from './ui/routing-info.js';
import { h, usd } from './ui/dom.js';
import { buildBeats, createNarrator } from './ui/narrator.js';
import { openPipeline } from './ui/pipeline.js';

const cfg = (arch, model, routing = false) => ({ arch, model, routing });
const PRESETS = [
  { id: 'model', label: 'Traditional vs agentic, same data', a: cfg('index', 'traditional'), b: cfg('index', 'agentic') },
  { id: 'arch', label: 'Index-at-ingest vs tiered, human SOC', a: cfg('index', 'traditional'), b: cfg('tiered', 'traditional') },
  { id: 'tiered-model', label: 'Tiered: human vs agentic', a: cfg('tiered', 'traditional'), b: cfg('tiered', 'agentic') },
  { id: 'routing', label: 'Tiered agentic: routing off vs on', a: cfg('tiered', 'agentic'), b: cfg('tiered', 'agentic', true) },
  { id: 'best', label: 'Classic human vs lake agentic + routing', a: cfg('index', 'traditional'), b: cfg('lake', 'agentic', true) },
  { id: 'budget', label: 'Budget: index-at-ingest vs tiered + routing, both agentic', a: cfg('index', 'agentic'), b: cfg('tiered', 'agentic', true) },
];
const DEFAULT_PRESET = { '01-phishing-to-bec': 'model', '02-where-did-the-evidence-go': 'arch' };
const PARAM_DEFAULTS = defaultParams();

const $ = id => document.getElementById(id);
const state = {
  index: [], scenarios: {}, scenario: null, variant: 'default',
  sides: [cfg('index', 'traditional'), cfg('index', 'agentic')],
  results: [null, null], extras: [null, null],
  params: defaultParams(),
  clock: 0, start: 0, end: 0, playing: false, pauseAtBeats: true, speed: 24, forceReveal: false, lastMinute: null, revealed: null,
};

// ---------- URL hash (shareable links) ----------
const encodeSide = c => `${c.arch}-${c.model}-${c.routing ? 1 : 0}`;
function decodeSide(s) {
  const [arch, model, r] = (s ?? '').split('-');
  if (!ARCH_LABELS[arch] || !['traditional', 'agentic'].includes(model)) return null;
  return cfg(arch, model, r === '1');
}
function writeHash() {
  const q = new URLSearchParams({ s: state.scenario.id, v: state.variant, a: encodeSide(state.sides[0]), b: encodeSide(state.sides[1]) });
  history.replaceState(null, '', `#${q}`);
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  return { s: q.get('s'), v: q.get('v'), a: decodeSide(q.get('a')), b: decodeSide(q.get('b')) };
}

// ---------- data ----------
async function loadJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
async function loadScenario(id) {
  state.scenarios[id] ??= await loadJson(`scenarios/${id}.json`);
  return state.scenarios[id];
}

// ---------- simulation ----------
function computeExtras(scn, res, config) {
  const x = {};
  const blind = res.timeline.find(e => e.blindSpot);
  if (blind) {
    x.blind = {
      t: blind.t, rule: blind.rule, ruleName: blind.ruleName, text: blind.text, dropped: blind.dropped, sources: blind.sources,
      hint: blind.dropped
        ? (config.arch === 'index' ? 'Tiered storage or a data lake would keep these logs within the same budget. Try switching this side to Tiered.' : 'Raise the budget cap under Assumptions to collect these logs again.')
        : config.arch !== 'index' ? 'Detection-aware routing would copy the suspicious event into real-time detection. Try switching it on (ⓘ explains how).' : null,
    };
  }
  if (res.config.routing) {
    const alt = simulate(scn, state.variant, { ...config, routing: false }, state.params);
    const promoted = res.timeline.filter(e => e.storage === 'promoted');
    const eligible = SOURCES.filter(s => ['cheap', 'lake'].includes(res.plan.routes[s.id]) && ['dns', 'fw'].includes(s.id));
    const gb = Math.round(eligible.reduce((a, s) => a + s.gbPerDay, 0) * (1 - state.params.reduction / 100));
    const names = eligible.map(s => s.name).join(' and ');
    const n = promoted.length;
    const lines = [`Detection-aware routing copied ${n} suspicious event${n === 1 ? '' : 's'} (out of about ${gb} GB a day of ${names} logs) into real-time detection.`];
    const a0 = alt.metrics.firstAlertAt, a1 = res.metrics.firstAlertAt;
    if (a0 !== a1) {
      lines.push(`That moved the first alert from ${a0 == null ? 'never' : fmtTime(a0)} to ${fmtTime(a1)}, for about ${usd(res.metrics.cost.promoted)} a month.`);
    } else {
      lines.push(`It didn't change the first alert here: another rule had already caught the attack at ${a1 == null ? '—' : fmtTime(a1)}.`);
    }
    lines.push("It only works for patterns you anticipated. A domain that's 30 days old, or a server not yet on any threat-intel list, wouldn't be promoted. That's what hunting is for.");
    x.promo = { t: promoted[0]?.t ?? a1 ?? res.end, lines };
  }
  return x;
}

function runAll() {
  const scn = state.scenario;
  state.results = state.sides.map(c => simulate(scn, state.variant, c, state.params));
  state.extras = state.results.map((r, i) => computeExtras(scn, r, state.sides[i]));
  state.start = state.results[0].start;
  state.end = Math.max(state.results[0].end, state.results[1].end);
  const scrub = $('scrub');
  scrub.min = state.start; scrub.max = state.end; scrub.step = 1;
  state.clock = Math.min(Math.max(state.clock, state.start), state.end);
  panels.forEach((p, i) => { p.setConfig(state.sides[i]); p.setResult(state.results[i], state.extras[i], state.params); });
  narrator.setBeats(buildBeats(state.results[0], state.results[1]));
  state.lastMinute = null;
  state.revealed = null;
  render();
}

// ---------- rendering ----------
function render() {
  if (!state.results[0]) return;
  const minute = Math.floor(state.clock);
  if (minute !== state.lastMinute) {
    state.lastMinute = minute;
    $('clock').textContent = fmtTime(minute);
    $('scrub').value = minute;
    panels.forEach(p => p.update(minute));
    narrator.update(minute);
  }
  const revealed = state.forceReveal || state.clock >= state.end;
  if (revealed !== state.revealed) {
    state.revealed = revealed;
    renderSummary($('summary'), state.results[0], state.results[1], revealed, () => { state.forceReveal = true; render(); }, state.extras);
  }
  $('play').textContent = state.playing ? '❚❚ Pause' : state.clock >= state.end ? '↺ Replay' : state.clock > state.start ? '▶ Continue' : '▶ Play';
}

function renderIntro() {
  const s = state.scenario;
  const v = s.variants.find(x => x.id === state.variant);
  $('intro').replaceChildren(...[
    h('h2', {}, s.title),
    h('p', {}, s.oneLiner),
    v && v.id !== 'default' ? h('p', {}, h('strong', {}, 'Variant: '), v.label, '.') : null,
    s.paramOverrides ? h('p', { class: 'note' }, 'This scenario changes some assumptions: ',
      Object.entries(s.paramOverrides).map(([k, val]) => `${PARAMS.find(p => p.id === k)?.label ?? k} = ${typeof val === 'number' && val >= 1000 ? usd(val) : val}`).join(', '),
      '. You can adjust them under Assumptions.') : null,
    h('p', { class: 'teach' }, h('strong', {}, 'What to watch for: '), s.teaching),
  ].filter(Boolean));
}

function syncPresetSelect() {
  const match = PRESETS.find(p => encodeSide(p.a) === encodeSide(state.sides[0]) && encodeSide(p.b) === encodeSide(state.sides[1]));
  $('preset').value = match ? match.id : 'custom';
}

// ---------- playback ----------
let lastFrame = null;
function frame(ts) {
  if (!state.playing) { lastFrame = null; return; }
  if (lastFrame != null) {
    const prev = state.clock;
    state.clock += ((ts - lastFrame) / 1000) * state.speed;
    const beat = state.pauseAtBeats && narrator.beatTimes().find(t => t > prev && t <= state.clock && t < state.end);
    if (beat) { state.clock = beat; state.playing = false; }
    if (state.clock >= state.end) { state.clock = state.end; state.playing = false; }
  }
  lastFrame = ts;
  render();
  if (state.playing) requestAnimationFrame(frame);
}
function play() {
  if (state.clock >= state.end) { state.clock = state.start; state.forceReveal = false; panels.forEach((p, i) => p.setResult(state.results[i], state.extras[i], state.params)); state.lastMinute = null; }
  state.playing = true;
  requestAnimationFrame(frame);
  render();
}
function pause() { state.playing = false; render(); }

// ---------- setup ----------
const panels = [
  createPanel($('side-a'), 'A', { onConfig: c => onSideConfig(0, c), onInfo: showInfo, onPipeline: showPipeline }),
  createPanel($('side-b'), 'B', { onConfig: c => onSideConfig(1, c), onInfo: showInfo, onPipeline: showPipeline }),
];

const narrator = createNarrator($('narrator'), {
  onTogglePause: on => { state.pauseAtBeats = on; },
  onJump: t => { pause(); state.clock = t; render(); },
});

function onParams(p, live, reset) {
  state.params = reset ? { ...p, ...state.scenario?.paramOverrides } : p;
  runAll();
  if (!live || reset) renderParams($('params'), state.params, onParams);
}

function routingInfo() {
  const c = monthlyCost('tiered', true, state.params);
  return { share: `${state.params.promoteShare}%`, cost: usd(c.promoted) };
}
function showInfo() { openRoutingInfo(routingInfo()); }
function showPipeline(name) {
  const i = name === 'A' ? 0 : 1;
  openPipeline(state.scenario, state.results[i], state.params, `Side ${name}`);
}

function onSideConfig(i, c) {
  const turnedOn = c.routing && !state.sides[i].routing && c.arch !== 'index';
  state.sides[i] = c;
  syncPresetSelect();
  writeHash();
  runAll();
  if (turnedOn) openRoutingInfoFirstTime(routingInfo());
}

async function selectScenario(id, { variant, sides } = {}) {
  pause();
  // Undo the previous scenario's assumption overrides, then apply this one's.
  for (const k of Object.keys(state.scenario?.paramOverrides ?? {})) state.params[k] = PARAM_DEFAULTS[k];
  state.scenario = await loadScenario(id);
  state.params = { ...state.params, ...state.scenario.paramOverrides };
  renderParams($('params'), state.params, onParams);
  state.variant = state.scenario.variants.some(v => v.id === variant) ? variant : state.scenario.variants[0].id;
  if (sides) state.sides = sides;
  else {
    const p = PRESETS.find(x => x.id === (state.scenario.defaultPreset ?? DEFAULT_PRESET[id])) ?? PRESETS[0];
    state.sides = [{ ...p.a }, { ...p.b }];
  }
  $('scenario').value = id;
  const vs = $('variant');
  vs.replaceChildren(...state.scenario.variants.map(v => h('option', { value: v.id }, v.label)));
  vs.value = state.variant;
  $('variant-field').hidden = state.scenario.variants.length < 2;
  state.clock = parseTime(state.scenario.start);
  state.forceReveal = false;
  syncPresetSelect();
  renderIntro();
  writeHash();
  runAll();
}

async function init() {
  state.index = await loadJson('scenarios/index.json');
  $('scenario').replaceChildren(...state.index.map(s => h('option', { value: s.id }, s.short)));
  $('preset').replaceChildren(...PRESETS.map(p => h('option', { value: p.id }, p.label)), h('option', { value: 'custom' }, 'Custom (set each side below)'));

  $('scenario').addEventListener('change', e => selectScenario(e.target.value));
  $('variant').addEventListener('change', e => {
    state.variant = e.target.value; state.clock = state.start; state.forceReveal = false; pause();
    renderIntro(); writeHash(); runAll();
  });
  $('preset').addEventListener('change', e => {
    const p = PRESETS.find(x => x.id === e.target.value);
    if (!p) return;
    state.sides = [{ ...p.a }, { ...p.b }];
    writeHash(); runAll();
  });
  $('play').addEventListener('click', () => (state.playing ? pause() : play()));
  $('speed').addEventListener('change', e => { state.speed = Number(e.target.value); });
  $('scrub').addEventListener('input', e => { state.clock = Number(e.target.value); render(); });
  $('end').addEventListener('click', () => { pause(); state.clock = state.end; render(); });


  const hs = readHash();
  const id = state.index.some(s => s.id === hs.s) ? hs.s : state.index[0].id;
  await selectScenario(id, { variant: hs.v, sides: hs.a && hs.b ? [hs.a, hs.b] : null });
}

init().catch(err => {
  console.error(err);
  $('intro').replaceChildren(h('h2', {}, 'Could not load the simulator'), h('p', {}, String(err.message)),
    h('p', {}, 'If you opened index.html straight from disk, the browser blocks loading the scenario files. Use the GitHub Pages link, or run "python3 -m http.server" in the repo folder.'));
});
