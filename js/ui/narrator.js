// Narrator: turns the two simulation results into a short list of "beats",
// moments where something happens on either side, each with one or two plain
// sentences comparing the two teams. Text only uses what has happened up to
// that moment, so it never gives away the ending. Written for a non-technical
// reader: no rule IDs, tiers, or product jargon.
import { h } from './dom.js';
import { fmtDuration } from '../engine/simulate.js';
import { SOURCES } from '../engine/assumptions.js';

// 12-hour clock for people: 570 -> "9:30 am"; next day gets "(next day)".
export function clock12(t) {
  const day = Math.floor(t / 1440);
  const m = ((t % 1440) + 1440) % 1440;
  let hh = Math.floor(m / 60);
  const ap = hh >= 12 ? 'pm' : 'am';
  hh = hh % 12 || 12;
  return `${hh}:${String(m % 60).padStart(2, '0')} ${ap}${day > 0 ? ' (next day)' : ''}`;
}

// Engine text uses 24-hour "09:36" or "+1d 02:43"; convert for readers.
const to12 = s => s.replace(/(\+(\d+)d )?\b(\d{2}):(\d{2})\b(?! ?[ap]m)/g, (_, d, n, hh, mm) => clock12(Number(n || 0) * 1440 + Number(hh) * 60 + Number(mm)));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const poss = n => `${n}'s`;
const plainSources = ids => ids.map(id => SOURCES.find(s => s.id === id)?.plain ?? id).join(' and ');

function statusAt(R, t) {
  const m = R.metrics;
  if (m.containedAt != null && m.containedAt <= t) return `the attacker has been stopped (since ${clock12(m.containedAt)})`;
  if (m.firstAlertAt == null || m.firstAlertAt > t) {
    const blind = R.timeline.some(e => e.blindSpot && e.t <= t);
    return blind ? "still no alert, because its check can't see the logs it needs" : 'no alert yet';
  }
  const agentic = R.config.model === 'agentic';
  const last = [...R.timeline].reverse().find(e => e.phase && e.t <= t);
  switch (last?.phase) {
    case undefined: return `the alert has been waiting for an analyst since ${clock12(m.firstAlertAt)}`;
    case 'triage': return agentic ? 'the AI agent is investigating' : 'an analyst is looking at the alert';
    case 'escalated': return 'handed to a senior analyst, waiting to be picked up';
    case 'investigating': return 'a senior analyst is investigating by hand, one system at a time';
    case 'waiting-user': return 'the analyst is waiting for someone to confirm what happened';
    case 'containing': return 'automated steps to stop the attacker are running';
    case 'awaiting-approval': return "waiting for a person to approve the AI agent's plan";
    case 'approved': return 'the approved actions are being carried out';
    default: return 'working the case';
  }
}

function work(R, t) {
  return Math.round(R.work.filter(w => w.t <= t).reduce((s, w) => s + w.min, 0));
}

