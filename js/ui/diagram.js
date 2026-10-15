// Per-side architecture diagram: sources → pipeline → storage → detection →
// response, drawn for that side's configuration. Events animate along their
// path as the clock passes them; clicking a component explains it.
import { SOURCES } from '../engine/assumptions.js';
import { isPromotable } from '../engine/cost.js';
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
};

const EXPLAIN = {
  idp: 'Identity provider: every sign-in and MFA prompt. Small and high value, so it always goes to the hot tier.',
  email: 'Email and mailbox audit: messages, inbox rules, and API access to mailboxes.',
  edr: 'EDR: process, file, and network activity on laptops and servers.',
  cloud: 'Cloud control plane: changes to cloud accounts and resources.',
  fw: 'Firewall: every allowed or denied connection. Very high volume and mostly routine, but it is where malware calling home shows up.',
  dns: 'DNS and web proxy: every domain looked up and site visited. Very high volume and often labelled low value, but it is where phishing and malware first show up.',
  pipeline: 'The pipeline parses, normalizes, enriches, trims, and routes every event before any security tool sees it. Its routing rules decide what detection can see. Open "Inside the pipeline" to follow one event through.',
  hot: 'Hot tier: indexed and searchable in seconds. Real-time detection rules only run here. The most expensive place to keep data.',
  cheap: "Cheap storage: kept for months at a fraction of the cost. Searching it is a slower job billed per search, and real-time rules don't run on it.",
  lake: 'Data lake: open-format files in object storage, queried in place. Cheapest to keep, queries take minutes, and real-time detection needs a separate streaming path.',
  dropped: 'Not collected: sources cut to stay within the SIEM budget. Nothing can detect or investigate with them, now or later.',
  rules: 'Real-time detection rules watch hot data as it arrives and raise alerts. They cannot see cheap storage, the lake, or anything not collected.',
  huntOn: "Scheduled sweep: an automated nightly search of stored data for known patterns the real-time rules couldn't see, such as newly registered domains or new threat-intel matches. Any SIEM can run one. Late, but better than never. On the agentic side, an AI agent picks up the hit straight away; otherwise it waits for the on-call analyst.",
  huntOff: 'No scheduled sweep in this setup. Stored data is only searched when someone thinks to look.',
  soar: 'SOAR + analysts: alerts wait in a queue, Tier-1 triages, Tier-2 investigates by hand across tools, and SOAR runs fixed playbooks.',
  agents: 'AI agents triage every alert on arrival, query every tool and data tier, and propose actions with the evidence attached.',
  approval: 'Human approval: an analyst reviews the evidence and approves high-impact actions. The agent does not act alone on those.',
};

const COLD_LABEL = { cheap: 'Cheap storage', lake: 'Data lake' };

