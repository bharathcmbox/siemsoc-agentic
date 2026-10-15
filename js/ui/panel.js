// One side of the split screen: configuration, live counters, and timeline.
import { h, usd } from './dom.js';
import { fmtTime, fmtDuration, ARCH_LABELS, MODEL_LABELS } from '../engine/simulate.js';

const LANE_WHO = {
  attacker: 'Attacker', user: 'Employee', detect: 'Detection', agent: 'AI agent', human: 'Analyst', outcome: 'Outcome',
};
const STORAGE_LABEL = { hot: 'hot tier', promoted: 'promoted to hot', cheap: 'cheap storage', lake: 'data lake' };

function segmented(options, onPick, label) {
  const buttons = {};
  const el = h('div', { class: 'seg', role: 'group', 'aria-label': label },
    Object.entries(options).map(([value, text]) => (buttons[value] = h('button', { type: 'button', onclick: () => onPick(value) }, text))));
  return {
    el,
    set(value) { for (const [v, b] of Object.entries(buttons)) b.setAttribute('aria-pressed', String(v === value)); },
  };
}

export function createPanel(root, name, { onConfig, onInfo }) {
  let config;
  let result;
  let items = [];
  let lastShown = -1;

  const arch = segmented(ARCH_LABELS, v => onConfig({ ...config, arch: v }), `Side ${name} data architecture`);
  const model = segmented(MODEL_LABELS, v => onConfig({ ...config, model: v }), `Side ${name} operating model`);
  const routingInput = h('input', { type: 'checkbox', role: 'switch', 'aria-label': 'Detection-aware routing', onchange: e => onConfig({ ...config, routing: e.target.checked }) });
  const routingNote = h('small');
  const routingBox = h('div', { class: 'routing' },
    h('label', { class: 'switch' }, routingInput, h('span')),
    h('div', { class: 'txt' },
      h('strong', {}, 'Detection-aware routing'),
      'Promote suspicious events from cheap storage to real-time detection. ', routingNote),
    h('button', { type: 'button', class: 'info-btn', 'aria-label': 'What is detection-aware routing?', title: 'What is this?', onclick: () => onInfo() }, 'i'),
  );

  const title = h('h3');
  const tag = h('span', { class: 'tag' });
  const status = h('div', { class: 'status idle', role: 'status' });
  const callouts = h('div', { class: 'cfg' });
  const counters = h('div', { class: 'counters' });
  const list = h('ol', { class: 'timeline', 'aria-label': `Side ${name} timeline` });

  root.append(
    h('div', { class: 'side-head' }, title, tag),
    h('div', { class: 'cfg' },
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Data architecture'), arch.el),
      h('div', { class: 'row' }, h('span', { class: 'lbl' }, 'Operating model'), model.el),
      routingBox,
    ),
    counters,
    status,
    callouts,
    list,
  );

  function counter(k, v, s, tone) {
    return h('div', { class: `counter ${tone ?? ''}` }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), s ? h('div', { class: 's' }, s) : null);
  }

  function renderTimeline() {
    list.replaceChildren();
    items = result.timeline.map(e => {
      const lane = e.lane;
      const classes = [`lane-${lane}`];
      if (e.prevented) classes.push('prevented');
      if (e.missed) classes.push('missed');
      if (lane === 'outcome') { classes.push('outcome-row'); if (e.bad) classes.push('bad'); }
      const badges = [...(e.badges ?? [])];
      const badgeEls = badges.map(b => h('span', {
        class: `badge ${b === 'Promoted by routing' ? 'promoted' : b === 'High' ? 'high' : b === 'Medium' ? 'medium' : ''}`,
      }, b));
      if (e.sourceName && !e.prevented) {
        badgeEls.push(h('span', { class: 'badge store' }, `${e.sourceName} → ${STORAGE_LABEL[e.storage] ?? e.storage}`));
      }
      const li = h('li', { class: classes.join(' '), hidden: true },
        h('div', { class: 't' }, fmtTime(e.t)),
        h('div', { class: 'body' },
          h('div', { class: 'who' }, e.who ?? LANE_WHO[lane]),
          h('div', { class: 'title' }, e.title),
          h('div', { class: 'text' }, e.text),
          badgeEls.length ? h('div', { class: 'badges' }, badgeEls) : null,
          e.raw && !e.prevented ? h('details', { class: 'raw' }, h('summary', {}, 'Show raw log'), h('pre', {}, JSON.stringify(e.raw, null, 2))) : null,
        ),
      );
      list.append(li);
      return { e, li };
    });
    lastShown = -1;
  }

  return {
    setConfig(cfg) {
      config = cfg;
      arch.set(cfg.arch);
      model.set(cfg.model);
      const disabled = cfg.arch === 'index';
      routingInput.checked = cfg.routing && !disabled;
      routingInput.disabled = disabled;
      routingBox.classList.toggle('disabled', disabled);
      routingNote.textContent = disabled ? 'Not needed here: with index-at-ingest, everything is already in the hot tier.' : '';
      title.textContent = `Side ${name}`;
      tag.textContent = `${ARCH_LABELS[cfg.arch]} · ${MODEL_LABELS[cfg.model]}${cfg.routing && !disabled ? ' · routing on' : ''}`;
    },

    setResult(res, extra) {
      result = res;
      this.extra = extra;
      renderTimeline();
    },

    update(clock) {
      if (!result) return;
      const m = result.metrics;

      // Timeline reveal.
      let shown = -1;
      items.forEach(({ e, li }, i) => {
        const visible = e.t <= clock;
        if (visible) shown = i;
        if (li.hidden === visible) {
          li.hidden = !visible;
          if (visible && lastShown >= 0) li.classList.add('fresh');
        }
      });
      if (shown > lastShown && lastShown !== -1) list.scrollTop = list.scrollHeight;
      if (lastShown === -1 && shown >= 0) list.scrollTop = list.scrollHeight;
      lastShown = shown;

      // Counters.
      const alertSeen = m.firstAlertAt != null && m.firstAlertAt <= clock;
      const containedSeen = m.containedAt != null && m.containedAt <= clock;
      const humanMin = result.work.filter(w => w.t <= clock).reduce((s, w) => s + w.min, 0);
      const accessMin = m.accessStartAt != null && m.accessStartAt <= clock
        ? Math.min(clock, m.containedAt ?? Infinity) - m.accessStartAt : 0;
      const victims = m.compromisedDetail.filter(c => c.at <= clock).length;
      const goalSeen = m.objectiveAt != null && m.objectiveAt <= clock;
      const spend = result.spend.filter(s => s.t <= clock).reduce((a, s) => a + s.usd, 0);

      counters.replaceChildren(
        counter('First alert', alertSeen ? fmtTime(m.firstAlertAt) : '—', alertSeen ? `${fmtDuration(m.mttd)} after the phishing email` : 'nothing yet'),
        counter('Contained', containedSeen ? fmtTime(m.containedAt) : '—', containedSeen ? `${fmtDuration(m.mttr)} after first alert` : alertSeen ? 'not yet' : '', containedSeen ? (goalSeen ? 'bad' : 'good') : null),
        counter('Analyst hands-on', `${Math.round(humanMin)} min`, 'human time spent'),
        counter('Attacker in mailbox', fmtDuration(accessMin), m.accessStartAt == null ? 'never got in' : '', accessMin > 0 ? 'bad' : null),
        counter('Compromised users', String(victims), goalSeen ? 'fraud request sent' : '', victims > 1 || goalSeen ? 'bad' : null),
        counter('Data cost / month', usd(m.cost.total), spend ? `+ ${usd(spend)} cold-data queries` : `coverage ${m.coverage.covered}/${m.coverage.total} rules`),
      );

      // Status line.
      let tone = 'idle';
      let text = 'A normal morning.';
      if (clock >= m.firstMaliciousAt) { tone = 'active'; text = 'Attack under way. Not detected yet.'; }
      if (alertSeen) { tone = 'active'; text = 'Alert raised. Not contained yet.'; }
      if (goalSeen && !containedSeen) { tone = 'bad'; text = 'The attacker reached their goal: fraudulent payment request sent.'; }
      if (containedSeen) {
        tone = goalSeen ? 'bad' : 'good';
        text = goalSeen ? `Contained at ${fmtTime(m.containedAt)}, after the fraudulent request went out.` : `Contained at ${fmtTime(m.containedAt)}, before the attacker reached their goal.`;
      }
      if (clock >= result.end && m.firstAlertAt == null) { tone = 'bad'; text = 'Nothing was ever detected.'; }
      status.className = `status ${tone}`;
      status.textContent = text;

      // Teaching callouts, revealed only once the moment has happened.
      const x = this.extra ?? {};
      const blocks = [];
      if (x.blind && clock >= x.blind.t) {
        blocks.push(h('div', { class: 'callout blind' },
          h('p', {}, h('strong', {}, 'Blind spot. '), x.blind.text),
          x.blind.hint ? h('p', {}, x.blind.hint) : null));
      }
      if (x.promo && clock >= x.promo.t) {
        blocks.push(h('div', { class: 'callout promo' }, x.promo.lines.map(l => h('p', {}, l))));
      }
      callouts.replaceChildren(...blocks);
    },
  };
}
