import { h } from './dom.js';

const SEEN_KEY = 'soc-sim.routing-info-seen';

let dialog;
let shareSpan;
let costSpan;

function build() {
  dialog = h('dialog', { 'aria-labelledby': 'routing-title' },
    h('div', { class: 'dlg' },
      h('h2', { id: 'routing-title' }, 'Detection-aware routing'),
      h('p', {}, 'Most of the noisy data (DNS, web proxy, firewall) still goes to cheap storage or the data lake. ',
        'But the pipeline checks each event as it arrives, and ', h('strong', {}, 'copies the few suspicious ones'),
        ' into the hot tier, where real-time detection rules can see them.'),

      h('div', { class: 'flow', 'aria-label': 'How an event is routed' },
        h('div', { class: 'box' }, h('b', {}, '1. Event arrives'), 'e.g. a DNS lookup for halvorsen-login.example'),
        h('div', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
        h('div', { class: 'box' }, h('b', {}, '2. Pipeline enriches it'), 'Looks up domain age, threat intel, lookalikes'),
        h('div', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
        h('div', { class: 'split' },
          h('div', { class: 'box hot' }, h('b', {}, 'Matches a pattern'), 'Copy goes to the hot tier → real-time rules'),
          h('div', { class: 'box cold' }, h('b', {}, 'Every event'), 'Still stored in cheap storage / lake for hunting'),
        ),
      ),

      h('h3', {}, 'Patterns promoted in this simulator'),
      h('ul', {},
        h('li', {}, 'Domain registered less than 7 days ago'),
        h('li', {}, 'Domain on a threat-intelligence list'),
        h('li', {}, 'Lookalike of a company domain (e.g. halvorsen-login vs halvorsen)'),
      ),

      h('div', { class: 'three' },
        h('div', {}, h('h3', {}, 'What it buys'),
          'The real-time detections you planned for work again, for a tiny share of the data: about ', shareSpan = h('span'), ' of DNS/proxy volume here.'),
        h('div', {}, h('h3', {}, 'What it costs'),
          'A small amount of hot-tier volume (about ', costSpan = h('span'), ' a month here). Someone has to keep the pattern list current, and the pipeline now depends on its enrichment lookups.'),
        h('div', {}, h('h3', {}, "What it doesn't fix"),
          "Patterns nobody anticipated. A phishing domain that's 30 days old wouldn't be promoted. That's what hunting, by people or a hunting agent, is for."),
      ),

      h('p', { class: 'note' }, 'It only applies to the Tiered and Federated / lake architectures. With index-at-ingest, everything is already in the hot tier.'),
      h('div', { class: 'close-row' }, h('button', { class: 'btn primary', onclick: () => dialog.close() }, 'Got it')),
    ),
  );
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
}

// info: { share: '0.1%', cost: '$17' }, computed from the current assumptions.
export function openRoutingInfo(info) {
  if (!dialog) build();
  shareSpan.textContent = info.share;
  costSpan.textContent = info.cost;
  if (!dialog.open) dialog.showModal();
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage unavailable */ }
}

export function openRoutingInfoFirstTime(info) {
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* storage unavailable */ }
  if (!seen) openRoutingInfo(info);
}
