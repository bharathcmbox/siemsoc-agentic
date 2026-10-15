// Dev-only check: runs every scenario × configuration and prints metrics.
// Usage: node tests/run-all.mjs [--timeline scenarioId variant arch model routing]
import { readFileSync } from 'node:fs';
import { simulate, fmtTime, fmtDuration } from '../js/engine/simulate.js';
import { defaultParams } from '../js/engine/assumptions.js';

const load = id => JSON.parse(readFileSync(new URL(`../scenarios/${id}.json`, import.meta.url)));
const index = JSON.parse(readFileSync(new URL('../scenarios/index.json', import.meta.url)));
const p = defaultParams();

const args = process.argv.slice(2);
if (args[0] === '--timeline') {
  const [, id, variant, arch, model, routing] = args;
  const r = simulate(load(id), variant, { arch, model, routing: routing === 'on' }, p);
  for (const e of r.timeline) console.log(fmtTime(e.t).padEnd(10), e.lane.padEnd(9), e.prevented ? '[prevented] ' : '', e.title, '—', e.text);
  process.exit(0);
}

const rows = [];
for (const { id } of index) {
  const s = load(id);
  for (const v of s.variants) for (const arch of ['index', 'tiered', 'lake']) for (const routing of arch === 'index' ? [false] : [false, true]) for (const model of ['traditional', 'agentic']) {
    const m = simulate(s, v.id, { arch, model, routing }, p).metrics;
    rows.push({
      scen: id.slice(0, 2) + (v.id === 'default' ? '' : ' ' + v.id), arch, routing: routing ? 'on' : '', model: model.slice(0, 4),
      alert: m.firstAlertAt != null ? fmtTime(m.firstAlertAt) : 'none', contained: m.containedAt != null ? fmtTime(m.containedAt) : 'no',
      root: m.rootCauseAt != null ? fmtTime(m.rootCauseAt) : 'no', fraud: m.objectiveReached ? 'YES' : 'no', victims: m.compromised.length,
      access: fmtDuration(m.attackerAccessMin), humanMin: m.analystMin, query$: m.queryCost, cost$: Math.round(m.cost.total),
      cov: `${m.coverage.covered}/${m.coverage.total}`,
    });
  }
}
console.table(rows);
