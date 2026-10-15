// Deterministic SOC simulation.
//
// Replays a scenario's attacker events minute by minute against one SOC
// configuration ({ arch, model, routing }) and returns a timeline plus
// metrics. Attacker events can be prevented by earlier SOC actions, and SOC
// actions depend on which alerts fired, so everything runs through a single
// time-ordered queue.

import { FIXED, SOURCES } from './assumptions.js';
import { routeOf, isPromotable, monthlyCost } from './cost.js';

export const ARCH_LABELS = { index: 'Index-at-ingest', tiered: 'Tiered', lake: 'Federated / lake' };
export const MODEL_LABELS = { traditional: 'Traditional', agentic: 'Agentic' };

export function parseTime(s) {
  const m = /^(?:D(\d+)\s+)?(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`Bad time: ${s}`);
  return Number(m[1] || 0) * 1440 + Number(m[2]) * 60 + Number(m[3]);
}

export function fmtTime(t) {
  const day = Math.floor(t / 1440);
  const m = ((t % 1440) + 1440) % 1440;
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return (day > 0 ? `+${day}d ` : '') + `${hh}:${mm}`;
}

export function fmtDuration(min) {
  if (min == null) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

function sourceName(id) {
  return SOURCES.find(s => s.id === id)?.name ?? id;
}

export function simulate(scenario, variantId, config, params) {
  const { arch, model, routing } = config;
  const routingOn = routing && arch !== 'index';
  const variant = scenario.variants?.find(v => v.id === variantId) ?? scenario.variants?.[0] ?? {};
  const removed = new Set(variant.removeEvents ?? []);
  const L = { ...scenario.labels, ...variant.labels };

  const start = parseTime(scenario.start);
  const end = parseTime(variant.end ?? scenario.end);
  const events = scenario.events
    .filter(e => !removed.has(e.id))
    .map(e => ({ ...e, t: parseTime(e.time) }));
  const byId = Object.fromEntries(events.map(e => [e.id, e]));
  const rootEvent = byId[scenario.rootCauseEvent];

  // ---- data visibility -------------------------------------------------
  // 'hot' = real-time rules see it and searches are instant;
  // 'promoted' = a copy reached hot via detection-aware routing.
  function visibility(ev) {
    const route = routeOf(ev.source, arch);
    if (route === 'hot') return 'hot';
    if (routingOn && ev.promotable && isPromotable(ev.source)) return 'promoted';
    return route; // 'cheap' | 'lake'
  }
  const coldTier = arch === 'lake' ? 'lake' : 'cheap';
  const coldLatency = arch === 'lake' ? params.lakeQueryMin : params.cheapSearchMin;
  const coldCost = arch === 'lake' ? params.lakeQueryCost : params.cheapSearchCost;
  const coldName = arch === 'lake' ? 'the data lake' : 'cheap storage';

  const isBusiness = t => {
    const m = ((t % 1440) + 1440) % 1440;
    return m >= FIXED.businessStart && m < FIXED.businessEnd;
  };

  // ---- state -----------------------------------------------------------
  const timeline = [];
  const work = [];      // { t, min, who } human hands-on minutes, credited at t
  const spend = [];     // { t, usd, what }
  const S = {
    happened: {},       // eventId -> t
    containedAt: null,
    blockedAt: null,
    purgedAt: null,
    rootCauseAt: null,
    firstAlertAt: null,
    case: null,
    alerts: [],
    compromised: [],    // { name, at, revokedAt }
    clickers: [],       // { name, at }
    objectiveAt: null,
    accessStartAt: null,
    caseClosedAt: null,
  };

  const queue = [];
  let seq = 0;
  // prio: SOC actions (0) apply before attacker events (1) in the same minute.
  const at = (t, prio, fn) => queue.push({ t, prio, seq: seq++, fn });
  const log = (t, lane, title, text, extra = {}) => timeline.push({ t, lane, title, text, ...extra });
  const addWork = (t, min, who) => min > 0 && work.push({ t, min, who });

  // ---- attacker events -------------------------------------------------
  function checkRequires(ev, t) {
    for (const r of ev.requires ?? []) {
      if (r === 'attackerAccess' && S.containedAt != null && S.containedAt <= t) {
        return `Prevented: ${L.victim}'s sessions were revoked at ${fmtTime(S.containedAt)}.`;
      }
      if (r === 'lureReachable') {
        if (S.purgedAt != null && S.purgedAt <= t) return `Didn't happen: the phishing email was purged from all inboxes at ${fmtTime(S.purgedAt)}.`;
        if (S.blockedAt != null && S.blockedAt <= t) return `Blocked: ${L.domain} was blocked at ${fmtTime(S.blockedAt)}.`;
      }
    }
    return null;
  }

  for (const ev of events) {
    at(ev.t, 1, t => {
      const why = checkRequires(ev, t);
      if (why) {
        log(t, ev.actor === 'attacker' ? 'attacker' : 'user', ev.title, why, { prevented: true, eventId: ev.id });
        return;
      }
      S.happened[ev.id] = t;
      const vis = visibility(ev);
      log(t, ev.lane ?? (ev.actor === 'attacker' ? 'attacker' : 'user'), ev.title, ev.summary, {
        eventId: ev.id, raw: ev.raw, source: ev.source, sourceName: sourceName(ev.source), storage: vis, benign: ev.benign,
      });
      if (ev.compromises) S.compromised.push({ name: ev.compromises, at: t, revokedAt: null, primary: ev.compromises === L.victimFull });
      if (ev.clicker) S.clickers.push({ name: ev.clicker, at: t });
      if (ev.mailboxAccess && S.accessStartAt == null) S.accessStartAt = t;
      if (ev.objective) {
        S.objectiveAt = t;
        log(t, 'outcome', 'Attacker reaches their goal', L.objectiveImpact, { bad: true });
      }
      evaluateRules(t);
    });
  }

  // ---- detection -------------------------------------------------------
  const ruleState = {};
  function evaluateRules() {
    for (const rule of scenario.rules) {
      if (ruleState[rule.id]) continue;
      if (!rule.needs.every(id => S.happened[id] != null)) continue;
      const ready = Math.max(...rule.needs.map(id => S.happened[id]));
      if (rule.suppressed) {
        ruleState[rule.id] = 'suppressed';
        log(ready, 'detect', `${rule.id} doesn't fire`, rule.suppressed, { missed: true, rule: rule.id, ruleName: rule.name });
        continue;
      }
      const vis = rule.needs.map(id => visibility(byId[id]));
      const blind = rule.needs.filter((id, i) => vis[i] !== 'hot' && vis[i] !== 'promoted');
      if (blind.length) {
        ruleState[rule.id] = 'blind';
        const srcs = [...new Set(blind.map(id => sourceName(byId[id].source)))].join(', ');
        log(ready, 'detect', `${rule.id} can't fire`, `The "${rule.name}" rule needs ${srcs} logs in real time, but they went to ${coldName}, where real-time rules don't run.`, { missed: true, rule: rule.id, ruleName: rule.name, blindSpot: true });
        continue;
      }
      ruleState[rule.id] = 'fired';
      const promoted = vis.includes('promoted');
      at(ready + (rule.delay ?? 1), 0, t => raiseAlert(t, rule, promoted));
    }
  }

  function raiseAlert(t, rule, promoted, fromHunt = false) {
    const alert = { t, rule, promoted, fromHunt };
    S.alerts.push(alert);
    if (S.firstAlertAt == null) S.firstAlertAt = t;
    if (rule.rootCause && S.rootCauseAt == null) {
      S.rootCauseAt = t;
    }
    const sev = rule.severity === 'high' ? 'High' : 'Medium';
    log(t, 'detect', `Alert: ${rule.name}`, rule.logic, {
      severity: rule.severity, rule: rule.id, badges: [sev, ...(promoted ? ['Promoted by routing'] : []), ...(fromHunt ? ['Hunting agent'] : [])],
    });
    if (model === 'agentic') agentOnAlert(t, alert); else humanOnAlert(t, alert);
  }

  // ---- shared helpers --------------------------------------------------
  function rootCauseIsHot() {
    if (!rootEvent || S.happened[rootEvent.id] == null) return false;
    const v = visibility(rootEvent);
    return v === 'hot' || v === 'promoted';
  }

  function contain(t, who) {
    if (S.containedAt != null) return;
    S.containedAt = t;
    const primary = S.compromised.find(c => c.primary);
    if (primary) primary.revokedAt = t;
    log(t, 'outcome', 'Contained', `${L.victim}'s sessions revoked, password reset, any attacker inbox rules removed (${who}).`, { good: true });
  }

  function blockAndPurge(t, who) {
    if (S.blockedAt == null) S.blockedAt = t;
    if (S.purgedAt == null) S.purgedAt = t;
    log(t, 'outcome', 'Phishing domain blocked, emails purged', `${L.domain} blocked at DNS/proxy; the lure removed from all ${L.recipients} inboxes (${who}).`, { good: true });
  }

  function revokeOthers(t, list, who) {
    for (const c of list) c.revokedAt = t;
    log(t, 'outcome', `Revoked: ${list.map(c => c.name).join(', ')}`, `Additional compromised account(s) contained (${who}).`, { good: true });
  }

  // Search for everyone who visited the phishing domain. Hot = instant.
  function clickerSearch(t, lane, actor, onDone) {
    const hot = rootCauseIsHot();
    const done = hot ? t : t + coldLatency;
    if (!hot) {
      spend.push({ t, usd: coldCost, what: 'clicker search' });
      log(t, lane, `${actor} searches ${coldName} for other visitors to the domain`, `Query started. Expected ${fmtDuration(coldLatency)}, about $${coldCost.toFixed(2)}.`, { query: true });
    }
    at(done, 0, tt => {
      const visitors = S.clickers.filter(c => c.at <= t);
      const others = S.compromised.filter(c => !c.primary && c.at <= t && c.revokedAt == null);
      const names = visitors.map(v => v.name).join(', ') || 'none';
      const lostCreds = others.length ? `Credentials stolen: ${others.map(o => o.name).join(', ')}.` : 'No one else entered credentials.';
      log(tt, lane, 'Other visitors identified', `Visited the domain: ${names}. ${lostCreds}`);
      onDone(tt, others);
    });
  }

  // ---- traditional (human) SOC ----------------------------------------
  function queueWait(rule, t) {
    const base = rule.severity === 'high' ? params.queueHigh : params.queueMedium;
    return isBusiness(t) ? base : base * params.offHoursQueueMultiplier;
  }

  function humanOnAlert(t, alert) {
    if (S.case) {
      // Correlated within 5 minutes of case creation → same queue item.
      if (t - S.case.openedAt <= 5) { S.case.alerts.push(alert); return; }
      const pick = t + queueWait(alert.rule, t);
      at(pick, 0, tt => {
        addWork(tt + FIXED.dupAlertHandsOn, FIXED.dupAlertHandsOn, 'Tier-1');
        log(tt, 'human', `A Tier-1 analyst picks up the ${alert.rule.id} alert`, `After ${fmtDuration(pick - t)} in the queue. Discovers it's already part of an open case. Nobody had linked them.`, { who: 'Tier-1' });
      });
      return;
    }
    S.case = { openedAt: t, alerts: [alert] };
    const wait = queueWait(alert.rule, t);
    const pick = t + wait;
    at(pick, 0, tt => {
      log(tt, 'human', 'Tier-1 analyst picks up the alert', `It waited ${fmtDuration(wait)} in the ${alert.rule.severity}-severity queue.`, { who: 'Tier-1', phase: 'triage' });
      const done = tt + params.t1Triage;
      addWork(done, params.t1Triage, 'Tier-1');
      at(done, 0, t2 => {
        log(t2, 'human', 'Tier-1 escalates to Tier-2', alert.rule.triageNote ?? 'Looks malicious; needs investigation.', { who: 'Tier-1', phase: 'escalated' });
        at(t2 + params.t2Wait, 0, humanInvestigate);
      });
    });
  }

  function humanInvestigate(t) {
    const clear = S.case.alerts.some(a => a.rule.confidence === 'clear') || S.alerts.some(a => a.rule.confidence === 'clear' && a.t <= t);
    if (clear) {
      log(t, 'human', 'Tier-2 investigates by hand', `Pivots across the identity provider, mailbox audit, and ${rootCauseIsHot() ? 'proxy logs' : 'other hot data'}, one console at a time.`, { who: 'Tier-2', phase: 'investigating' });
      const done = t + params.t2Clear;
      addWork(done, params.t2Clear, 'Tier-2');
      at(done, 0, humanContain);
    } else {
      log(t, 'human', 'Tier-2 investigates by hand', L.ambiguousNote, { who: 'Tier-2', phase: 'investigating' });
      const asked = t + params.t2Unclear;
      addWork(asked, params.t2Unclear, 'Tier-2');
      at(asked, 0, tt => {
        log(tt, 'human', `Tier-2 asks ${L.victim} to confirm`, `Waiting for a reply (${fmtDuration(params.userConfirmWait)}).`, { who: 'Tier-2', phase: 'waiting-user' });
        at(tt + params.userConfirmWait, 0, t3 => {
          log(t3, 'user', `${L.victim} replies: "That wasn't me"`, 'Tier-2 now has enough to act.');
          humanContain(t3);
        });
      });
    }
  }

  function humanContain(t) {
    if (S.rootCauseAt == null && rootCauseIsHot()) {
      S.rootCauseAt = t;
      log(t, 'human', 'Tier-2 finds the root cause', `${L.rootCause} found in the proxy logs.`, { who: 'Tier-2' });
    }
    log(t, 'human', 'Tier-2 runs the containment playbook', 'SOAR revokes sessions, resets the password, and removes inbox rules.', { who: 'Tier-2', phase: 'containing' });
    addWork(t + FIXED.playbookRun, FIXED.playbookHandsOn, 'Tier-2');
    at(t + FIXED.playbookRun, 0, tt => {
      contain(tt, 'SOAR playbook');
      humanRootCause(tt);
    });
  }

  function humanRootCause(t) {
    if (S.rootCauseAt != null) return humanScope(Math.max(t, S.rootCauseAt));
    if (!params.humanChecksCold) {
      log(t, 'human', 'Root cause never found', `The evidence is in ${coldName}, and nobody thought to search it. The other targets of the phishing email stay exposed.`, { who: 'Tier-2', bad: true });
      return humanWriteUp(t);
    }
    const startQ = t + params.coldDecision;
    addWork(startQ, params.coldDecision, 'Tier-2');
    at(startQ, 0, tt => {
      spend.push({ t: tt, usd: coldCost, what: 'root-cause search' });
      log(tt, 'human', `Tier-2 searches ${coldName}`, `Hot data doesn't show how the credentials were stolen. Started a search of ${L.victim}'s web activity: ${fmtDuration(coldLatency)}, about $${coldCost.toFixed(2)}.`, { who: 'Tier-2', query: true });
      at(tt + coldLatency, 0, t3 => {
        S.rootCauseAt = t3;
        log(t3, 'human', 'Root cause found', `${L.rootCause}.`, { who: 'Tier-2' });
        humanScope(t3);
      });
    });
  }

  function humanScope(t) {
    const done = t + params.scoping;
    addWork(done, params.scoping, 'Tier-2');
    at(done, 0, tt => {
      blockAndPurge(tt, 'Tier-2');
      clickerSearch(tt, 'human', 'Tier-2', (t3, others) => {
        if (others.length) {
          addWork(t3 + FIXED.playbookHandsOn, FIXED.playbookHandsOn, 'Tier-2');
          revokeOthers(t3 + FIXED.playbookRun, others, 'SOAR playbook');
        }
        humanWriteUp(t3 + FIXED.playbookRun);
      });
    });
  }

  function humanWriteUp(t) {
    const done = t + params.writeUp;
    addWork(done, params.writeUp, 'Tier-2');
    at(done, 0, tt => {
      S.caseClosedAt = tt;
      log(tt, 'human', 'Case written up and closed', `By hand: ${fmtDuration(params.writeUp)}.`, { who: 'Tier-2', phase: 'closed' });
    });
  }

  // ---- agentic SOC -----------------------------------------------------
  function approval(t, actions, title, onApproved) {
    const wait = isBusiness(t) ? params.approvalWait : params.approvalWaitOff;
    log(t, 'agent', `Agent asks for approval: ${title}`, `Proposed: ${actions}. Each claim links to the evidence behind it.`, { approval: true, phase: 'awaiting-approval' });
    const ok = t + wait;
    addWork(ok, params.reviewMinutes, 'Analyst');
    at(ok, 0, tt => {
      log(tt, 'human', 'Analyst reviews and approves', `Approval took ${fmtDuration(wait)} (${isBusiness(t) ? 'business hours' : 'off hours, on-call'}).`, { who: 'Analyst', phase: 'approved' });
      at(tt + FIXED.agentAction, 0, onApproved);
    });
  }

  function agentOnAlert(t, alert) {
    if (S.case) {
      S.case.alerts.push(alert);
      log(t, 'agent', `Agent links ${alert.rule.id} to the open case`, 'Same user, same session. No new ticket, no duplicate human work.');
      return;
    }
    S.case = { openedAt: t, alerts: [alert] };
    const triaged = t + params.agentTriage;
    at(triaged, 0, tt => {
      log(tt, 'agent', 'Agent triages immediately', alert.rule.agentTriageNote ?? 'No queue: every alert is triaged on arrival.', { phase: 'triage' });
      // Kick off the cold search in parallel if the root cause isn't in hot data.
      if (S.rootCauseAt == null && !rootCauseIsHot() && rootEvent && S.happened[rootEvent.id] != null) {
        spend.push({ t: tt, usd: coldCost, what: 'root-cause search' });
        log(tt, 'agent', `Agent searches ${coldName} in parallel`, `Looking for ${L.victim}'s web activity before the suspicious sign-in. ${fmtDuration(coldLatency)}, about $${coldCost.toFixed(2)} of the $50 budget. It doesn't wait for the result.`, { query: true });
        at(tt + coldLatency, 0, t3 => {
          if (S.rootCauseAt == null) {
            S.rootCauseAt = t3;
            log(t3, 'agent', 'Cold search returns: root cause found', `${L.rootCause}.`);
            if (S.agentProposed) agentFollowUp(t3);
          }
        });
      }
      const inv = tt + params.agentInvestigate;
      at(inv, 0, agentPropose);
    });
  }

  function agentPropose(t) {
    if (S.rootCauseAt == null && rootCauseIsHot()) S.rootCauseAt = t;
    S.agentProposed = true;
    const full = S.rootCauseAt != null && S.rootCauseAt <= t;
    log(t, 'agent', 'Agent finishes the investigation', full
      ? `Confirmed: ${L.attackSummary}. ${L.rootCause}; the same email went to ${L.recipients} people.`
      : `Hot data is enough to act: ${L.hotEvidence}. Root cause still pending from ${coldName}.`);
    if (full) {
      clickerSearch(t, 'agent', 'Agent', (_tt, others) => { S.pendingOthers = others; });
      approval(t, `revoke ${L.victim}'s sessions and reset password; block ${L.domain}; purge the email from all ${L.recipients} inboxes`, 'contain and block', tt => {
        contain(tt, 'agent, approved');
        blockAndPurge(tt, 'agent, approved');
        agentFinishOthers(tt);
      });
    } else {
      approval(t, `revoke ${L.victim}'s sessions, reset password, remove inbox rules`, 'interim containment', tt => contain(tt, 'agent, approved'));
    }
  }

  function agentFollowUp(t) {
    const tt = t + 2;
    at(tt, 0, t2 => {
      log(t2, 'agent', 'Agent pivots to email logs', `Same domain found in a message sent to ${L.recipients} people.`);
      clickerSearch(t2, 'agent', 'Agent', (_t3, others) => { S.pendingOthers = others; });
      approval(t2, `block ${L.domain}; purge the email from all ${L.recipients} inboxes`, 'block and purge', t4 => {
        blockAndPurge(t4, 'agent, approved');
        agentFinishOthers(t4);
      });
    });
  }

  function agentFinishOthers(t) {
    // Wait for the clicker search if it's still running.
    const check = tt => {
      if (S.pendingOthers === undefined) return at(tt + 1, 0, check);
      const others = S.pendingOthers.filter(o => o.revokedAt == null);
      if (others.length) {
        approval(tt, `revoke sessions for ${others.map(o => o.name).join(', ')}`, 'contain other victims', t2 => {
          revokeOthers(t2, others, 'agent, approved');
          agentReport(t2);
        });
      } else {
        agentReport(tt);
      }
    };
    check(t);
  }

  function agentReport(t) {
    const drafted = t + 5;
    at(drafted, 0, tt => {
      log(tt, 'agent', 'Agent drafts the case report', `Timeline, evidence, MITRE ATT&CK mapping (${L.mitre}).`);
      addWork(tt + params.reviewMinutes, params.reviewMinutes, 'Analyst');
      at(tt + params.reviewMinutes, 0, t2 => {
        S.caseClosedAt = t2;
        log(t2, 'human', 'Analyst reviews and closes the case', 'Hands-on time is reading, not writing.', { who: 'Analyst', phase: 'closed' });
      });
    });
  }

  // ---- hunting agent (agentic only) -------------------------------------
  if (model === 'agentic' && scenario.hunt) {
    let ht = Math.floor(start / 1440) * 1440 + params.huntHour * 60;
    while (ht <= start) ht += 1440;
    if (ht <= end) {
      at(ht, 0, t => {
        const ev = byId[scenario.hunt.needs];
        if (!ev || S.happened[ev.id] == null) return;
        if (S.case) {
          log(t, 'agent', 'Hunting agent runs', 'Finds the same phishing domain. Already covered by the open case.');
          return;
        }
        log(t, 'agent', 'Hunting agent runs its scheduled sweep', `${scenario.hunt.name}. This is the first time anything has looked at this data.`);
        raiseAlert(t + 1, { ...scenario.hunt.asRule }, false, true);
      });
    }
  }

  // ---- run ---------------------------------------------------------------
  while (queue.length) {
    queue.sort((a, b) => a.t - b.t || a.prio - b.prio || a.seq - b.seq);
    const item = queue.shift();
    if (item.t > end) break;
    item.fn(item.t);
  }

  if (S.firstAlertAt == null) {
    log(end, 'outcome', 'Nothing detected', L.undetected, { bad: true });
  }

  timeline.sort((a, b) => a.t - b.t);

  // ---- metrics -------------------------------------------------------------
  const firstMal = parseTime(byId[scenario.firstMaliciousEvent]?.time ?? scenario.start);
  const realtimeRules = scenario.rules.filter(r => !r.suppressed && r.needs.every(id => byId[id]));
  const covered = realtimeRules.filter(r => r.needs.every(id => ['hot', 'promoted'].includes(visibility(byId[id]))));
  const accessEnd = S.containedAt ?? end;
  const metrics = {
    firstAlertAt: S.firstAlertAt,
    mttd: S.firstAlertAt != null ? S.firstAlertAt - firstMal : null,
    containedAt: S.containedAt,
    mttr: S.containedAt != null && S.firstAlertAt != null ? S.containedAt - S.firstAlertAt : null,
    rootCauseAt: S.rootCauseAt,
    objectiveReached: S.objectiveAt != null,
    compromised: S.compromised.map(c => c.name),
    attackerAccessMin: S.accessStartAt != null ? Math.max(0, accessEnd - S.accessStartAt) : 0,
    accessStartAt: S.accessStartAt,
    compromisedDetail: S.compromised.map(c => ({ name: c.name, at: c.at, revokedAt: c.revokedAt })),
    objectiveAt: S.objectiveAt,
    firstMaliciousAt: firstMal,
    analystMin: work.reduce((s, w) => s + w.min, 0),
    queryCost: spend.reduce((s, x) => s + x.usd, 0),
    coverage: { covered: covered.length, total: realtimeRules.length },
    cost: monthlyCost(arch, routingOn, params),
    caseClosedAt: S.caseClosedAt,
  };

  return { config: { arch, model, routing: routingOn }, start, end, timeline, work, spend, metrics };
}