export function createDiagram(root, { onPipeline }) {
  let result;
  let lastClock = null;
  const svg = s('svg', { viewBox: '0 0 720 270', class: 'arch', role: 'img' });
  const title = s('title');
  svg.append(title);
  const explain = h('p', { class: 'arch-explain', 'aria-live': 'polite' }, 'Click any part of the diagram to see what it does.');
  const pipeBtn = h('button', { type: 'button', class: 'btn small', onclick: () => onPipeline() }, 'Inside the pipeline →');
  root.append(h('div', { class: 'arch-scroll' }, svg), h('div', { class: 'arch-foot' }, explain, pipeBtn));

  const boxes = {};   // key -> { g, cx, cy, x, y, w, h }
  const paths = {};   // `${source}->${dest}` -> path element

  function box(key, x, y, w, hgt, label, sub, cls = '') {
    const g = s('g', { class: `node ${cls}`, tabindex: 0, role: 'button', 'aria-label': `${label}. ${sub ?? ''}` });
    g.append(s('rect', { x, y, width: w, height: hgt, rx: 6 }));
    const ly = key === 'pipeline' ? y + 20 : y + (sub ? hgt / 2 - 2 : hgt / 2 + 4);
    g.append(s('text', { x: x + w / 2, y: ly, 'text-anchor': 'middle', class: 'lbl' }, label));
    if (sub) g.append(s('text', { x: x + w / 2, y: y + hgt / 2 + 11, 'text-anchor': 'middle', class: 'sub' }, sub));
    const show = () => { explain.textContent = EXPLAIN[key.split(':')[0]] ?? ''; if (key === 'pipeline') onPipeline(); };
    g.addEventListener('click', show);
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
    svg.append(g);
    boxes[key] = { g, x, y, w, h: hgt, cx: x + w / 2, cy: y + hgt / 2 };
    return g;
  }

  function edge(x1, y1, x2, y2, cls, key) {
    const mx = (x1 + x2) / 2;
    const p = s('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, class: `edge ${cls}` });
    svg.insertBefore(p, svg.firstChild.nextSibling);
    if (key) paths[key] = p;
    return p;
  }

  function draw() {
    for (const k of Object.keys(boxes)) delete boxes[k];
    for (const k of Object.keys(paths)) delete paths[k];
    svg.replaceChildren(title);
    const { routes } = result.plan;
    const { arch, model, routing } = result.config;
    const keep = 1 - (result.params?.reduction ?? 30) / 100;
    const coldKind = arch === 'lake' ? 'lake' : 'cheap';
    title.textContent = `Architecture: ${arch}, ${model}${routing ? ', routing on' : ''}`;

    // Columns
    SOURCES.forEach((src, i) => {
      const y = 12 + i * 41;
      const route = routes[src.id];
      box(`${src.id}`, 8, y, 124, 32, src.name, `${Math.round(src.gbPerDay * keep)} GB/day`, route === 'dropped' ? 'dropped' : '');
    });
    box('pipeline', 168, 12, 104, 237, 'Pipeline', null, 'pipeline');
    ['Parse', 'Normalize', 'Enrich', 'Reduce', 'Route'].forEach((st, i) => {
      svg.append(s('text', { x: 220, y: 66 + i * 40, 'text-anchor': 'middle', class: 'stage' }, `${i + 1}. ${st}`));
    });

    const coldUsed = Object.values(routes).some(r => r === 'cheap' || r === 'lake');
    const anyDropped = Object.values(routes).includes('dropped');
    box('hot', 312, 12, 124, 96, 'Hot tier', 'indexed, real-time', 'hot');
    box(coldKind, 312, 124, 124, 70, COLD_LABEL[coldKind], coldUsed ? 'slow, cheap search' : 'not used', coldUsed ? 'cold' : 'cold unused');
    box('dropped', 312, 208, 124, 41, 'Not collected', anyDropped ? 'over budget' : 'nothing dropped', anyDropped ? 'dropped' : 'unused');

    box('rules', 472, 12, 104, 96, 'Real-time rules', 'detection', 'rules');
    const hunting = !!result.params?.scheduledSweep;
    box(hunting ? 'huntOn' : 'huntOff', 472, 124, 104, 70, hunting ? 'Scheduled sweep' : 'No sweep', hunting ? (model === 'agentic' ? 'nightly; AI triages hits' : 'nightly job') : '', hunting ? 'hunt' : 'unused');

    if (model === 'agentic') {
      box('agents', 608, 12, 104, 110, 'AI agents', 'triage, investigate', 'agent');
      box('approval', 608, 138, 104, 56, 'Human approval', 'high-impact steps', 'human');
      edge(660, 122, 660, 138, 'flow', null);
    } else {
      box('soar', 608, 12, 104, 182, 'SOAR + analysts', 'queue, playbooks', 'human');
    }

    // Edges
    SOURCES.forEach(src => {
      const b = boxes[src.id];
      edge(132, b.cy, 168, b.cy, 'flow', null);
      const route = routes[src.id];
      const dest = route === 'hot' ? 'hot' : route === 'dropped' ? 'dropped' : coldKind;
      const d = boxes[dest];
      const p = edge(272, b.cy, 312, d.cy, route === 'hot' ? 'flow hot' : route === 'dropped' ? 'flow drop' : 'flow cold', `${src.id}->${dest}`);
      paths[`${src.id}->${route}`] = p;
      if (routing && (route === 'cheap' || route === 'lake') && isPromotable(src.id)) {
        paths[`${src.id}->promoted`] = edge(272, b.cy, 312, boxes.hot.cy + 30, 'flow promo', null);
      }
    });
    edge(436, boxes.hot.cy, 472, boxes.rules.cy, 'flow hot', null);
    if (hunting && coldUsed) edge(436, boxes[coldKind].cy, 472, boxes.huntOn.cy, 'flow cold', null);
    edge(576, boxes.rules.cy, 608, 60, 'flow', null);
    if (hunting) edge(576, boxes.huntOn.cy, 608, 90, 'flow cold', null);
    if (routing) svg.append(s('text', { x: 292, y: boxes.hot.cy + 44, 'text-anchor': 'middle', class: 'promo-lbl' }, 'promoted'));
  }

  function pulse(key, cls = 'pulse') {
    const b = boxes[key];
    if (!b) return;
    b.g.classList.remove(cls); void b.g.getBBox(); b.g.classList.add(cls);
  }

  function travel(source, storage) {
    const p = paths[`${source}->${storage}`];
    const first = boxes[source];
    if (!p || !first) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pulse(storage === 'promoted' ? 'hot' : storage === 'dropped' ? 'dropped' : storage === 'hot' ? 'hot' : storage);
      return;
    }
    const dot = s('circle', { r: 5, class: `dot ${storage}` });
    svg.append(dot);
    const len = p.getTotalLength();
    const t0 = performance.now();
    const dur = 900;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      // First third: source → pipeline. Rest: along the routing edge.
      let x, y;
      if (k < 0.33) {
        const f = k / 0.33;
        x = 132 + (272 - 132) * f; y = first.cy;
      } else {
        const pt = p.getPointAtLength(len * ((k - 0.33) / 0.67));
        x = pt.x; y = pt.y;
      }
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      if (k < 1) requestAnimationFrame(step);
      else { dot.remove(); pulse(storage === 'promoted' ? 'hot' : storage === 'cheap' || storage === 'lake' ? storage : storage); }
    };
    requestAnimationFrame(step);
  }

  return {
    setResult(res, params) {
      result = { ...res, params };
      draw();
      lastClock = null;
    },
    update(clock) {
      if (!result) return;
      if (lastClock != null && clock > lastClock && clock - lastClock <= 30) {
        for (const e of result.timeline) {
          if (e.t <= lastClock || e.t > clock) continue;
          if (e.source && e.storage && !e.prevented) travel(e.source, e.storage);
          if (e.lane === 'detect' && !e.sweep) pulse(e.missed ? 'rules' : 'rules', e.missed ? 'miss' : 'pulse');
          if (e.sweep) pulse('huntOn');
          if (e.lane === 'agent') pulse('agents');
          if (e.lane === 'human') pulse(result.config.model === 'agentic' ? 'approval' : 'soar');
        }
      }
      lastClock = clock;
    },
  };
}