// names: how to refer to each team mid-sentence, e.g. ["today's team", 'the AI-assisted team'].
export function buildBeats(A, B, names = ['Side A', 'Side B']) {
  const R = [A, B];
  const N = names;
  const raw = [];
  const add = (t, text) => raw.push({ t, text });
  const other = i => R[1 - i];
  const sameData = A.config.arch === B.config.arch && A.config.routing === B.config.routing;

  // 1. Attack starts.
  const t0 = A.metrics.firstMaliciousAt;
  const first = A.timeline.find(e => e.t === t0 && e.lane === 'attacker');
  if (first) add(t0, `The attack begins: ${first.title}. Neither team has any reason to notice yet.`);

  // 2. Checks that stay silent.
  const supp = A.timeline.find(e => e.missed && !e.blindSpot);
  if (supp && B.timeline.some(e => e.missed && !e.blindSpot && e.rule === supp.rule)) {
    add(supp.t, `${cap(supp.rulePlain)} stays quiet on both sides. ${supp.text}`);
  }
  const why = x => (x.dropped
    ? `the ${plainSources(x.sourceIds)} logs it needs aren't collected at all, to stay within budget`
    : `the ${plainSources(x.sourceIds)} logs it needs went to cheap storage, where real-time checks don't look`);
  R.forEach((r, i) => {
    const b = r.timeline.find(e => e.blindSpot);
    if (!b) return;
    const o = other(i);
    const oBlind = o.timeline.find(e => e.blindSpot && e.rule === b.rule);
    if (oBlind && oBlind.dropped === b.dropped) {
      if (i === 0) add(b.t, `On both sides, ${b.rulePlain} can't work: ${why(b)}.${b.dropped ? '' : ' The best early clue is being kept, but nobody is watching it.'}`);
      return;
    }
    const otherFires = o.metrics.firstAlertAt != null && o.metrics.firstAlertAt <= b.t + 1;
    add(b.t, `For ${N[i]}, ${b.rulePlain} can't work: ${why(b)}.${otherFires ? ` ${N[1 - i]} sends those logs to real-time detection, so its check works.` : ''}`);
  });

  // 3. First alerts.
  const alertEntry = r => r.timeline.find(e => e.lane === 'detect' && !e.missed && !e.sweep);
  const fa = R.map(r => r.metrics.firstAlertAt);
  const how = e => ((e.badges ?? []).includes('Scheduled sweep') ? ' It came from the nightly scheduled search of stored data, not in real time.'
    : (e.badges ?? []).includes('Promoted by routing') ? ' It worked because smart routing sent a copy of the suspicious event to real-time detection.' : '');
  if (fa[0] != null && fa[0] === fa[1]) {
    const e = alertEntry(A);
    add(fa[0], `Both teams get the same alert at the same moment, from ${e.rulePlain}.${how(e)}${sameData ? ' Same data, same checks, same timing.' : ''} What each team does next is where they differ.`);
  } else {
    R.forEach((r, i) => {
      if (fa[i] == null) return;
      const e = alertEntry(r);
      add(fa[i], `${N[i]} gets its first alert, from ${e.rulePlain}.${how(e)} ${N[1 - i]}: ${statusAt(other(i), fa[i])}.`);
    });
  }

  // 4. Work starts: waiting list vs immediate pickup.
  R.forEach((r, i) => {
    const e = r.timeline.find(x => x.phase === 'triage');
    if (!e || r.metrics.firstAlertAt == null) return;
    const wait = e.t - r.metrics.firstAlertAt;
    const text = r.config.model === 'agentic'
      ? `${poss(N[i])} AI agent picked up the alert ${fmtDuration(wait)} after it fired. There's no waiting list, and it gathers evidence from every system at once.`
      : `${N[i]}: an analyst opens the alert after ${fmtDuration(wait)} waiting in the queue.`;
    add(e.t, `${text} ${N[1 - i]}: ${statusAt(other(i), e.t)}.`);
  });

  // 5. Decision to stop the attacker.
  R.forEach((r, i) => {
    const e = r.timeline.find(x => x.phase === 'awaiting-approval' || x.phase === 'containing');
    if (!e) return;
    const text = e.phase === 'awaiting-approval'
      ? `${poss(N[i])} AI agent has gathered the evidence and asks a person to approve stopping the attacker. Big actions always wait for a human.`
      : `${poss(N[i])} analysts have enough evidence and start the automated steps to stop the attacker.`;
    add(e.t, `${text} ${N[1 - i]}: ${statusAt(other(i), e.t)}.`);
  });

  // 6. Attacker stopped.
  R.forEach((r, i) => {
    const t = r.metrics.containedAt;
    if (t == null) return;
    const o = other(i);
    const oc = o.metrics.containedAt != null && o.metrics.containedAt <= t;
    const left = r.metrics.compromisedDetail.filter(c => c.at <= t && (c.revokedAt == null || c.revokedAt > t)).map(c => c.name);
    const handledLater = left.length && left.every(n => r.timeline.some(e => e.lane === 'outcome' && e.t > t && e.title.startsWith('Contained:') && e.title.includes(n)));
    const caveat = !left.length ? '' : handledLater
      ? ` ${left.join(' and ')} ${left.length > 1 ? 'are' : 'is'} also compromised and will be dealt with next.`
      : ` But ${left.join(' and ')} ${left.length > 1 ? 'are' : 'is'} still compromised, and ${N[i]} hasn't noticed.`;
    add(t, `${N[i]} stops the attacker${left.length ? ' everywhere it has found so far' : ''}.${caveat}${oc ? '' : ` For ${N[1 - i]}, the attacker is still active (${statusAt(o, t)}).`}`);
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
    add(hap.t, `${N[hi]}: ${hap.title}. For ${N[1 - hi]}, this didn't happen: ${reason}`);
  }

  // 8. Root cause.
  const rc = R.map(r => r.metrics.rootCauseAt);
  R.forEach((r, i) => {
    if (rc[i] == null || rc[i] === rc[1 - i] || rc[i] === r.metrics.firstAlertAt) return;
    const o = rc[1 - i];
    add(rc[i], `${N[i]} now knows how the attack started (the ${r.labels.indicatorKind}).${o != null && o < rc[i] ? ` ${N[1 - i]} worked that out ${fmtDuration(rc[i] - o)} earlier.` : ''}`);
  });

  // 9. Case closed.
  R.forEach((r, i) => {
    const t = r.metrics.caseClosedAt;
    if (t == null) return;
    add(t, `${N[i]} closes the case. People-time spent: ${work(r, t)} min for ${N[i]}, ${work(other(i), t)} min so far for ${N[1 - i]}.`);
  });

  // 10. End.
  add(Math.max(A.end, B.end), "That's the end of the story. The scoreboard and verdict below compare how the two teams did.");

  raw.sort((a, b) => a.t - b.t);
  const beats = [];
  for (const r of raw) {
    // Team references are lower-case noun phrases ("the AI-assisted team"); capitalize sentence starts.
    const text = to12(r.text).replace(/^[a-z]/, c => c.toUpperCase()).replace(/([.!?] )([a-z])/g, (_, p, c) => p + c.toUpperCase());
    const last = beats[beats.length - 1];
    if (last && last.t === r.t) last.lines.push(text);
    else beats.push({ t: r.t, lines: [text] });
  }
  return beats;
}

// Analyst-view narrator strip (the exec view renders beats itself).
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
      h('strong', {}, "What's happening"), time,
      h('label', { class: 'nar-pause' }, pauseBox, 'Pause at key moments'),
    ),
    text,
    h('details', { class: 'nar-details' }, h('summary', {}, 'Earlier moments ', histCount), history),
  );

  return {
    setBeats(b) { beats = b; current = -2; },
    setPause(on) { pauseBox.checked = on; },
    update(clock) {
      let idx = -1;
      beats.forEach((b, i) => { if (b.t <= clock) idx = i; });
      if (idx === current) return;
      current = idx;
      if (idx < 0) {
        time.textContent = '';
        text.replaceChildren(h('p', {}, 'Press play. This panel explains each key moment and how the two sides differ.'));
      } else {
        time.textContent = clock12(beats[idx].t);
        text.replaceChildren(...beats[idx].lines.map(l => h('p', {}, l)));
        text.classList.remove('flash'); void text.offsetWidth; text.classList.add('flash');
      }
      const past = beats.slice(0, Math.max(0, idx));
      histCount.textContent = `(${past.length})`;
      history.replaceChildren(...past.slice().reverse().map(b => h('li', {},
        h('button', { type: 'button', class: 'nar-jump', onclick: () => onJump(b.t), title: 'Jump to this moment' }, clock12(b.t)),
        ' ', b.lines.join(' '))));
    },
  };
}
