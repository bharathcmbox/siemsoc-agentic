// Executive view: story picker and the race view (two lanes on one clock,
// a narrated caption, a scoreboard, and the verdict).
import { h, usd } from './dom.js';
import { STORIES } from '../stories.js';
import { clock12 } from './narrator.js';
import { fmtDuration } from '../engine/simulate.js';

const svg = markup => { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; };
export const ICONS = {
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5.5c0 4.3 2.9 8 7 9.5 4.1-1.5 7-5.2 7-9.5V6z"/><path d="m9 12 2 2 4-4" stroke-linecap="round"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/></svg>',
  storage: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6"/><path d="M5 12v6c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-6"/></svg>',
  quiet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.6 3.8M6.6 6.6C4.6 8 3.2 10 2.5 12c1 2.5 4.5 7 9.5 7 1.8 0 3.4-.6 4.8-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  budget: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v16M7 20h10"/><path d="M5 8h14"/><path d="m5 8-3 6a3 3 0 0 0 6 0Z"/><path d="m19 8-3 6a3 3 0 0 0 6 0Z"/></svg>',
  storm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z"/><path d="M10 19.5a2 2 0 0 0 4 0"/><path d="M2 5l2 1M22 5l-2 1"/></svg>',
  agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/><path d="M3 13v2M21 13v2"/></svg>',
  pipeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h6l3 6 3-6h6"/><path d="M12 12v8"/><path d="m9 17 3 3 3-3"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
  replay: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/></svg>',
  prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
};
export const icon = name => svg(ICONS[name]);

const hour12 = t => { const hh = Math.floor((((t % 1440) + 1440) % 1440) / 60); return `${hh % 12 || 12} ${hh >= 12 ? 'pm' : 'am'}`; };
const short12 = t => clock12(t).replace(' (next day)', '');
const fmtMins = n => (n >= 120 ? `${Math.round(n / 6) / 10} h` : `${Math.round(n)} min`);

const RISKS = [
  ['Confident but wrong conclusions', 'Every claim the agent makes should link to the evidence, so a person can check it.'],
  ['Closing a real attack as harmless', "Spot-check the cases it closes, and don't let it close high-risk ones on its own."],
  ['Being tricked by text hidden in logs', 'Attackers can plant instructions in data the agent reads. Treat log content as data, limit what the agent can do, and require approval for big actions.'],
  ['Runaway search costs', 'Searching cheap storage costs money per search. Set a spending limit for each investigation.'],
  ['Too much power', "Give it only the permissions it needs. A person approves anything that locks out accounts or shuts down systems."],
  ['Hard to audit afterwards', 'Keep a step-by-step record of every search and action, so you can replay why something was done.'],
];

const QUESTIONS = [
  'Which actions can the AI take without a person approving? Can we set that per action and per system?',
  'Which of our data can it reach, and how long does it take to search the cheaper storage?',
  'Does it only respond to alerts, or does it also look for trouble on its own? How often?',
  'Does every conclusion show the evidence behind it? Can we replay an investigation step by step?',
  'How does it handle attacker-controlled text inside logs and emails?',
  'What limits the cost of searches in a single investigation?',
  'How do you measure its accuracy, especially how often it wrongly closes a real attack?',
  'If it works across our existing tools, what happens when one of them is slow or down?',
  'Will it help us decide which logs to keep in fast storage and which to keep cheaply?',
];

const GLOSSARY = [
  ['Logs', 'Records that systems keep of what happened: sign-ins, emails, web visits, network connections.'],
  ['Real-time detection', 'Automatic checks that watch logs as they arrive and raise an alert.'],
  ['Cheap storage', 'Where many companies now keep noisy logs. Much cheaper, but slower to search, and real-time checks don\'t look there.'],
  ['Data lake', 'A very cheap, very large store of logs that can be searched in minutes.'],
  ['Smart routing', 'Sending a copy of a few suspicious events from cheap storage to real-time detection. Also called detection-aware routing.'],
  ['Scheduled sweep', 'An automated nightly search of stored logs for known warning signs. Any security tool can run one.'],
  ['AI agent', 'Software that investigates alerts the way an analyst would: gathering evidence, drawing conclusions, proposing what to do.'],
  ['Stopping the attacker', 'Locking the attacker out: signing them out, resetting passwords, cutting a machine off the network.'],
];

