// Narrator: turns the two simulation results into a short list of "beats",
// moments where something happens on either side, each with one or two plain
// sentences comparing the sides. Text only uses what has happened up to that
// moment, so it never gives away the ending.
import { h } from './dom.js';
import { fmtTime, fmtDuration } from '../engine/simulate.js';

const NAMES = ['Side A', 'Side B'];

// What a side is doing at time t, as a phrase that follows "Side X: ".
function statusAt(R, t) {
  const m = R.metrics;
  if (m.containedAt != null && m.containedAt <= t) return `already contained (since ${fmtTime(m.containedAt)})`;
  if (m.firstAlertAt == null || m.firstAlertAt > t) {
    const blind = R.timeline.some(e => e.blindSpot && e.t <= t);
    return blind ? 'still no alert, because its detection rule can\'t see the logs it needs' : 'no alert yet';
  }
  const agentic = R.config.model === 'agentic';
  const last = [...R.timeline].reverse().find(e => e.phase && e.t <= t);
  switch (last?.phase) {
    case undefined: return `the alert has been waiting in the queue since ${fmtTime(m.firstAlertAt)}`;
    case 'triage': return agentic ? 'the agent is investigating' : 'a Tier-1 analyst is triaging the alert';
    case 'escalated': return 'escalated, waiting for a Tier-2 analyst to pick it up';
    case 'investigating': return 'a Tier-2 analyst is investigating by hand, one tool at a time';
    case 'waiting-user': return 'the analyst is waiting for the employee to confirm';
    case 'containing': return 'the containment playbook is running';
    case 'awaiting-approval': return 'the agent is waiting for a human to approve its proposed actions';
    case 'approved': return 'approved actions are being carried out';
    default: return 'working the case';
  }
}

function work(R, t) {
  return Math.round(R.work.filter(w => w.t <= t).reduce((s, w) => s + w.min, 0));
}

