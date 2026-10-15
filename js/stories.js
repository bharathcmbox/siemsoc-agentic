// Stories: the executive entry points. Each story is a scenario (and variant)
// plus a few named comparisons, with plain-language names for each side.
// title: shown on the lane; sub: one line under it; ref: how the narrator
// refers to the team mid-sentence.

const cfg = (arch, model, routing = false) => ({ arch, model, routing });

const TODAY = { title: "Today's team", sub: 'Human analysts and fixed playbooks', ref: "today's team" };
const AI = { title: 'AI-assisted team', sub: 'AI agents do the legwork; people approve key actions', ref: 'the AI-assisted team' };

export const STORIES = [
  {
    id: 'phishing', scenario: '01-phishing-to-bec', variant: 'default', icon: 'mail',
    question: 'What happens when a finance employee clicks a phishing link?',
    oneLiner: 'An accounts-payable specialist signs in on a fake login page. The attacker takes over her mailbox and tries to redirect a vendor payment before Friday.',
    hook: 'An attacker steals a login and tries to redirect a vendor payment. Watch two teams handle the same morning.',
    comparisons: [
      { id: 'team', label: "Today's team vs AI-assisted team", a: cfg('index', 'traditional'), b: cfg('index', 'agentic'), names: [TODAY, AI] },
    ],
  },
  {
    id: 'storage', scenario: '02-where-did-the-evidence-go', variant: 'default', icon: 'storage',
    question: 'Cheaper log storage: what do you give up?',
    oneLiner: 'The same phishing attack, but the attacker hides where they are connecting from, so no obvious warning goes off. The best early clue is in the web-browsing logs, which many companies keep in cheap storage.',
    hook: 'Most companies now keep noisy logs in cheap storage. Here, the best early clue ends up there.',
    comparisons: [
      { id: 'arch', label: 'Keep everything searchable vs hot + cheap storage', a: cfg('index', 'traditional'), b: cfg('tiered', 'traditional'),
        names: [{ title: 'Keeps every log searchable', sub: "Today's team · about {cost} a month in data", ref: 'the keep-everything team' },
                { title: 'Hot + cheap storage', sub: "Today's team · about {cost} a month in data", ref: 'the cheap-storage team' }] },
      { id: 'team', label: "Cheap storage: today's team vs AI-assisted team", a: cfg('tiered', 'traditional'), b: cfg('tiered', 'agentic'),
        names: [{ ...TODAY, sub: 'Hot + cheap storage' }, { ...AI, sub: 'Hot + cheap storage' }] },
      { id: 'routing', label: 'AI-assisted team, without vs with smart routing', a: cfg('tiered', 'agentic'), b: cfg('tiered', 'agentic', true),
        names: [{ title: 'No smart routing', sub: 'AI-assisted · noisy logs go to cheap storage', ref: 'the team without smart routing' },
                { title: 'With smart routing', sub: 'AI-assisted · suspicious events copied to real-time detection', ref: 'the team with smart routing' }] },
    ],
  },
  {
    id: 'quiet', scenario: '02-where-did-the-evidence-go', variant: 'quiet', icon: 'quiet',
    title: 'The quiet attacker',
    oneLiner: 'The same phishing attack, but this attacker never sets up mail forwarding. They only read mail, so nothing obvious happens.',
    question: 'What if the attacker never trips an alarm?',
    hook: 'A careful attacker reads mail quietly and sets off no alerts. Who finds them, and when?',
    comparisons: [
      { id: 'team', label: "Today's team vs AI-assisted team", a: cfg('tiered', 'traditional'), b: cfg('tiered', 'agentic'),
        names: [{ ...TODAY, sub: 'Nightly sweep; on-call analysts handle hits' }, { ...AI, sub: 'Nightly sweep; an AI agent handles hits' }] },
      { id: 'routing', label: 'AI-assisted team, without vs with smart routing', a: cfg('tiered', 'agentic'), b: cfg('tiered', 'agentic', true),
        names: [{ title: 'No smart routing', sub: 'AI-assisted · relies on the nightly sweep', ref: 'the team without smart routing' },
                { title: 'With smart routing', sub: 'AI-assisted · suspicious events copied to real-time detection', ref: 'the team with smart routing' }] },
    ],
  },
  {
    id: 'budget', scenario: '05-budget-and-the-noisy-source', variant: 'default', icon: 'budget',
    question: 'Same budget, smarter design?',
    oneLiner: "An engineer installs a booby-trapped app. It quietly connects to an attacker's server, and the attacker moves on to a build server to steal source code. The security budget for log data is capped at $15,000 a month.",
    hook: 'With a fixed security budget, something has to give. Compare cutting logs with storing them differently.',
    comparisons: [
      { id: 'budget', label: 'Cut logs to fit the budget vs store them smarter', a: cfg('index', 'agentic'), b: cfg('tiered', 'agentic', true),
        names: [{ title: 'Cuts logs to fit the budget', sub: 'AI-assisted · firewall and web logs not collected', ref: 'the cut-logs team' },
                { title: 'Stores logs smarter', sub: 'AI-assisted · cheap storage + smart routing', ref: 'the store-smarter team' }] },
      { id: 'budget-team', label: "Cut logs, today's team vs store smarter, AI-assisted", a: cfg('index', 'traditional'), b: cfg('tiered', 'agentic', true),
        names: [{ title: "Today's team, cuts logs", sub: 'Firewall and web logs not collected', ref: "today's team" },
                { title: 'AI-assisted, stores smarter', sub: 'Cheap storage + smart routing', ref: 'the AI-assisted team' }] },
    ],
  },
];

