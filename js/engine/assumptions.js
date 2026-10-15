// Default parameters for the simulator. Every number here is documented in
// docs/assumptions.md; keep the two in sync. All values are illustrative.

export const SOURCES = [
  { id: 'idp',   name: 'Identity provider',  plain: 'sign-in',             gbPerDay: 5,   value: 'High',   tieredRoute: 'hot' },
  { id: 'email', name: 'Email / mailbox audit', plain: 'email',          gbPerDay: 20,  value: 'High',   tieredRoute: 'hot' },
  { id: 'edr',   name: 'EDR',                plain: 'laptop and server',   gbPerDay: 150, value: 'High',   tieredRoute: 'hot' },
  { id: 'cloud', name: 'Cloud control plane', plain: 'cloud',              gbPerDay: 75,  value: 'Medium', tieredRoute: 'hot' },
  { id: 'fw',    name: 'Firewall',           plain: 'firewall',            gbPerDay: 350, value: 'Low',    tieredRoute: 'cold' },
  { id: 'dns',   name: 'DNS + web proxy',    plain: 'web browsing',        gbPerDay: 400, value: 'Low',    tieredRoute: 'cold' },
];

// Parameters exposed as sliders. `group` controls where they appear in the UI.
export const PARAMS = [
  // Cost
  { id: 'hotBudget',        group: 'cost', label: 'Monthly SIEM budget cap', unit: '$', min: 0, max: 50000, step: 1000, value: 0, zeroLabel: 'No cap' },
  { id: 'reduction',        group: 'cost', label: 'Pipeline volume reduction', unit: '%', min: 0, max: 60, step: 5, value: 30 },
  { id: 'hotPerGb',         group: 'cost', label: 'Hot tier, $ per GB ingested', unit: '$', min: 0.5, max: 6, step: 0.25, value: 2.0 },
  { id: 'cheapPerGb',       group: 'cost', label: 'Cheap tier, $ per GB ingested', unit: '$', min: 0.02, max: 0.5, step: 0.01, value: 0.15 },
  { id: 'lakePerGbMonth',   group: 'cost', label: 'Lake storage, $ per GB-month', unit: '$', min: 0.01, max: 0.05, step: 0.001, value: 0.023 },
  { id: 'lakeCompression',  group: 'cost', label: 'Lake compression ratio', unit: '×', min: 2, max: 10, step: 1, value: 5 },
  { id: 'lakeRetentionDays',group: 'cost', label: 'Lake retention', unit: 'days', min: 30, max: 730, step: 30, value: 365 },
  { id: 'promoteShare',     group: 'cost', label: 'Share of DNS/proxy and firewall promoted by routing', unit: '%', min: 0.01, max: 2, step: 0.01, value: 0.1 },
  { id: 'cheapSearchCost',  group: 'cost', label: 'Cheap tier, $ per search job', unit: '$', min: 0, max: 50, step: 1, value: 5 },
  { id: 'lakeQueryCost',    group: 'cost', label: 'Lake, $ per query (typical scan)', unit: '$', min: 0, max: 20, step: 0.5, value: 1.5 },

  // Human SOC timing
  { id: 'queueHigh',        group: 'human', label: 'Queue wait, high-severity alert', unit: 'min', min: 5, max: 120, step: 5, value: 20 },
  { id: 'queueMedium',      group: 'human', label: 'Queue wait, medium-severity alert', unit: 'min', min: 15, max: 480, step: 15, value: 90 },
  { id: 'offHoursQueueMultiplier', group: 'human', label: 'Off-hours queue wait multiplier', unit: '×', min: 1, max: 8, step: 0.5, value: 4 },
  { id: 't1Triage',         group: 'human', label: 'Tier-1 triage per alert', unit: 'min', min: 3, max: 30, step: 1, value: 10 },
  { id: 't2Wait',           group: 'human', label: 'Wait for Tier-2 to pick up', unit: 'min', min: 5, max: 120, step: 5, value: 20 },
  { id: 't2Clear',          group: 'human', label: 'Tier-2 investigation, clear-cut alert', unit: 'min', min: 15, max: 240, step: 5, value: 45 },
  { id: 't2Unclear',        group: 'human', label: 'Tier-2 investigation, ambiguous alert', unit: 'min', min: 15, max: 240, step: 5, value: 40 },
  { id: 'userConfirmWait',  group: 'human', label: 'Waiting for the user to confirm', unit: 'min', min: 0, max: 240, step: 5, value: 15 },
  { id: 'coldDecision',     group: 'human', label: 'Time before analyst searches cold data', unit: 'min', min: 5, max: 240, step: 5, value: 30 },
  { id: 'humanChecksCold',  group: 'human', label: 'Analyst thinks to search cold data', unit: 'bool', value: true },
  { id: 'scoping',          group: 'human', label: 'Scoping before blocking the domain', unit: 'min', min: 5, max: 120, step: 5, value: 15 },
  { id: 'writeUp',          group: 'human', label: 'Case write-up', unit: 'min', min: 10, max: 120, step: 5, value: 30 },

  // Agentic timing
  { id: 'agentTriage',      group: 'agent', label: 'Agent triage per alert', unit: 'min', min: 1, max: 5, step: 1, value: 2 },
  { id: 'agentInvestigate', group: 'agent', label: 'Agent investigation (hot data)', unit: 'min', min: 3, max: 20, step: 1, value: 8 },
  { id: 'approvalWait',     group: 'agent', label: 'Human approval wait, business hours', unit: 'min', min: 1, max: 60, step: 1, value: 10 },
  { id: 'approvalWaitOff',  group: 'agent', label: 'Human approval wait, off hours', unit: 'min', min: 5, max: 120, step: 5, value: 30 },
  { id: 'reviewMinutes',    group: 'agent', label: 'Human review per approval / report', unit: 'min', min: 1, max: 15, step: 1, value: 5 },

  // Detection on cold data (an automated job; available to both operating models)
  { id: 'scheduledSweep',   group: 'sweep', label: 'Nightly scheduled sweep of cold data', unit: 'bool', value: true },
  { id: 'huntHour',         group: 'sweep', label: 'Scheduled sweep runs daily at', unit: 'h', min: 0, max: 23, step: 1, value: 2 },

  // Data-tier latency
  { id: 'cheapSearchMin',   group: 'latency', label: 'Cheap tier search job', unit: 'min', min: 2, max: 60, step: 1, value: 20 },
  { id: 'lakeQueryMin',     group: 'latency', label: 'Lake query', unit: 'min', min: 1, max: 20, step: 1, value: 3 },
];

export const PARAM_GROUPS = {
  cost: 'Data cost',
  human: 'Traditional SOC timing',
  agent: 'Agentic SOC timing',
  sweep: 'Scheduled sweep',
  latency: 'Cold data latency',
};

// Fixed constants (not exposed as sliders).
export const FIXED = {
  playbookRun: 2,        // SOAR playbook execution, minutes
  playbookHandsOn: 5,    // analyst time to launch and verify a playbook
  dupAlertHandsOn: 5,    // analyst time to discover an alert is already handled
  agentAction: 2,        // time for approved actions to execute
  businessStart: 8 * 60,
  businessEnd: 18 * 60,
};

export function defaultParams() {
  return Object.fromEntries(PARAMS.map(p => [p.id, p.value]));
}
