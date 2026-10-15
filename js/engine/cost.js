import { SOURCES } from './assumptions.js';

// Sources whose events can be promoted by detection-aware routing.
// The default patterns are all domain-based, so only DNS/proxy qualifies.
const PROMOTABLE_SOURCES = new Set(['dns']);

// Where each source lands for a given architecture.
export function routeOf(sourceId, arch) {
  if (arch === 'index') return 'hot';
  const src = SOURCES.find(s => s.id === sourceId);
  if (!src || src.tieredRoute === 'hot') return 'hot';
  return arch === 'lake' ? 'lake' : 'cheap';
}

// Steady-state monthly data cost for one side of the comparison.
export function monthlyCost(arch, routing, p) {
  const keep = 1 - p.reduction / 100;
  const out = { hot: 0, cheap: 0, lake: 0, promoted: 0 };
  for (const s of SOURCES) {
    const gb = s.gbPerDay * keep;
    const route = routeOf(s.id, arch);
    if (route === 'hot') out.hot += gb * 30 * p.hotPerGb;
    else if (route === 'cheap') out.cheap += gb * 30 * p.cheapPerGb;
    else out.lake += (gb * p.lakeRetentionDays / p.lakeCompression) * p.lakePerGbMonth;
    if (routing && route !== 'hot' && PROMOTABLE_SOURCES.has(s.id)) {
      out.promoted += gb * (p.promoteShare / 100) * 30 * p.hotPerGb;
    }
  }
  out.total = out.hot + out.cheap + out.lake + out.promoted;
  return out;
}

export function isPromotable(sourceId) {
  return PROMOTABLE_SOURCES.has(sourceId);
}
