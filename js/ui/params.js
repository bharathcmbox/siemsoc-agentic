// Assumption sliders, grouped. Calls onChange(newParams) on every edit.
import { h } from './dom.js';
import { PARAMS, PARAM_GROUPS, defaultParams } from '../engine/assumptions.js';

function fmt(p, v) {
  if (p.unit === 'bool') return v ? 'Yes' : 'No';
  const decimals = (String(p.step).split('.')[1] ?? '').length;
  const n = Number(v).toFixed(decimals);
  if (p.unit === '$') return `$${n}`;
  if (p.unit === '%') return `${n}%`;
  if (p.unit === '×') return `${n}×`;
  if (p.unit === 'h') return `${String(v).padStart(2, '0')}:00`;
  return `${n} ${p.unit}`;
}

export function renderParams(root, params, onChange) {
  let cur = { ...params };
  const set = (id, v, live) => { cur = { ...cur, [id]: v }; onChange(cur, live); };
  const groups = {};
  for (const p of PARAMS) (groups[p.group] ??= []).push(p);

  const body = h('div', { class: 'param-groups' },
    Object.entries(groups).map(([g, list]) => h('div', {},
      h('h3', {}, PARAM_GROUPS[g]),
      list.map(p => {
        const id = `param-${p.id}`;
        if (p.unit === 'bool') {
          return h('label', { class: 'param', for: id },
            h('span', {}, p.label),
            h('input', { id, type: 'checkbox', checked: params[p.id], onchange: e => set(p.id, e.target.checked, false) }));
        }
        const out = h('output', { for: id }, fmt(p, params[p.id]));
        return h('div', { class: 'param' },
          h('label', { for: id }, p.label), out,
          h('input', {
            id, type: 'range', min: p.min, max: p.max, step: p.step, value: params[p.id],
            oninput: e => { const v = Number(e.target.value); out.textContent = fmt(p, v); set(p.id, v, true); },
          }));
      }),
    )),
  );

  root.replaceChildren(
    h('details', { class: 'params' },
      h('summary', {}, 'Assumptions'),
      h('p', { class: 'note' }, 'Every number in the simulator comes from these settings. The defaults are illustrative, chosen for a mid-sized company. Move a slider and both sides re-run instantly. Full notes are in docs/assumptions.md.'),
      body,
      h('p', {}, h('button', { class: 'btn', onclick: () => onChange(defaultParams(), false, true) }, 'Reset to defaults')),
    ),
  );
  if (root.dataset.open === '1') root.querySelector('details').open = true;
  root.querySelector('details').addEventListener('toggle', e => { root.dataset.open = e.target.open ? '1' : ''; });
}