// ---------------- home ----------------
export function renderHome(root, { onStory }) {
  root.replaceChildren(
    h('section', { class: 'hero' },
      h('h1', {}, "See how an AI-assisted security team handles the same attack as today's team."),
      h('p', {}, "Pick a story. Two teams face the same attack, side by side, on the same clock. You'll see when each one notices, when each one stops the attacker, and what it costs."),
      h('p', { class: 'how' }, icon('clock'), 'Each story takes a few minutes. Pause whenever you like; the scoreboard keeps up.'),
      h('p', { class: 'how' }, icon('agent'), 'Inside every story: see how the AI agent works, and how a log line becomes evidence.'),
    ),
    h('section', { class: 'stories', 'aria-label': 'Stories' },
      STORIES.map(s => h('button', { class: 'story', type: 'button', onclick: () => onStory(s.id) },
        h('span', { class: 'ic' }, icon(s.icon)),
        h('h2', {}, s.question),
        h('p', {}, s.hook),
        h('span', { class: 'meta' },
          h('span', {}, s.comparisons.length > 1 ? `${s.comparisons.length} ways to watch` : s.comparisons[0].label),
          h('span', { class: 'go' }, 'Watch →')),
      ))),
    h('p', { class: 'home-foot' },
      h('span', {}, 'All companies, people and figures are fictional or illustrative.'),
      h('span', {}, 'Want the details? Open any story and switch on Analyst view.')),
  );
}

