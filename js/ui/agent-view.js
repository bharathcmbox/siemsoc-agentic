// "Inside the agent": the agentic side's own steps, shown two ways.
//   One agent         — a single generalist with every permission.
//   Team of specialists — an orchestrator hands the case between triage,
//                         investigation, response and reporting agents.
// The timings come from the same simulation, so the outcome is identical;
// what changes is who holds which permission and how the record reads.
import { h } from './dom.js';
import { clock12 } from './narrator.js';

const ROLES = {
  triage: { name: 'Triage agent', color: 'var(--a)', access: 'Reads alerts and recent sign-in, email and device activity' },
  investigation: { name: 'Investigation agent', color: 'var(--b)', access: 'Reads all logs, including cheap storage, within a search budget' },
  response: { name: 'Response agent', color: 'var(--active)', access: 'Can lock accounts, isolate machines and block addresses, only after a person approves' },
  reporting: { name: 'Reporting agent', color: 'var(--undetected)', access: 'Reads the case; writes the report and ticket' },
  human: { name: 'Person', color: 'var(--muted)', access: 'Reviews evidence and approves high-impact actions' },
  generalist: { name: 'AI agent', color: 'var(--a)', access: 'All of the above, under one identity' },
};

// Map an engine timeline entry from the agentic side to a role and a
// plain description of what it touched.
function classify(e) {
  if (e.lane === 'human') return { role: 'human', touch: e.phase === 'approved' ? 'Approval' : 'Review' };
  if (e.lane === 'outcome' && /agent, approved/.test(e.text)) return { role: 'response', touch: 'Action (approved)' };
  if (e.lane !== 'agent') return null;
  const t = e.title;
  if (/triages|links|storm/i.test(t)) return { role: 'triage', touch: 'Read: alert and recent activity' };
  if (/asks for approval/i.test(t)) return { role: 'response', touch: 'Proposal; no action yet' };
  if (/report/i.test(t)) return { role: 'reporting', touch: 'Write: case report' };
  if (e.query) return { role: 'investigation', touch: 'Search: cheap storage or data lake (billed)' };
  return { role: 'investigation', touch: 'Read: logs across systems' };
}

let dialog;
let body;

function build() {
  body = h('div', { class: 'dlg' });
  dialog = h('dialog', { class: 'wide', 'aria-label': 'Inside the agent' }, body);
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

export function openAgentView(result, teamName) {
  if (!dialog) build();
  const steps = result.timeline.map(e => ({ e, c: classify(e) })).filter(x => x.c);
  let mode = 'team';

  const list = h('ol', { class: 'agent-steps' });
  const perms = h('div', { class: 'agent-perms' });
  const tabs = h('div', { class: 'steps', role: 'tablist' });

  const render = () => {
    tabs.replaceChildren(...[['single', 'One agent'], ['team', 'Team of specialists']].map(([id, label]) => h('button', {
      type: 'button', role: 'tab', class: 'step', 'aria-selected': String(mode === id), onclick: () => { mode = id; render(); },
    }, label)));

    const rows = [];
    let prevRole = null;
    let n = 0;
    for (const { e, c } of steps) {
      const role = mode === 'single' && c.role !== 'human' ? 'generalist' : c.role;
      if (mode === 'team' && role !== 'human' && prevRole && role !== prevRole && prevRole !== 'human') {
        rows.push(h('li', { class: 'handoff' }, h('span', { class: 't' }, clock12(e.t)),
          h('span', {}, `Orchestrator hands the case from the ${ROLES[prevRole].name.toLowerCase()} to the ${ROLES[role].name.toLowerCase()}`)));
      }
      if (role !== 'human') prevRole = role;
      n++;
      rows.push(h('li', {},
        h('span', { class: 't' }, clock12(e.t)),
        h('span', { class: 'role', style: `--role:${ROLES[role].color}` }, ROLES[role].name),
        h('span', { class: 'what' }, h('b', {}, e.title), h('span', { class: 'touch' }, c.touch)),
        h('span', { class: 'audit' }, `#${String(n).padStart(3, '0')}`)));
    }
    list.replaceChildren(...rows);

    const roles = mode === 'single' ? ['generalist', 'human'] : ['triage', 'investigation', 'response', 'reporting', 'human'];
    perms.replaceChildren(
      h('h3', {}, 'Who can do what'),
      h('ul', {}, roles.map(r => h('li', {}, h('span', { class: 'role', style: `--role:${ROLES[r].color}` }, ROLES[r].name), ' ', ROLES[r].access))),
      h('h3', {}, mode === 'single' ? 'Strengths and weaknesses of one agent' : 'Strengths and weaknesses of a team'),
      mode === 'single'
        ? h('ul', {}, h('li', {}, 'One continuous line of reasoning, so nothing is lost between steps.'), h('li', {}, 'A simpler record to read afterwards.'), h('li', {}, 'One identity holds every permission, so a mistake or a manipulated agent can reach everything.'), h('li', {}, 'One very long working context; a generalist is average at each task.'))
        : h('ul', {}, h('li', {}, 'Each agent holds only the access its job needs. The agent that reads logs can never isolate a machine.'), h('li', {}, 'Each role can be tested and improved on its own, and can run in parallel.'), h('li', {}, 'Some context is lost at each handoff, and coordination adds overhead.'), h('li', {}, 'The record is longer and has to be followed across several agents.')),
    );
  };

  body.replaceChildren(
    h('h2', {}, 'Inside the agent'),
    h('p', {}, `How ${teamName} handled this story, step by step. Switch between one generalist agent and a team of specialist agents to see the same work organized two ways.`),
    tabs,
    h('div', { class: 'agent-grid' }, h('div', { class: 'agent-list' }, list), perms),
    h('p', { class: 'note' }, 'In this simulator both designs take the same time and reach the same outcome; they differ in who holds which permission and how the record reads. In real products, handoffs can add a little delay and specialists may be more accurate at their own task. The number of named agents is partly packaging: one "agent" can use helpers internally, and several named agents can be one model with different instructions. Judge by behavior: what it can do without approval, what data it can reach, and whether every step is recorded.'),
    h('div', { class: 'close-row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => dialog.close() }, 'Done')),
  );
  render();
  if (!dialog.open) dialog.showModal();
}
