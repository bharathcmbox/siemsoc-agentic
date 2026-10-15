// Dev-only: print narrator beats for one comparison.
// Usage: node tests/narrate.mjs <scenarioId> <variant> <arch-model-0|1> <arch-model-0|1>
import { readFileSync } from 'node:fs';
import { simulate, fmtTime } from '../js/engine/simulate.js';
import { defaultParams } from '../js/engine/assumptions.js';
import { buildBeats } from '../js/ui/narrator.js';
const [id, variant, a, b] = process.argv.slice(2);
const s = JSON.parse(readFileSync(new URL(`../scenarios/${id}.json`, import.meta.url)));
const side = x => { const [arch, model, r] = x.split('-'); return { arch, model, routing: r === '1' }; };
const p = defaultParams();
const beats = buildBeats(simulate(s, variant, side(a), p), simulate(s, variant, side(b), p));
for (const bt of beats) console.log(fmtTime(bt.t).padEnd(9), bt.lines.join('\n          '));
