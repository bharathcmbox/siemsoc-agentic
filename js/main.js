// App controller: one shared state drives three screens.
//   home     — the story picker
//   exec     — the race view for a story (default for everyone)
//   analyst  — the detailed comparison, behind the "Analyst view" switch
import { simulate, parseTime, fmtTime, ARCH_LABELS } from './engine/simulate.js';
import { defaultParams, SOURCES, PARAMS } from './engine/assumptions.js';
import { monthlyCost } from './engine/cost.js';
import { createPanel } from './ui/panel.js';
import { renderSummary } from './ui/summary.js';
import { renderParams } from './ui/params.js';
import { openRoutingInfo, openRoutingInfoFirstTime } from './ui/routing-info.js';
import { h, usd } from './ui/dom.js';
import { buildBeats, createNarrator, clock12 } from './ui/narrator.js';
import { openPipeline } from './ui/pipeline.js';
import { openAgentView } from './ui/agent-view.js';
import { renderHome, renderRace, icon } from './ui/exec.js';
import { renderRisks } from './ui/risks.js';
import { STORIES, findStory, storyFor, laneNames } from './stories.js';

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
  screen: 'home', view: 'exec', riskTopic: null,
  index: [], scenarios: {}, scenario: null, variant: 'default',
  sides: [cfg('index', 'traditional'), cfg('index', 'agentic')],
  results: [null, null], extras: [null, null], beats: [], names: null,
  params: defaultParams(),
  clock: 0, start: 0, end: 0, playing: false, pauseAtBeats: true, speed: 24,
  forceReveal: false, lastMinute: null, revealed: null,
};
let race = null;