// ---------------- race view ----------------
// ctx: { story, scenario, comparisonId, names, A, B, beats, onCompare, onBack,
//        onPlay, onSpeed, onPause, onJump, speed, pauseAt }
export function renderRace(root, ctx) {
  const { A, B, names, beats, story, scenario } = ctx;
  const start = A.start, end = Math.max(A.end, B.end);
  const f = t => Math.max(0, Math.min(1, (t - start) / (end - start)));
  const pct = t => `${100 * f(t)}%`;
  const step = end - start > 900 ? 180 : end - start > 600 ? 120 : 60;
  const ticks = [];
  for (let t = Math.ceil(start / 60) * 60; t <= end; t += step) ticks.push(t);
  const L = A.labels;

  const lane = (n, R, side) => {
    const m = R.metrics;
    const mk = (cls, t, label, dir) => (t == null ? null : h('div', {
      class: `marker ${dir}${f(t) > 0.9 ? ' edge' : f(t) < 0.1 ? ' start' : ''}`, 'data-t': t, style: `left:${pct(t)}`, hidden: true,
    }, dir === 'up'
      ? [h('span', {}, h('b', {}, label), ' ', h('span', { class: 't' }, short12(t))), h('span', { class: `pin ${cls}` })]
      : [h('span', { class: `pin ${cls}` }), h('span', {}, h('b', {}, label), ' ', h('span', { class: 't' }, short12(t)))]));
    const goalDir = m.containedAt != null && m.objectiveAt != null && Math.abs(m.containedAt - m.objectiveAt) < (end - start) * 0.12 ? 'up' : 'down';
    const laneEl = h('div', { class: 'lane', 'data-side': side },
      h('div', { class: 'track' }, ['calm', 'undetected', 'active', 'stopped'].map(c => h('span', { class: `span ${c}` }))),
      mk('detected', m.firstAlertAt, 'Spotted', 'up'),
      mk('stopped', m.containedAt, 'Stopped', 'down'),
      mk('goal', m.objectiveAt, 'Attacker succeeds', goalDir),
    );
    return [
      h('div', { class: 'lane-name' },
        h('span', { class: 'who' }, h('span', { class: 'dot', style: `background:var(--${side})` }), n.title),
        h('span', { class: 'sub' }, n.sub)),
      laneEl,
    ];
  };

  const playBtn = h('button', { class: 'play', type: 'button', onclick: ctx.onPlay });
  const clockEl = h('div', { class: 'x-clock', 'aria-live': 'off' }, '', h('small'));
  const count = h('div', { class: 'count' });
  const lines = h('div', { 'aria-live': 'polite' });
  const capLinks = h('div', { class: 'cap-links' });
  const openView = l => (l.kind === 'agent' ? ctx.onAgentView(l.side) : ctx.onPipeline(l.side));
  const prev = h('button', { class: 'cap-step', type: 'button', 'aria-label': 'Previous moment', onclick: () => ctx.onJump(-1) }, icon('prev'));
  const next = h('button', { class: 'cap-step', type: 'button', 'aria-label': 'Next moment', onclick: () => ctx.onJump(1) }, icon('next'));
  const now = h('div', { class: 'now' });
  const scores = h('section', { class: 'scores', 'aria-label': 'Scoreboard' });
  const verdict = h('section', { class: 'verdict panel', hidden: true, 'aria-label': 'Verdict' });
  const speedBtns = [[8, 'Slow'], [24, 'Normal'], [80, 'Fast']].map(([v, l]) => h('button', {
    type: 'button', 'aria-pressed': String(v === ctx.speed), onclick: e => {
      ctx.onSpeed(v);
      speedBtns.forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    },
  }, l));
  const comparisons = story?.comparisons ?? [];

  // Two always-visible doorways into the deeper views. When the sides differ
  // in a way that matters, offer one link per side.
  function exploreCards() {
    const agentic = [A, B].map((R, i) => (R.config.model === 'agentic' ? i : -1)).filter(i => i >= 0);
    const sameData = A.config.arch === B.config.arch && A.config.routing === B.config.routing;
    const sideLinks = (idxs, fn) => (idxs.length === 1 ? null
      : h('span', { class: 'explore-sides' }, idxs.map(i => h('button', { type: 'button', class: 'cap-link', onclick: e => { e.stopPropagation(); fn(i); } }, `${names[i].title} →`))));
    const card = (iconName, title, text, idxs, fn) => h('div', {
      class: 'explore-card', role: idxs.length === 1 ? 'button' : null, tabindex: idxs.length === 1 ? 0 : null,
      onclick: idxs.length === 1 ? () => fn(idxs[0]) : null,
      onkeydown: idxs.length === 1 ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(idxs[0]); } } : null,
    },
      h('span', { class: 'ic' }, icon(iconName)),
      h('span', { class: 'explore-text' }, h('b', {}, title, idxs.length === 1 ? ' →' : ''), h('span', {}, text), sideLinks(idxs, fn)));
    return h('section', { class: 'explore', 'aria-label': 'Explore' },
      agentic.length ? card('agent', 'Inside the agent', 'How the AI team worked this case, step by step: as one agent or a team of specialists, with who is allowed to do what.', agentic, ctx.onAgentView) : null,
      card('pipeline', 'Inside the pipeline', "How one log line becomes evidence, and where each team's data is stored.", sameData ? [0] : [0, 1], ctx.onPipeline));
  }

  // The story's comparisons, told as chapters: each one a question the race
  // below answers. A custom comparison from the analyst view gets its own card.
  function angles() {
    const items = comparisons.map(c => ({ id: c.id, chapter: c.chapter ?? c.label, teaser: c.teaser ?? '' }));
    if (!ctx.comparisonId) items.push({ id: null, chapter: 'Your own comparison', teaser: 'Set up in Analyst view.' });
    const card = (it, i) => {
      const on = it.id === (ctx.comparisonId ?? null);
      return h('button', {
        type: 'button', class: 'angle', 'aria-pressed': String(on),
        onclick: on || !it.id ? null : () => ctx.onCompare(it.id),
      },
        h('span', { class: 'angle-n', 'aria-hidden': 'true' }, String(i + 1)),
        h('span', { class: 'angle-text' },
          h('b', {}, it.chapter),
          it.teaser ? h('span', { class: 'angle-teaser' }, it.teaser) : null));
    };
    return h('section', { class: 'angles', 'aria-label': 'Ways to watch this story' },
      h('div', { class: 'angles-head' }, h('h2', {}, `${items.length} ways to watch this story`), h('span', {}, 'Pick one. The race below replays with it; the highlighted card is playing.')),
      h('div', { class: 'angles-row' }, items.map(card)));
  }

  root.replaceChildren(
    h('button', { class: 'back', type: 'button', onclick: ctx.onBack }, '← All stories'),
    h('section', { class: 'race-head' },
      h('span', { class: 'eyebrow' }, story?.title ?? scenario.title),
      h('h1', {}, story?.question ?? scenario.title),
      h('p', {}, story?.oneLiner ?? scenario.oneLiner),
      comparisons.length > 1 || !ctx.comparisonId ? angles() : null,
    ),
    h('section', { class: 'panel', 'aria-label': 'Both teams on one clock' },
      h('div', { class: 'race-scroll' },
        h('div', { class: 'race' },
          h('div'),
          h('div', { class: 'axis' },
            ticks.map(t => h('span', { class: 'tick', style: `left:${pct(t)}` }, hour12(t))),
            h('span', { class: `attack-start${f(A.metrics.firstMaliciousAt) < 0.1 ? ' start' : ''}`, style: `left:${pct(A.metrics.firstMaliciousAt)}` }, '⚑ Attack begins')),
          lane(names[0], A, 'a'),
          lane(names[1], B, 'b'),
          h('div', { class: 'now-wrap' }, now),
        )),
      h('div', { class: 'legend', 'aria-label': 'Legend' },
        [['calm', 'Normal day'], ['undetected', 'Attacker unnoticed'], ['active', 'Spotted, attacker still active'], ['stopped', 'Attacker stopped']]
          .map(([c, l]) => h('span', {}, h('i', { style: `background:var(--${c})` }), l))),
      h('div', { class: 'player' },
        playBtn, clockEl,
        h('div', { class: 'speeds', role: 'group', 'aria-label': 'Speed' }, speedBtns),
        h('label', { class: 'pausebox' }, h('input', { type: 'checkbox', checked: ctx.pauseAt, onchange: e => ctx.onPause(e.target.checked) }), 'Pause at each moment'),
      ),
      h('div', { class: 'caption' }, prev, h('div', { class: 'text' }, count, lines, capLinks), next),
    ),
    exploreCards(),
    h('div', { class: 'score-title' }, h('h2', {}, 'Scoreboard'), h('span', {}, 'Updates as the story plays')),
    scores,
    verdict,
    h('div', { class: 'x-foot' },
      h('details', { class: 'glossary' }, h('summary', {}, 'What do these terms mean?'),
        h('dl', {}, GLOSSARY.map(([t, d]) => [h('dt', {}, t), h('dd', {}, d)]))),
      h('span', {}, 'Illustrative numbers from the simulation engine. All companies, people and figures are fictional. Switch on Analyst view to see every step and change the assumptions.')),
  );

  const laneEls = root.querySelectorAll('.lane');
  let lastBeat = -2;
  let verdictShown = false;
  const highlight = text => {
    const frag = document.createDocumentFragment();
    const refs = [[names[0].ref, 'a'], [names[1].ref, 'b']];
    // Color team references so the reader can follow who is who.
    const re = new RegExp(`(${refs.map(([r]) => r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    for (const part of text.split(re)) {
      const hit = refs.find(([r]) => r.toLowerCase() === part.toLowerCase());
      frag.append(hit ? h('strong', { style: `color:var(--${hit[1]})` }, part) : part);
    }
    return frag;
  };

  return {
    update(clock, playing) {
      // Lanes
      laneEls.forEach(laneEl => {
        const R = laneEl.dataset.side === 'a' ? A : B;
        const m = R.metrics;
        const bounds = [start, m.firstMaliciousAt, m.firstAlertAt ?? end, m.containedAt ?? end, end];
        if (m.firstAlertAt == null) { bounds[2] = end; bounds[3] = end; }
        laneEl.querySelectorAll('.span').forEach((s, i) => {
          const a = Math.min(clock, bounds[i]), b = Math.min(clock, bounds[i + 1]);
          s.style.left = `${100 * f(a)}%`;
          s.style.width = `${Math.max(0, 100 * (f(b) - f(a)))}%`;
        });
        laneEl.querySelectorAll('.marker').forEach(mk => { mk.hidden = Number(mk.dataset.t) > clock; });
      });
      now.style.left = `${100 * f(clock)}%`;

      // Player
      const done = clock >= end;
      playBtn.replaceChildren(icon(playing ? 'pause' : done ? 'replay' : 'play'));
      playBtn.setAttribute('aria-label', playing ? 'Pause' : done ? 'Replay' : clock > start ? 'Continue' : 'Play');
      clockEl.firstChild.textContent = short12(Math.floor(clock));
      const d = new Date(`${scenario.date}T12:00:00`);
      d.setDate(d.getDate() + Math.floor(clock / 1440));
      clockEl.querySelector('small').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

      // Caption
      let idx = -1;
      beats.forEach((b, i) => { if (b.t <= clock) idx = i; });
      if (idx !== lastBeat) {
        lastBeat = idx;
        count.textContent = idx < 0 ? 'Press play to start' : `Moment ${idx + 1} of ${beats.length} · ${clock12(beats[idx].t)}`;
        lines.replaceChildren(...(idx < 0
          ? [h('p', { class: 'line fade' }, 'Two teams, one attack. Press play, and this space explains each moment as it happens.')]
          : beats[idx].lines.map(l => h('p', { class: 'line fade' }, highlight(l)))));
        capLinks.replaceChildren(...(idx < 0 ? [] : beats[idx].links.map(l => h('button', { type: 'button', class: 'cap-link', onclick: () => openView(l) }, `${l.label} →`))));
      }
      prev.disabled = idx <= 0;
      next.disabled = idx >= beats.length - 1;

      renderScores(scores, A, B, names, clock, end, L);
      if (done && !verdictShown) { renderVerdict(verdict, A, B, names, L, ctx.onAgentView); verdict.hidden = false; verdictShown = true; }
      if (!done && verdictShown) { verdict.hidden = true; verdictShown = false; }
    },
  };
}

function renderScores(root, A, B, names, clock, end, L) {
  const done = clock >= end;
  const card = (title, getter, better, foot) => {
    const vals = [A, B].map(R => getter(R.metrics, R));
    const best = done ? better(vals) : -1;
    return h('article', { class: 'score' },
      h('h3', {}, title),
      vals.map((v, i) => h('div', { class: `row ${best === i ? 'best' : ''}` },
        h('span', { class: 'dot', style: `background:var(--${i ? 'b' : 'a'})` }),
        h('span', { class: 'nm' }, names[i].title),
        h('span', { class: `v ${v.cls ?? ''}` }, v.text))),
      foot ? h('div', { class: 'foot' }, foot(vals)) : null);
  };
  const timeTo = (t, m) => ((t != null && t <= clock)
    ? { text: fmtDuration(t - m.firstMaliciousAt), n: t - m.firstMaliciousAt }
    : { text: done ? 'Never' : 'Not yet', cls: 'pending', n: Infinity });
  const lower = vals => (vals[0].n === vals[1].n ? -1 : vals[0].n < vals[1].n ? 0 : 1);
  const diffFoot = verb => vals => {
    const [a, b] = vals.map(v => v.n);
    if (a === Infinity || b === Infinity) return 'Measured from the moment the attack began';
    if (a === b) return 'Same on both sides';
    return `${(a < b ? names[0] : names[1]).title} ${verb} ${fmtDuration(Math.abs(a - b))} sooner`;
  };
  root.replaceChildren(
    card('Time to spot the attack', m => timeTo(m.firstAlertAt, m), lower, diffFoot('spotted it')),
    card('Time to stop the attacker', m => timeTo(m.containedAt, m), lower, diffFoot('stopped it')),
    card('Did the attacker succeed?', m => {
      const hit = m.objectiveAt != null && m.objectiveAt <= clock;
      return hit ? { text: 'Yes', cls: 'yes', n: 1 } : done ? { text: 'No', cls: 'no', n: 0 } : { text: 'Not so far', cls: 'pending', n: 0 };
    }, lower, () => `Their goal: ${L.objectiveStatus}`),
    card('Analyst time so far', (m, R) => {
      const used = R.work.filter(w => w.t <= clock).reduce((s, w) => s + w.min, 0);
      return { text: fmtMins(used), n: used, cost: m.cost.total };
    }, () => -1, vals => `Data cost per month: ${usd(vals[0].cost)} vs ${usd(vals[1].cost)}`),
  );
}

function renderVerdict(root, A, B, names, L, onAgentView) {
  const a = A.metrics, b = B.metrics;
  const [nA, nB] = names.map(n => n.ref);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const list = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
  const out = [];
  if (a.firstAlertAt === b.firstAlertAt) {
    if (a.firstAlertAt != null) out.push(`Both teams spotted the attack at the same moment, ${fmtDuration(a.firstAlertAt - a.firstMaliciousAt)} after it began. Whatever separates them happened after that.`);
    else out.push('Neither team spotted the attack.');
  } else {
    const [e, l, en] = (a.firstAlertAt ?? Infinity) < (b.firstAlertAt ?? Infinity) ? [a, b, nA] : [b, a, nB];
    out.push(l.firstAlertAt == null ? `Only ${en} spotted the attack at all.` : `${cap(en)} spotted the attack ${fmtDuration(l.firstAlertAt - e.firstAlertAt)} earlier.`);
  }
  if (a.containedAt != null && b.containedAt != null && a.containedAt !== b.containedAt) {
    const [f, s, fn] = a.containedAt < b.containedAt ? [a, b, nA] : [b, a, nB];
    out.push(`${cap(fn)} stopped the attacker ${fmtDuration(s.containedAt - f.containedAt)} sooner.`);
  }
  if (a.objectiveReached !== b.objectiveReached) out.push(`Only against ${a.objectiveReached ? nA : nB} did the attacker succeed (${L.objectiveStatus}).`);
  else out.push(a.objectiveReached ? `Against both teams, the attacker succeeded (${L.objectiveStatus}).` : 'Neither team let the attacker reach their goal.');
  if (a.uncontained.length !== b.uncontained.length) {
    const [w, wn] = a.uncontained.length > b.uncontained.length ? [a, nA] : [b, nB];
    out.push(`${cap(wn)} never found ${list(w.uncontained)}, so the attacker still has a way back in.`);
  }
  out.push(`Analyst time: ${fmtMins(a.analystMin)} vs ${fmtMins(b.analystMin)}. Data cost: ${usd(a.cost.total)} vs ${usd(b.cost.total)} a month.`);

  const linkBox = h('input', { type: 'text', readonly: true, value: location.href, 'aria-label': 'Link to this comparison' });
  const copied = h('span', { class: 'copied', 'aria-live': 'polite' });
  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href); copied.textContent = 'Link copied'; }
    catch { linkBox.select(); copied.textContent = 'Press Ctrl+C (or ⌘C) to copy'; }
  };

  root.replaceChildren(
    h('h2', {}, 'The verdict'),
    h('ol', {}, out.map(s => h('li', {}, s))),
    h('div', { class: 'verdict-actions' }, h('button', { class: 'pill-btn', type: 'button', onclick: copy }, 'Copy link to this comparison'), linkBox, copied),
    [A, B].some(R => R.config.model === 'agentic') ? h('div', { class: 'verdict-actions' },
      h('button', { class: 'pill-btn', type: 'button', onclick: () => onAgentView(A.config.model === 'agentic' ? 0 : 1) }, 'How is the AI built? Look inside the agent →')) : null,
    h('div', { class: 'more' },
      h('details', {}, h('summary', {}, 'What AI agents can get wrong, and the guardrails'),
        h('ul', {}, RISKS.map(([r, g]) => h('li', {}, h('b', {}, `${r}. `), h('span', {}, g))))),
      h('details', {}, h('summary', {}, 'Questions to ask a vendor'),
        h('ol', {}, QUESTIONS.map(q => h('li', {}, q))))),
  );
}