const sameCfg = (x, y) => x.arch === y.arch && x.model === y.model && !!x.routing === !!y.routing;

// The story and comparison matching a scenario, variant and pair of sides, if any.
export function findStory(scenario, variant, sides) {
  for (const s of STORIES) {
    if (s.scenario !== scenario || s.variant !== variant) continue;
    const c = s.comparisons.find(c => sameCfg(c.a, sides[0]) && sameCfg(c.b, sides[1]));
    if (c) return { story: s, comparison: c };
  }
  return null;
}

export function storyFor(scenario, variant) {
  return STORIES.find(s => s.scenario === scenario && s.variant === variant) ?? null;
}

const ARCH = { index: ['Keeps every log searchable', 'the keep-everything team'], tiered: ['Hot + cheap storage', 'the cheap-storage team'], lake: ['Data lake storage', 'the data-lake team'] };
const ARCH_SUB = { index: 'keeps every log searchable', tiered: 'hot + cheap storage', lake: 'data lake storage' };

// Names for any pair of sides. Uses the story's names when the pair matches
// one; otherwise names each side by whatever differs between them.
export function laneNames(scenario, variant, sides, costs) {
  const hit = findStory(scenario, variant, sides);
  if (hit) return hit.comparison.names.map((n, i) => ({ ...n, sub: n.sub.replace('{cost}', costs[i]) }));
  const [a, b] = sides;
  return sides.map(c => {
    const team = c.model === 'agentic' ? AI : TODAY;
    const data = `${ARCH_SUB[c.arch]}${c.routing && c.arch !== 'index' ? ' + smart routing' : ''}`;
    if (a.model !== b.model) return { ...team, sub: data.charAt(0).toUpperCase() + data.slice(1) };
    if (a.arch !== b.arch) return { title: ARCH[c.arch][0], sub: `${team.title}${c.routing && c.arch !== 'index' ? ' · smart routing' : ''}`, ref: ARCH[c.arch][1] };
    if (!!a.routing !== !!b.routing) {
      return c.routing ? { title: 'With smart routing', sub: `${team.title} · ${ARCH_SUB[c.arch]}`, ref: 'the team with smart routing' }
        : { title: 'No smart routing', sub: `${team.title} · ${ARCH_SUB[c.arch]}`, ref: 'the team without smart routing' };
    }
    return { ...team, sub: data };
  }).map((n, i, arr) => (i === 1 && arr[0].title === n.title ? { title: `${n.title} (B)`, sub: n.sub, ref: `${n.ref} (B)` } : n));
}
