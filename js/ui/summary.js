// Executive summary: final metrics side by side, plus plain-language takeaways.
import { h, usd } from './dom.js';
import { fmtTime, fmtDuration, ARCH_LABELS, MODEL_LABELS } from '../engine/simulate.js';
import { SOURCES } from '../engine/assumptions.js';

const t = v => (v == null ? null : v);

// Each row: label, how to show a side's value, and a numeric key where lower is better.
const ROWS = [
  { label: 'First alert', show: m => m.firstAlertAt != null ? `${fmtTime(m.firstAlertAt)} (${fmtDuration(m.mttd)} after the attack began)` : 'Never', key: m => t(m.firstAlertAt) ?? Infinity },
  { label: 'Contained', show: m => m.containedAt != null ? `${fmtTime(m.containedAt)} (${fmtDuration(m.mttr)} after first alert)` : 'Never', key: m => t(m.containedAt) ?? Infinity },
  { label: 'Root cause found', show: m => m.rootCauseAt != null ? fmtTime(m.rootCauseAt) : 'Never', key: m => t(m.rootCauseAt) ?? Infinity },
  { label: L => L.objectiveShort, show: m => m.objectiveReached ? 'Yes' : 'No', key: m => (m.objectiveReached ? 1 : 0) },
  { label: L => L.compromisedLabel, show: m => `${m.compromised.length} (${m.compromised.join(', ')})${m.uncontained.length ? `. Still active: ${m.uncontained.join(', ')}` : ''}`, key: m => m.compromised.length * 10 + m.uncontained.length },
  { label: L => `${L.accessLabel} (time)`, show: m => fmtDuration(m.attackerAccessMin), key: m => m.attackerAccessMin },
  { label: 'Analyst hands-on time', show: m => `${Math.round(m.analystMin)} min`, key: m => m.analystMin },
  { label: 'Real-time detection coverage', show: m => `${m.coverage.covered} of ${m.coverage.total} rules`, key: m => -(m.coverage.covered / Math.max(1, m.coverage.total)) },
  { label: 'Monthly data cost', show: m => usd(m.cost.total), key: m => Math.round(m.cost.total) },
  { label: 'Cold-data query spend (this incident)', show: m => usd(m.queryCost), key: m => m.queryCost },
];

function describe(cfg) {
  return `${ARCH_LABELS[cfg.arch]} · ${MODEL_LABELS[cfg.model]}${cfg.routing ? ' · routing on' : ''}`;
}

