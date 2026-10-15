# Metrics and Cost Model Assumptions

Every number the simulator displays is derived from the parameters below. **All defaults are illustrative**, chosen to be plausible for a mid-sized enterprise, not measured from any product. Each will be exposed as a slider in the exec summary card so viewers can plug in their own values.

The `Source` column says `Illustrative` unless a public source has been verified. Where a figure is commonly cited but not yet verified for this project, it is marked `To verify` — do not present those as sourced until checked.

---

## 1. Organization profile

| Parameter | Default | Range | Source |
|---|---|---|---|
| Employees | 5,000 | 500 – 50,000 | Illustrative |
| SOC analysts on shift (business hours) | 4 | 1 – 20 | Illustrative |
| SOC analysts on shift (off hours) | 1 | 0 – 10 | Illustrative |
| Alerts per day reaching the queue | 800 | 100 – 10,000 | Illustrative |
| Share of alerts that are false positives | 90% | 50 – 99% | To verify (industry surveys commonly report a large majority) |

## 2. Log volume by source (per day)

| Source | Default GB/day | "Detection value" label | Default route — Tiered model |
|---|---|---|---|
| Identity provider (sign-ins, MFA) | 5 | High | Hot |
| Email / mailbox audit | 20 | High | Hot |
| EDR (endpoint telemetry) | 150 | High | Hot |
| Cloud control plane | 75 | Medium | Hot |
| Firewall | 350 | Low | Cheap tier |
| DNS + web proxy | 400 | Low | Cheap tier |
| **Total** | **1,000** | | |

The "Detection value" labels deliberately mirror how many teams classify sources — and scenario 2 shows why DNS/proxy being labeled "Low" can backfire.

Pipeline reduction (dedup, field trimming) applies to all architectures: default **30%** volume reduction (range 0 – 60%), Illustrative.

### Detection-aware routing (toggle)

| Parameter | Default | Range | Source |
|---|---|---|---|
| Share of DNS/proxy and firewall events matching a promotion pattern | 0.1% | 0.01 – 2% | Illustrative |
| Default promotion patterns | DNS/proxy: newly registered domain (< 7 days), domain on threat-intel list, lookalike of a company domain. Firewall: destination IP on threat-intel list | | Illustrative |
| Added pipeline latency from enrichment | 2 s | 0.5 – 30 s | Illustrative |

Promoted events are **copied** to the hot tier and still stored in cheap storage or the lake, so cold-data hunting still has the full record. With defaults, the extra cost is (400 + 350) GB/day × 0.1% × 0.7 × 30 × $2.00 ≈ **$31/month**.

### Budget cap

If the monthly cost is over the cap, the engine stops collecting sources one at a time until it fits: lowest "detection value" first, then the largest. High-value sources are never dropped. Dropped sources can't be detected on or searched later, by humans or agents.

## 3. Storage and query cost

Expressed as a blended monthly cost, not any vendor's price list.

| Parameter | Default | Range | Source |
|---|---|---|---|
| Monthly SIEM budget cap | None (scenario 5 sets $15,000) | $0 – $50,000 | Illustrative |
| Hot indexed tier — cost per GB ingested | $2.00 | $0.50 – $6.00 | Illustrative (blended license + infra) |
| Cheap tier — cost per GB ingested | $0.15 | $0.02 – $0.50 | Illustrative |
| Cheap tier — cost per search job | $5 | $0 – $50 | Illustrative |
| Data lake — object storage per GB-month | $0.023 | $0.01 – $0.05 | To verify (typical public-cloud standard object storage list price) |
| Data lake — query cost per TB scanned | $5 | $1 – $10 | To verify (typical serverless query-engine list price) |
| Data lake — cost per investigation query (a typical scan of ~0.3 TB) | $1.50 | $0 – $20 | Illustrative, derived from the row above |
| Data lake — compression ratio (columnar files) | 5× | 2× – 10× | Illustrative |
| Retention (all tiers) | 90 days hot / 365 days cheap & lake | | Illustrative |

Hot and cheap tier prices are per GB ingested and include retention. Lake storage is billed per GB-month, so it accumulates over the retention period.

**Monthly cost:**
- Hot and cheap tiers: Σ over sources of (GB/day × (1 − reduction) × 30 × tier price)
- Lake: Σ over lake sources of (GB/day × (1 − reduction) × retention days ÷ compression × $/GB-month), at steady state
- Plus query costs incurred in the scenario