// ---------- URL hash (shareable links) ----------
// Executive links: #story=phishing&cmp=team. Anything else, or the analyst
// view: #s=<scenario>&v=<variant>&a=<side>&b=<side>[&view=analyst].
// The risks screens: #risks, #risks/<group id>, #risks/injection.
const encodeSide = c => `${c.arch}-${c.model}-${c.routing ? 1 : 0}`;
function decodeSide(s) {
  const [arch, model, r] = (s ?? '').split('-');
  if (!ARCH_LABELS[arch] || !['traditional', 'agentic'].includes(model)) return null;
  return cfg(arch, model, r === '1');
}
function writeHash() {
  if (state.screen === 'home') { history.replaceState(null, '', location.pathname); return; }
  if (state.screen === 'risks') { history.replaceState(null, '', `#risks${state.riskTopic ? `/${state.riskTopic}` : ''}`); return; }
  const hit = findStory(state.scenario.id, state.variant, state.sides);
  const q = hit && state.view === 'exec'
    ? new URLSearchParams({ story: hit.story.id, cmp: hit.comparison.id })
    : new URLSearchParams({ s: state.scenario.id, v: state.variant, a: encodeSide(state.sides[0]), b: encodeSide(state.sides[1]), ...(state.view === 'analyst' ? { view: 'analyst' } : {}) });
  history.replaceState(null, '', `#${q}`);
}
function readHash() {
  const raw = location.hash.slice(1);
  if (raw === 'risks' || raw.startsWith('risks/')) return { risks: raw.slice(6) || null };
  const q = new URLSearchParams(raw);
  return { story: q.get('story'), cmp: q.get('cmp'), s: q.get('s'), v: q.get('v'), a: decodeSide(q.get('a')), b: decodeSide(q.get('b')), view: q.get('view') };
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
        : config.arch !== 'index' ? 'Smart routing would copy the suspicious event into real-time detection. Try switching it on (ⓘ explains how).' : null,
    };
  }
  if (res.config.routing) {
    const alt = simulate(scn, state.variant, { ...config, routing: false }, state.params);
    const promoted = res.timeline.filter(e => e.storage === 'promoted');
    const eligible = SOURCES.filter(s => ['cheap', 'lake'].includes(res.plan.routes[s.id]) && ['dns', 'fw'].includes(s.id));
    const gb = Math.round(eligible.reduce((a, s) => a + s.gbPerDay, 0) * (1 - state.params.reduction / 100));
    const names = eligible.map(s => s.name).join(' and ');
    const n = promoted.length;
    const lines = [`Smart routing copied ${n} suspicious event${n === 1 ? '' : 's'} (out of about ${gb} GB a day of ${names} logs) into real-time detection.`];
    const a0 = alt.metrics.firstAlertAt, a1 = res.metrics.firstAlertAt;
    if (a0 !== a1) {
      lines.push(`That moved the first alert from ${a0 == null ? 'never' : clock12(a0)} to ${clock12(a1)}, for about ${usd(res.metrics.cost.promoted)} a month.`);
    } else {
      lines.push(`It didn't change the first alert here: another check had already caught the attack at ${a1 == null ? '—' : clock12(a1)}.`);
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
  state.names = laneNames(scn.id, state.variant, state.sides, state.results.map(r => usd(r.metrics.cost.total)));
  state.beats = buildBeats(state.results[0], state.results[1], state.names.map(n => n.ref));
  state.start = state.results[0].start;
  state.end = Math.max(state.results[0].end, state.results[1].end);
  const scrub = $('scrub');
  scrub.min = state.start; scrub.max = state.end; scrub.step = 1;
  state.clock = Math.min(Math.max(state.clock, state.start), state.end);
  panels.forEach((p, i) => {
    p.setConfig(state.sides[i]);
    p.setTitle(`Side ${i ? 'B' : 'A'}: ${state.names[i].title}`);
    p.setResult(state.results[i], state.extras[i], state.params);
  });
  narrator.setBeats(state.beats);
  buildRace();
  state.lastMinute = null;
  state.revealed = null;
  render();
}

function buildRace() {
  if (state.screen !== 'story') return;
  const hit = findStory(state.scenario.id, state.variant, state.sides);
  const story = hit?.story ?? storyFor(state.scenario.id, state.variant);
  race = renderRace($('exec'), {
    story, scenario: state.scenario, comparisonId: hit?.comparison.id ?? null,
    names: state.names, A: state.results[0], B: state.results[1], beats: state.beats,
    speed: state.speed, pauseAt: state.pauseAtBeats,
    onBack: goHome,
    onCompare: id => openStory(story.id, id),
    onPlay: () => (state.playing ? pause() : play()),
    onSpeed: v => { state.speed = v; $('speed').value = String(v); },
    onPause: on => { state.pauseAtBeats = on; narrator.setPause(on); },
    onJump: dir => jumpBeat(dir),
    onAgentView: i => openAgentView(state.results[i], state.names[i].ref),
    onPipeline: i => openPipeline(state.scenario, state.results[i], state.params, state.names[i].title),
  });
}

// ---------- rendering ----------
function render() {
  if (!state.results[0]) return;
  const minute = Math.floor(state.clock);
  if (minute !== state.lastMinute) {
    state.lastMinute = minute;
    $('clock').textContent = fmtTime(minute);
    $('scrub').value = minute;
    if (state.view === 'analyst') {
      panels.forEach(p => p.update(minute));
      narrator.update(minute);
    }
  }
  if (race && state.view === 'exec' && state.screen === 'story') race.update(state.clock, state.playing);
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

function showScreen() {
  const story = state.screen === 'story';
  $('home').hidden = state.screen !== 'home';
  $('risks').hidden = state.screen !== 'risks';
  $('exec').hidden = !story || state.view !== 'exec';
  $('analyst').hidden = !story || state.view !== 'analyst';
  $('view-switch').hidden = !story;
  $('view-switch').setAttribute('aria-pressed', String(state.view === 'analyst'));
}

// ---------- playback ----------
let lastFrame = null;
function frame(ts) {
  if (!state.playing) { lastFrame = null; return; }
  if (lastFrame != null) {
    const prev = state.clock;
    state.clock += ((ts - lastFrame) / 1000) * state.speed;
    const beat = state.pauseAtBeats && state.beats.find(b => b.t > prev && b.t <= state.clock && b.t < state.end);
    if (beat) { state.clock = beat.t; state.playing = false; }
    if (state.clock >= state.end) { state.clock = state.end; state.playing = false; }
  }
  lastFrame = ts;
  render();
  if (state.playing) requestAnimationFrame(frame);
}
function play() {
  if (state.clock >= state.end) {
    state.clock = state.start; state.forceReveal = false;
    panels.forEach((p, i) => p.setResult(state.results[i], state.extras[i], state.params));
    buildRace();
    state.lastMinute = null;
  }
  state.playing = true;
  lastFrame = null;
  requestAnimationFrame(frame);
  render();
}
function pause() { state.playing = false; render(); }
function jumpBeat(dir) {
  let idx = -1;
  state.beats.forEach((b, i) => { if (b.t <= state.clock) idx = i; });
  const i = Math.max(0, Math.min(state.beats.length - 1, idx + dir));
  state.playing = false;
  state.clock = state.beats[i].t;
  render();
}

// ---------- setup ----------
const panels = [
  createPanel($('side-a'), 'A', { onConfig: c => onSideConfig(0, c), onInfo: showInfo, onPipeline: showPipeline, onAgent: showAgent }),
  createPanel($('side-b'), 'B', { onConfig: c => onSideConfig(1, c), onInfo: showInfo, onPipeline: showPipeline, onAgent: showAgent }),
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
function showAgent(name) { const i = name === 'A' ? 0 : 1; openAgentView(state.results[i], state.names[i].ref); }
function showPipeline(name) {
  const i = name === 'A' ? 0 : 1;
  openPipeline(state.scenario, state.results[i], state.params, `Side ${name}: ${state.names[i].title}`);
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

async function openStory(storyId, cmpId) {
  const story = STORIES.find(s => s.id === storyId) ?? STORIES[0];
  const cmp = story.comparisons.find(c => c.id === cmpId) ?? story.comparisons[0];
  state.screen = 'story';
  showScreen();
  await selectScenario(story.scenario, { variant: story.variant, sides: [{ ...cmp.a }, { ...cmp.b }] });
  window.scrollTo(0, 0);
}

function goHome() {
  if (state.playing) pause();
  state.screen = 'home';
  race = null;
  showScreen();
  writeHash();
  window.scrollTo(0, 0);
}

// topic: null (all risks), a group id (scrolls to it), or 'injection' (the deep dive).
function openRisks(topic = null) {
  if (state.playing) pause();
  state.screen = 'risks';
  state.riskTopic = topic;
  race = null;
  renderRisks($('risks'), { topic, onBack: goHome, onOpen: openRisks });
  showScreen();
  writeHash();
  const target = topic && topic !== 'injection' && document.getElementById(`r-${topic}`);
  if (target) target.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
}

function setView(view) {
  state.view = view;
  showScreen();
  state.lastMinute = null;
  if (view === 'exec') buildRace();
  writeHash();
  render();
}

// ---------- app bar ----------
function renderThemeButton() {
  const dark = document.documentElement.dataset.theme !== 'light';
  $('theme').replaceChildren(icon(dark ? 'sun' : 'moon'), dark ? 'Light' : 'Dark');
  $('theme').setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} background`);
}

async function init() {
  $('brand').replaceChildren(icon('shield'), h('span', {}, 'Agentic SOC Simulator'));
  $('brand').addEventListener('click', goHome);
  renderThemeButton();
  $('theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('soc-sim.theme', next); } catch { /* storage unavailable */ }
    renderThemeButton();
  });
  $('view-switch').addEventListener('click', () => setView(state.view === 'exec' ? 'analyst' : 'exec'));
  renderHome($('home'), { onStory: id => openStory(id), onRisks: openRisks });

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
  $('speed').addEventListener('change', e => { state.speed = Number(e.target.value); buildRace(); render(); });
  $('scrub').addEventListener('input', e => { state.clock = Number(e.target.value); render(); });
  $('end').addEventListener('click', () => { pause(); state.clock = state.end; render(); });

  // Presenter keys on the story screens: arrows step through moments, space plays.
  document.addEventListener('keydown', e => {
    if (state.screen !== 'story' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest('input, select, textarea, dialog')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); jumpBeat(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); jumpBeat(-1); }
    else if (e.key === ' ' && !e.target.closest('button, summary')) { e.preventDefault(); state.playing ? pause() : play(); }
  });

  const hs = readHash();
  if ('risks' in hs) return openRisks(hs.risks);
  if (hs.story) return openStory(hs.story, hs.cmp);
  if (hs.s && state.index.some(s => s.id === hs.s)) {
    state.screen = 'story';
    state.view = hs.view === 'analyst' ? 'analyst' : 'exec';
    showScreen();
    return selectScenario(hs.s, { variant: hs.v, sides: hs.a && hs.b ? [hs.a, hs.b] : null });
  }
  showScreen();
}

init().catch(err => {
  console.error(err);
  $('home').replaceChildren(h('h2', {}, 'Could not load the simulator'), h('p', {}, String(err.message)),
    h('p', {}, 'If you opened index.html straight from disk, the browser blocks loading the scenario files. Use the GitHub Pages link, or run "python3 -m http.server" in the repo folder.'));
});