export function buildBeats(A, B) {
  const R = [A, B];
  const raw = []; // { t, text, key }
  const add = (t, text, key) => raw.push({ t, text, key });
  const other = i => R[1 - i];
  const sameData = A.config.arch === B.config.arch && A.config.routing === B.config.routing;

  // 1. Attack starts.
  const t0 = A.metrics.firstMaliciousAt;
  const first = A.timeline.find(e => e.t === t0 && e.lane === 'attacker');
  if (first) add(t0, `The attack begins. ${first.title}. Neither side has any reason to notice yet.`, 'start');

  // 2. Rules that can't fire.
  const supp = A.timeline.find(e => e.missed && !e.blindSpot);
  if (supp && B.timeline.some(e => e.missed && !e.blindSpot && e.rule === supp.rule)) {
    add(supp.t, `On both sides, the "${supp.ruleName}" rule stays silent. ${supp.text}`, 'supp');
  }
  R.forEach((r, i) => {
    const b = r.timeline.find(e => e.blindSpot);
    if (!b) return;
    const o = other(i);
    const otherFires = o.metrics.firstAlertAt != null && o.metrics.firstAlertAt <= b.t + 1;
    const oBlind = o.timeline.find(e => e.blindSpot && e.rule === b.rule);
    if (oBlind && oBlind.dropped === b.dropped && i === 1) return; // same blind spot: already said once
    const why = x => x.dropped
      ? `the ${x.sources} logs it needs aren't collected at all, to stay within the SIEM budget`
      : `the ${x.sources} logs it needs went to cold storage, where real-time rules don't run`;
    add(b.t, oBlind && oBlind.dropped === b.dropped
      ? `On both sides, the "${b.ruleName}" rule can't fire: ${why(b)}.${b.dropped ? '' : ' The best early clue is being collected, but nobody is watching it.'}`
      : `${NAMES[i]}'s "${b.ruleName}" rule can't fire: ${why(b)}.${otherFires ? ` ${NAMES[1 - i]} gets those logs into real-time detection, and that's why its rule fires.` : ''}`, `blind${i}`);
  });

  // 3. First alerts.
  const alertEntry = r => r.timeline.find(e => e.lane === 'detect' && !e.missed && !e.sweep);
  const fa = R.map(r => r.metrics.firstAlertAt);
  if (fa[0] != null && fa[0] === fa[1]) {
    add(fa[0], `Both sides raise the same alert at the same moment (${alertEntry(A).title.replace('Alert: ', '')}).${sameData ? ' Same data, same rules, same timing.' : ''} Watch what each side does next: that's where they differ.`, 'alert');
  } else {
    R.forEach((r, i) => {
      if (fa[i] == null) return;
      const e = alertEntry(r);
      const hunt = (e.badges ?? []).includes('Scheduled sweep');
      const promo = (e.badges ?? []).includes('Promoted by routing');
      const why = hunt ? ' It was found by the nightly scheduled sweep of stored data, not in real time.'
        : promo ? ' It fired because detection-aware routing copied the suspicious event into the hot tier.' : '';
      add(fa[i], `${NAMES[i]} raises its first alert: ${e.title.replace('Alert: ', '')}.${why} ${NAMES[1 - i]}: ${statusAt(other(i), fa[i])}.`, `alert${i}`);
    });
  }

  // 4. Work starts: queue pickup vs immediate triage.
  R.forEach((r, i) => {
    const e = r.timeline.find(x => x.phase === 'triage');
    if (!e || r.metrics.firstAlertAt == null) return;
    const wait = e.t - r.metrics.firstAlertAt;
    const o = other(i);
    const text = r.config.model === 'agentic'
      ? `${NAMES[i]}'s AI agent triaged the alert ${fmtDuration(wait)} after it fired. There's no queue, and it starts pulling evidence from every tool in parallel.`
      : `${NAMES[i]}: a Tier-1 analyst finally opens the alert after ${fmtDuration(wait)} in the queue.`;
    add(e.t, `${text} ${NAMES[1 - i]}: ${statusAt(o, e.t)}.`, `work${i}`);
  });

  // 5. Decision to contain.
  R.forEach((r, i) => {
    const e = r.timeline.find(x => x.phase === 'awaiting-approval' || x.phase === 'containing');
    if (!e) return;
    const text = e.phase === 'awaiting-approval'
      ? `${NAMES[i]}'s agent has assembled the evidence and asks a human to approve containment. High-impact actions always wait for a person.`
      : `${NAMES[i]}'s analyst has enough to act and launches the containment playbook.`;
    add(e.t, `${text} ${NAMES[1 - i]}: ${statusAt(other(i), e.t)}.`, `decide${i}`);
  });

  // 6. Containment.
  R.forEach((r, i) => {
    const t = r.metrics.containedAt;
    if (t == null) return;
    const o = other(i);
    const oc = o.metrics.containedAt != null && o.metrics.containedAt <= t;
    const left = r.metrics.compromisedDetail.filter(c => c.at <= t && (c.revokedAt == null || c.revokedAt > t)).map(c => c.name);
    const handledLater = left.length && left.every(n => r.timeline.some(e => e.lane === 'outcome' && e.t > t && e.title.startsWith('Contained:') && e.title.includes(n)));
    const caveat = !left.length ? '' : handledLater
      ? ` ${left.join(' and ')} ${left.length > 1 ? 'are' : 'is'} also compromised and will be contained next.`
      : ` But ${left.join(' and ')} ${left.length > 1 ? 'are' : 'is'} still compromised, and nothing on ${NAMES[i]} has noticed yet.`;
    add(t, `${NAMES[i]} is contained: the attacker loses access${left.length ? ' to everything that was found' : ''}.${caveat}${oc ? '' : ` On ${NAMES[1 - i]}, the attacker still has access (${statusAt(o, t)}).`}`, `contain${i}`);
  });

  // 7. Attacker steps that happen on one side but were prevented on the other.
  const ids = [...new Set(A.timeline.filter(e => e.eventId).map(e => e.eventId))];
  let ordinary = 0;
  for (const id of ids) {
    const ea = A.timeline.find(e => e.eventId === id);
    const eb = B.timeline.find(e => e.eventId === id);
    if (!ea || !eb || !!ea.prevented === !!eb.prevented) continue;
    const [hap, prev, hi] = ea.prevented ? [eb, ea, 1] : [ea, eb, 0];
    const big = R[hi].metrics.objectiveAt === hap.t || R[hi].metrics.compromisedDetail.some(c => c.at === hap.t && c.name !== R[hi].metrics.compromisedDetail[0]?.name);
    if (!big && ordinary >= 2) continue;
    if (!big) ordinary++;
    const reason = prev.text.replace(/^(Prevented|Didn't happen|Blocked): /, '');
    add(hap.t, `On ${NAMES[hi]}: ${hap.title}. On ${NAMES[1 - hi]}, it didn't happen: ${reason}`, `diff-${id}`);
  }

  // 8. Root cause.
  const rc = R.map(r => r.metrics.rootCauseAt);
  R.forEach((r, i) => {
    if (rc[i] == null || rc[i] === rc[1 - i] || rc[i] === r.metrics.firstAlertAt) return;
    const o = rc[1 - i];
    add(rc[i], `${NAMES[i]} now knows how the attack started (the ${r.labels.indicatorKind}).${o != null && o < rc[i] ? ` ${NAMES[1 - i]} found that ${fmtDuration(rc[i] - o)} earlier.` : ''}`, `root${i}`);
  });

  // 9. Case closed.
  R.forEach((r, i) => {
    const t = r.metrics.caseClosedAt;
    if (t == null) return;
    add(t, `${NAMES[i]} closes the case. Human hands-on time: ${work(r, t)} min on ${NAMES[i]}, ${work(other(i), t)} min so far on ${NAMES[1 - i]}.`, `close${i}`);
  });

  // 10. End.
  const end = Math.max(A.end, B.end);
  add(end, 'End of the simulated window. The executive summary below compares the outcomes.', 'end');

  // Merge beats in the same minute, keeping order of insertion.
  raw.sort((a, b) => a.t - b.t);
  const beats = [];
  for (const r of raw) {
    const last = beats[beats.length - 1];
    if (last && last.t === r.t) last.lines.push(r.text);
    else beats.push({ t: r.t, lines: [r.text] });
  }
  return beats;
}

export function createNarrator(root, { onTogglePause, onJump }) {
  let beats = [];
  let current = -2;
  const time = h('span', { class: 'nar-time' });
  const text = h('div', { class: 'nar-text' });
  const pauseBox = h('input', { type: 'checkbox', checked: true, onchange: e => onTogglePause(e.target.checked) });
  const history = h('ol', { class: 'nar-history' });
  const histCount = h('span');

  root.append(
    h('div', { class: 'nar-head' },
      h('strong', {}, 'What\'s happening'), time,
      h('label', { class: 'nar-pause' }, pauseBox, 'Pause at key moments'),
    ),
    text,
    h('details', { class: 'nar-details' }, h('summary', {}, 'Earlier moments ', histCount), history),
  );

  return {
    setBeats(b) { beats = b; current = -2; },
    beatTimes() { return beats.map(b => b.t); },
    update(clock) {
      let idx = -1;
      beats.forEach((b, i) => { if (b.t <= clock) idx = i; });
      if (idx === current) return;
      current = idx;
      if (idx < 0) {
        time.textContent = '';
        text.replaceChildren(h('p', {}, 'Press play. This panel explains each key moment and how the two sides differ.'));
      } else {
        time.textContent = fmtTime(beats[idx].t);
        text.replaceChildren(...beats[idx].lines.map(l => h('p', {}, l)));
        text.classList.remove('flash'); void text.offsetWidth; text.classList.add('flash');
      }
      const past = beats.slice(0, Math.max(0, idx));
      histCount.textContent = `(${past.length})`;
      history.replaceChildren(...past.slice().reverse().map(b => h('li', {},
        h('button', { type: 'button', class: 'nar-jump', onclick: () => onJump(b.t), title: 'Jump to this moment' }, fmtTime(b.t)),
        ' ', b.lines.join(' '))));
    },
  };
}