With defaults, that gives about **$42,000** (index-at-ingest), **$12,900** (tiered), and **$11,400** (lake).

## 4. Time model — traditional (human) SOC

| Parameter | Default | Range | Source |
|---|---|---|---|
| Queue wait before an alert is picked up (high severity) | 20 min | 5 – 120 min | Illustrative |
| Queue wait (medium severity, business hours) | 90 min | 15 – 480 min | Illustrative |
| Off-hours queue wait multiplier | 4× | 1 – 8× | Illustrative |
| Tier-1 triage time per alert | 10 min | 3 – 30 min | Illustrative |
| Wait for Tier-2 to pick up an escalation | 20 min | 5 – 120 min | Illustrative |
| Tier-2 investigation until containment decision, clear-cut alert | 45 min | 15 – 240 min | Illustrative |
| Tier-2 investigation, ambiguous alert (before asking the user) | 40 min | 15 – 240 min | Illustrative |
| Waiting for the user to confirm ("was this you?") | 15 min | 0 – 240 min | Illustrative |
| Time before the analyst decides to search cold data | 30 min | 5 – 240 min | Illustrative |
| Analyst thinks to search cold data at all | Yes | Yes / No | Illustrative. Surveys of how often this happens don't exist; the toggle shows the effect |
| Scoping before blocking the domain and purging emails | 15 min | 5 – 120 min | Illustrative |
| Case write-up | 30 min | 10 – 120 min | Illustrative |
| SOAR playbook execution (fixed) | 2 min | | Illustrative |
| Analyst time to launch and verify a playbook (fixed) | 5 min | | Illustrative |
| Analyst time to discover a duplicate alert is already handled (fixed) | 5 min | | Illustrative |

Business hours are 08:00–18:00.

## 5. Time model — agentic SOC

| Parameter | Default | Range | Source |
|---|---|---|---|
| Agent triage time per alert | 2 min | 0.5 – 5 min | Illustrative |
| Agent investigation time (hot data only) | 8 min | 3 – 20 min | Illustrative |
| Human review per approval or report | 5 min | 1 – 15 min | Illustrative |
| Time for approved actions to execute (fixed) | 2 min | | Illustrative |
| Human approval wait (business hours) | 10 min | 1 – 60 min | Illustrative |
| Human approval wait (off hours, on-call) | 30 min | 5 – 120 min | Illustrative |
| Query budget per investigation | $50 | $0 – $500 | Illustrative |
| Hunting agent schedule | Daily, 02:00 | Any hour | Illustrative |

## 6. Data-tier latency

| Operation | Default | Range | Source |
|---|---|---|---|
| Hot index search | 10 s | 1 – 60 s | Illustrative |
| Cheap tier search job | 20 min | 2 – 60 min | Illustrative |
| Archive rehydration | 3 h | 30 min – 24 h | Illustrative |
| Data lake query (well-partitioned) | 3 min | 30 s – 20 min | Illustrative |

Latency is identical for humans and agents. The difference the simulator shows is *whether* the query gets run, *when* it is started, and whether the waiting blocks other work.

## 7. Metric definitions

| Metric | Definition |
|---|---|
| **MTTD** | First malicious event → first alert that is part of this case |
| **Time to evidence** | First alert → the root-cause evidence (initial access) is in the case |
| **MTTR (contain)** | First alert → sessions revoked / account contained |
| **Analyst minutes** | Sum of human hands-on time for this incident (excludes waiting) |
| **Detection coverage** | Share of the scenario's detection rules whose required source lands in a tier with real-time detection |
| **Victims found** | Number of affected users identified by containment time |
| **Business impact** | Whether the attacker's objective (e.g. fraudulent payment request sent) occurred before containment |
| **Monthly data cost** | Formula in §3 |

## 8. Open items

- [ ] Verify the two `To verify` storage/query prices against current public list prices, or relabel as Illustrative.
- [ ] Find a citable public source for false-positive share and alert volume (e.g. annual SOC surveys); otherwise keep Illustrative.
- [ ] Decide whether queue wait should be computed from a simple queue model (alerts/day vs analyst throughput) instead of fixed defaults.
- [ ] §1 organization profile (headcount, alerts/day, false-positive share) isn't used by the engine yet. It becomes relevant for the alert-storm scenario.

All slider parameters are defined in `js/engine/assumptions.js`. Keep that file and this document in sync.
