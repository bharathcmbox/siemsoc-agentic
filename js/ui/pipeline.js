// "Inside the pipeline": follow one real event from the scenario through
// parse → normalize → enrich → reduce → route, plus where the whole day's
// volume ends up for this side's configuration.
import { h, usd } from './dom.js';
import { SOURCES } from '../engine/assumptions.js';
import { isPromotable } from '../engine/cost.js';
import { ARCH_LABELS, MODEL_LABELS } from '../engine/simulate.js';

const STEPS = [
  { id: 'raw', name: 'Raw', what: 'What the device actually sends: a line of text in its own format. Every vendor and product has a different one.' },
  { id: 'parsed', name: '1. Parse', what: 'Split the text into named fields. Without this, the event can only be found by free-text search.' },
  { id: 'normalized', name: '2. Normalize', what: 'Rename the fields to one common schema (here, loosely modeled on OCSF, an open standard). Now one detection rule works across every DNS server or firewall brand.' },
  { id: 'enriched', name: '3. Enrich', what: 'Add context the raw log never had: which laptop and person this was, how old the domain is, whether it is on a threat-intel list. Done once here, it saves every analyst and agent the lookup later.' },
  { id: 'reduced', name: '4. Reduce', what: 'Trim fields nobody uses and collapse duplicates. This is where the volume, and the bill, comes down.' },
  { id: 'route', name: '5. Route', what: 'Decide where the event is stored. This is the step that decides what real-time detection can see.' },
];

const DEST = { hot: 'Hot tier (real-time rules can see it)', cheap: 'Cheap storage (searchable later, slowly)', lake: 'Data lake (queryable later, in minutes)', dropped: 'Not collected (over the SIEM budget)' };

let dialog;
let body;

function build() {
  body = h('div', { class: 'dlg' });
  dialog = h('dialog', { class: 'wide', 'aria-label': 'Inside the pipeline' }, body);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

function show(v) {
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

function routeStep(demo, result) {
  const src = SOURCES.find(s => s.id === demo.source);
  const route = result.plan.routes[demo.source];
  const promoted = result.config.routing && (route === 'cheap' || route === 'lake') && isPromotable(demo.source);
  const lines = [
    `Source: ${src.name}, labelled "${src.value}" value.`,
    `This setup (${ARCH_LABELS[result.config.arch]}) sends it to: ${DEST[route]}.`,
  ];
  if (route === 'dropped') lines.push('The budget cap forced this whole source out, so the event is never stored anywhere.');
  if (promoted) lines.push(`Detection-aware routing is on, and this event matches a pattern (${demo.pattern}), so a copy also goes to the hot tier.`);
  else if (result.config.routing && route === 'hot') lines.push('Routing is on, but this source already goes to the hot tier.');
  else if (route === 'cheap' || route === 'lake') lines.push(`Detection-aware routing is off, so the rules that would have matched (${demo.pattern}) never see it in real time.`);
  return lines;
}

function volumeBars(result, params) {
  const keep = 1 - params.reduction / 100;
  const total = SOURCES.reduce((a, s) => a + s.gbPerDay, 0);
  const by = { hot: 0, cheap: 0, lake: 0, dropped: 0 };
  for (const s of SOURCES) by[result.plan.routes[s.id]] += s.gbPerDay * keep;
  const promoted = SOURCES.filter(s => result.config.routing && ['cheap', 'lake'].includes(result.plan.routes[s.id]) && isPromotable(s.id))
    .reduce((a, s) => a + s.gbPerDay * keep * params.promoteShare / 100, 0);
  const rows = [
    ['Arrives at the pipeline', total, 'in'],
    ['Trimmed away (duplicates, unused fields)', total * (1 - keep), 'cut'],
    ['Hot tier', by.hot, 'hot'],
    ['Cheap storage', by.cheap, 'cold'],
    ['Data lake', by.lake, 'cold'],
    ['Not collected (over budget)', by.dropped, 'drop'],
    ['Copied to hot by routing', promoted, 'promo'],
  ].filter(([, v], i) => i < 3 || v > 0);
  return h('div', { class: 'vol' }, rows.map(([label, v, cls]) => h('div', { class: 'vol-row' },
    h('span', { class: 'vol-lbl' }, label),
    h('span', { class: 'vol-bar' }, h('span', { class: `vol-fill ${cls}`, style: `width:${Math.max(0.6, (100 * v) / total)}%` })),
    h('span', { class: 'vol-num' }, v >= 10 ? `${Math.round(v)} GB` : `${v.toFixed(1)} GB`),
  )));
}

export function openPipeline(scenario, result, params, sideName) {
  if (!dialog) build();
  const demo = scenario.pipelineDemo;
  let step = 0;
  const content = h('div');
  const tabs = h('div', { class: 'steps', role: 'tablist' });

  const render = () => {
    tabs.replaceChildren(...STEPS.map((st, i) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(i === step), class: 'step', onclick: () => { step = i; render(); },
    }, st.name)));
    const st = STEPS[step];
    content.replaceChildren(
      h('p', {}, st.what),
      st.id === 'route'
        ? h('ul', {}, routeStep(demo, result).map(l => h('li', {}, l)))
        : h('pre', { class: 'code' }, show(demo.stages[st.id])),
      demo.notes?.[st.id] ? h('p', { class: 'note' }, demo.notes[st.id]) : null,
      h('div', { class: 'close-row' },
        h('button', { type: 'button', class: 'btn', disabled: step === 0, onclick: () => { step--; render(); } }, '← Back'),
        step < STEPS.length - 1
          ? h('button', { type: 'button', class: 'btn primary', onclick: () => { step++; render(); } }, 'Next step →')
          : h('button', { type: 'button', class: 'btn primary', onclick: () => dialog.close() }, 'Done')),
    );
  };

  body.replaceChildren(
    h('h2', {}, 'Inside the pipeline'),
    h('p', { class: 'note' }, `${sideName}: ${ARCH_LABELS[result.config.arch]} · ${MODEL_LABELS[result.config.model]}${result.config.routing ? ' · routing on' : ''}. Following one event from this scenario: ${demo.caption}.`),
    tabs, content,
    h('h3', {}, 'The whole day, for this setup'),
    volumeBars(result, params),
    h('p', { class: 'note' }, `Monthly data cost for this setup: ${usd(result.metrics.cost.total)}.`),
  );
  render();
  if (!dialog.open) dialog.showModal();
}
