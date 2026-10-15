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

## 3. Storage and query cost

Expressed as a blended monthly cost, not any vendor's price list.

| Parameter | Default | Range | Source |
|---|---|---|---|
| Hot indexed tier — cost per GB ingested | $2.00 | $0.50 – $6.00 | Illustrative (blended license + infra) |
| Cheap tier — cost per GB ingested | $0.15 | $0.02 – $0.50 | Illustrative |
| Cheap tier — cost per search job | $5 | $0 – $50 | Illustrative |
| Data lake — object storage per GB-month | $0.023 | $0.01 – $0.05 | To verify (typical public-cloud standard object storage list price) |
| Data lake — query cost per TB scanned | $5 | $1 – $10 | To verify (typical serverless query-engine list price) |
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
| Queue wait (medium severity, off hours) | 6 h | 1 – 16 h | Illustrative |
| Tier-1 triage time per alert | 10 min | 3 – 30 min | Illustrative |
| Tier-2 investigation time per case | 90 min | 30 – 480 min | Illustrative |
| Probability Tier-1 checks the cold tier unprompted | 30% | 0 – 100% | Illustrative — scenario uses a fixed script, slider shows effect |
| SOAR playbook execution | 2 min | 1 – 10 min | Illustrative |

## 5. Time model — agentic SOC

| Parameter | Default | Range | Source |
|---|---|---|---|
| Agent triage time per alert | 2 min | 0.5 – 5 min | Illustrative |
| Agent investigation time (hot data only) | 8 min | 3 – 20 min | Illustrative |
| Human review of agent case summary | 5 min | 2 – 15 min | Illustrative |
| Human approval wait (business hours) | 10 min | 1 – 60 min | Illustrative |
| Human approval wait (off hours, on-call) | 30 min | 5 – 120 min | Illustrative |
| Query budget per investigation | $50 | $0 – $500 | Illustrative |
| Hunting agent schedule | Daily, 02:00 | Hourly – weekly | Illustrative |

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
