import { SOURCES } from './assumptions.js';

// Sources whose events detection-aware routing can promote: DNS/proxy
// (newly registered, threat-intel, and lookalike domains) and firewall
// (connections to threat-intel-listed IPs).
const PROMOTABLE_SOURCES = new Set(['dns', 'fw']);
const VALUE_RANK = { Low: 0, Medium: 1, High: 2 };

export function isPromotable(sourceId) {
  return PROMOTABLE_SOURCES.has(sourceId);
}

// Where each source would land for an architecture, ignoring the budget.
function baseRoute(src, arch) {
  if (arch === 'index' || src.tieredRoute === 'hot') return 'hot';
  return arch === 'lake' ? 'lake' : 'cheap';
}

function costOf(routes, routing, p) {
  const keep = 1 - p.reduction / 100;
  const out = { hot: 0, cheap: 0, lake: 0, promoted: 0 };
  for (const s of SOURCES) {
    const route = routes[s.id];
    const gb = s.gbPerDay * keep;
    if (route === 'hot') out.hot += gb * 30 * p.hotPerGb;
    else if (route === 'cheap') out.cheap += gb * 30 * p.cheapPerGb;
    else if (route === 'lake') out.lake += (gb * p.lakeRetentionDays / p.lakeCompression) * p.lakePerGbMonth;
    if (routing && (route === 'cheap' || route === 'lake') && PROMOTABLE_SOURCES.has(s.id)) {
      out.promoted += gb * (p.promoteShare / 100) * 30 * p.hotPerGb;
    }
  }
  out.total = out.hot + out.cheap + out.lake + out.promoted;
  return out;
}

// Decide where every source goes and what it costs. With a budget cap, the
// lowest-value, largest sources stop being collected until the cost fits.
// High-value sources are never dropped.
export function planRoutes(arch, routing, p) {
  const routingOn = routing && arch !== 'index';
  const routes = Object.fromEntries(SOURCES.map(s => [s.id, baseRoute(s, arch)]));
  const dropped = [];
  let cost = costOf(routes, routingOn, p);
  if (p.hotBudget > 0 && cost.total > p.hotBudget) {
    const candidates = SOURCES.filter(s => s.value !== 'High')
      .sort((a, b) => VALUE_RANK[a.value] - VALUE_RANK[b.value] || b.gbPerDay - a.gbPerDay);
    for (const s of candidates) {
      if (cost.total <= p.hotBudget) break;
      routes[s.id] = 'dropped';
      dropped.push(s.id);
      cost = costOf(routes, routingOn, p);
    }
  }
  return { routes, dropped, cost, overBudget: p.hotBudget > 0 && cost.total > p.hotBudget };
}

export function monthlyCost(arch, routing, p) {
  return planRoutes(arch, routing, p).cost;
}