function takeaways(A, B, extraA, extraB) {
  const a = A.metrics, b = B.metrics, ca = A.config, cb = B.config;
  const out = [];
  const name = (x) => (x === A ? 'Side A' : 'Side B');

  // Detection
  if (a.firstAlertAt === b.firstAlertAt) {
    if (a.firstAlertAt != null) {
      const sameData = ca.arch === cb.arch && ca.routing === cb.routing;
      out.push(`Both sides raised their first alert at ${fmtTime(a.firstAlertAt)}.${sameData && ca.model !== cb.model
        ? ' Same data and same detection rules mean the same detection time. Everything the agentic side gained was on the response side.' : ''}`);
    }
  } else {
    const [early, late] = (a.firstAlertAt ?? Infinity) < (b.firstAlertAt ?? Infinity) ? [A, B] : [B, A];
    const lateX = late === A ? extraA : extraB;
    const diff = late.metrics.firstAlertAt != null ? fmtDuration(late.metrics.firstAlertAt - early.metrics.firstAlertAt) + ' earlier' : 'and the other side never did';
    let why = '';
    if (lateX?.blind) why = lateX.blind.dropped
      ? ` The other side doesn't collect ${lateX.blind.sources} logs at all, to stay within its SIEM budget.`
      : ` The other side's "${lateX.blind.ruleName}" rule couldn't see the ${lateX.blind.sources} logs in real time.`;
    out.push(`${name(early)} raised its first alert ${diff}.${why}`);
    if (early.config.routing && !late.config.routing && early.config.arch !== 'index') {
      out.push('Detection-aware routing, not the operating model, is what moved the first alert earlier.');
    } else if (early.config.model === late.config.model && early.config.arch === 'index') {
      out.push('Indexing everything bought the earlier alert, at a much higher data cost.');
    }
  }

  // Response
  if (a.containedAt != null && b.containedAt != null && a.containedAt !== b.containedAt) {
    const [fast, slow] = a.containedAt < b.containedAt ? [A, B] : [B, A];
    out.push(`${name(fast)} contained the attack ${fmtDuration(slow.metrics.containedAt - fast.metrics.containedAt)} sooner.`);
  } else if ((a.containedAt == null) !== (b.containedAt == null)) {
    out.push(`${name(a.containedAt == null ? A : B)} never contained the attack in the simulated window.`);
  }

  if (a.objectiveReached !== b.objectiveReached) {
    out.push(`On ${name(a.objectiveReached ? A : B)}, the attacker reached their goal (${A.labels.objectiveStatus}) before containment. On ${name(a.objectiveReached ? B : A)}, they didn't.`);
  }
  if (a.compromised.length !== b.compromised.length) {
    const [more] = a.compromised.length > b.compromised.length ? [A] : [B];
    out.push(`${name(more)} ended up with more ${A.labels.compromisedLabel.toLowerCase()}: ${A.labels.secondVictim}.`);
  }
  if (a.uncontained.length !== b.uncontained.length) {
    const [worse] = a.uncontained.length > b.uncontained.length ? [A] : [B];
    out.push(`${name(worse)} never found ${worse.metrics.uncontained.join(', ')}, so the attacker still has a foothold.`);
  }

  // Effort and cost
  if (Math.round(a.analystMin) !== Math.round(b.analystMin)) {
    const [lo, hi] = a.analystMin < b.analystMin ? [A, B] : [B, A];
    const ratio = hi.metrics.analystMin / Math.max(1, lo.metrics.analystMin);
    out.push(`Human hands-on time: ${Math.round(lo.metrics.analystMin)} min on ${name(lo)} vs ${Math.round(hi.metrics.analystMin)} min on ${name(hi)}${ratio >= 2 ? ` (about ${Math.round(ratio)}× less)` : ''}.`);
  }
  const ct = [a.cost.total, b.cost.total];
  if (Math.abs(ct[0] - ct[1]) / Math.max(ct[0], ct[1]) > 0.05) {
    const [cheap, dear] = ct[0] < ct[1] ? [A, B] : [B, A];
    const pct = Math.round(100 * (1 - cheap.metrics.cost.total / dear.metrics.cost.total));
    const cut = cheap.plan.dropped.map(id => SOURCES.find(x => x.id === id)?.name).join(' and ');
    out.push(`${name(cheap)} spends about ${usd(dear.metrics.cost.total - cheap.metrics.cost.total)} a month less on data (${pct}% less)${cut ? `, but only because it stopped collecting ${cut} logs to fit its budget` : ''}.`);
  }
  return out;
}

export function renderSummary(root, A, B, revealed, onReveal, extras) {
  root.replaceChildren(h('h2', {}, 'Executive summary'));
  if (!revealed) {
    root.append(
      h('p', { class: 'veil' }, 'Results appear when the simulation finishes.'),
      h('button', { class: 'btn', onclick: onReveal }, 'Show results now'),
    );
    return;
  }
  const better = (row) => {
    const ka = row.key(A.metrics), kb = row.key(B.metrics);
    if (ka === kb) return ['', ''];
    return ka < kb ? ['better', 'worse'] : ['worse', 'better'];
  };
  root.append(
    h('div', { class: 'table-scroll' },
      h('table', { class: 'results-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Side A: ', describe(A.config)), h('th', {}, 'Side B: ', describe(B.config)))),
        h('tbody', {}, ROWS.map(r => {
          const [ca, cb] = better(r);
          return h('tr', {}, h('th', { scope: 'row' }, typeof r.label === 'function' ? r.label(A.labels) : r.label), h('td', { class: `num ${ca}` }, r.show(A.metrics)), h('td', { class: `num ${cb}` }, r.show(B.metrics)));
        })),
      ),
    ),
    h('ul', { class: 'takeaways' }, takeaways(A, B, extras?.[0], extras?.[1]).map(s => h('li', {}, s))),
    h('p', { class: 'note' }, 'All figures come from illustrative assumptions, not measurements of any product. Change them under "Assumptions" below.'),
  );
}
