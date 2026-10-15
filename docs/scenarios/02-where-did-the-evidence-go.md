# Scenario 2 — "Where Did the Evidence Go?"

**Purpose:** Separate the **data architecture** question from the **operating model** question. Same attack as scenario 1, one change by the attacker, and the strongest early evidence lands in data that many teams label "low value."

**Exec one-liner:** Not indexing everything saves real money — but it moves where your blind spots are. An agentic SOC recovers most of the *response* time, and finds more victims, but it can't make the first alert happen any earlier. That's a routing and detection-engineering decision.

Cast, infrastructure, and objective are the same as [scenario 1](01-phishing-to-bec.md).

---

## What changes from scenario 1

1. **The attacker relays through a residential proxy in Illinois** (`198.51.100.77`, consumer ISP ASN) instead of a hosting provider in Amsterdam. **R-IT (impossible travel) does not fire.** This is a common, cheap attacker technique.
2. **DNS and proxy logs are labeled "low value"** and routed to the cheap tier (tiered model) or to the lake only (federated model). See `docs/assumptions.md` §2.

Everything else in the attacker timeline (E0–E9) is unchanged.

## Which rules can fire, by architecture

| Rule | Required source(s) | Index-at-ingest | Tiered | Federated / lake |
|---|---|---|---|---|
| R-IT | IdP | Doesn't fire (attacker IP is local) | Doesn't fire | Doesn't fire |
| R-NRD | DNS/proxy + IdP | **Fires 09:14 (High)** | Can't run — proxy is in cheap tier | Can't run — no streaming rule on lake data |
| R-FWD | Email audit | Fires 09:48 (Medium) | Fires 09:48 (Medium) | Fires 09:48 (Medium) |
| H-NRD (hunt) | DNS/proxy | n/a | Hunting agent, daily 02:00 | Hunting agent, daily 02:00 |

**Detection coverage** for this scenario: 2 of 2 real-time rules under index-at-ingest; 1 of 2 under tiered and lake.

---

## Run A — Index-at-ingest, Traditional

R-NRD fires at 09:14 with the phishing domain already in the alert. The response follows scenario 1 Run A closely.

**Outcome:** contained 10:57, fraud avoided, Sam safe. **Monthly data cost is the highest of all runs** (see table below).

## Run B — Tiered, Traditional

| Time | What happens | Who | Hands-on min |
|---|---|---|---|
| 09:48 | R-FWD fires (Medium). First and only alert | SIEM | |
| 11:18 | Tier-1 picks up after 90 min medium-queue wait | Tier-1 | |
| 11:28 | External forwarding of finance keywords on an AP user → escalate | Tier-1 | 10 |
| 11:45 | Tier-2 picks up. IdP sign-in from an in-state residential IP with MFA approved — **looks legitimate** | Tier-2 | |
| 11:45–12:25 | Tier-2 messages Dana to ask if she created the rule; she is at lunch; Tier-2 keeps digging in hot data | Tier-2 | 40 |
| 12:30 | ❌ **Fraudulent bank-change request sent to Marcus** | Attacker | |
| 12:38 | Dana replies "not me." Tier-2 runs containment playbook | Tier-2 + SOAR | 5 |
| **12:40** | **Contained** — 10 minutes too late | | |
| 12:40–13:10 | Tier-2 needs to know *how* the credentials were stolen. Hot data has no clue. Decides to search the cheap tier for Dana's web activity | Tier-2 | 30 |
| 13:05 | ❌ **Sam enters credentials** on the still-unblocked phishing site | Attacker | |
| 13:10–13:30 | Cheap-tier search job runs (20 min) | Cheap tier | |
| 13:30 | Phishing domain found; domain blocked; second search started to find other clickers | Tier-2 | 5 |
| 13:55 | Results: Priya and Sam. Sam's sessions revoked; emails purged; finance alerted to recall the payment request | Tier-2 + SOAR | 15 |
| 14:05–14:50 | Case write-up | Tier-2 | 45 |

**Outcome:** fraud request sent (finance must catch it manually), **two compromised users** instead of one. And this assumes Tier-2 *thought* to check the cheap tier — the 30% default in `assumptions.md` says often they won't, and the root cause stays unknown.

## Run C — Federated / lake, Traditional

Same as Run B until 13:10. The lake query takes ~3 min instead of 20, so the domain is found at 13:13 — **still after Sam's 13:05 compromise**.

**Teaching point:** faster cold queries help only once someone decides to look. For a human SOC, the hard part is the deciding.

## Run D — Tiered, Agentic

| Time | What happens | Who | Hands-on min |
|---|---|---|---|
| 09:48 | R-FWD fires (Medium) | SIEM | |
| 09:48–09:50 | Triage: external forwarding + finance keywords + AP role + sign-in from a never-seen device 35 min earlier → **high risk, investigate**. (Humans tend to deprioritize medium alerts; the agent triages everything on arrival.) | Agent | |
| 09:50–09:52 | Hot-data investigation: IdP shows a new-device sign-in at 09:13; mailbox audit shows API reads since 09:40 | Agent | |
| 09:52 | **Starts cheap-tier search** for Dana's DNS/proxy activity 08:45–09:15 ($5 of $50 budget) | Agent | |
| 09:53 | Doesn't wait: proposes interim containment from hot evidence alone (revoke sessions, remove rule, reset password) | Agent | |
| 09:53–10:03 | Human reviews and approves | On-shift analyst | 5 |
| **10:05** | **Contained** | SOAR (driven by agent) | |
| 10:12 | Cheap-tier results: `halvorsen-login.example`, 3 days old, visited at 09:12 → root cause is AiTM phishing | Agent | |
| 10:10 | Priya clicks the link | Attacker | |
| 10:12–10:14 | Email logs (hot): same domain in a message to 12 recipients | Agent | |
| 10:14 | Second cheap-tier search: who else resolved the domain? ($5; total $10 of $50) | Agent | |
| 10:34 | Results: Dana and Priya. IdP: Priya never signed in → no credentials lost | Agent | |
| 10:35 | Proposes domain block + purge of all 12 emails + password reset for Priya as a precaution | Agent | |
| 10:35–10:45 | Human approves | On-shift analyst | 3 |
| **10:47** | Domain blocked, emails purged | SOAR | |
| 10:47–11:00 | Case report drafted, reviewed, closed | Agent + analyst | 5 |

**Outcome:** fraud avoided, Sam safe, Priya checked. Same MTTD as Run B (09:48) — **the agent could not make the first alert earlier**.

## Run E — Federated / lake, Agentic

Same as Run D, but with 3-minute lake queries instead of 20-minute cheap-tier jobs. The lake query starts at 09:52 and returns the root cause at 09:55, **before** containment instead of after. So at 09:56 the agent proposes everything in one package: revoke sessions, remove the rule, block the domain, purge the emails. The human approves at 10:06, and everything is executed by **10:08**, two minutes before Priya's 10:10 click. Query cost depends on data scanned; the default model gives about $1–2.

---

## Variant 2b — The quiet attacker (hunting agent's moment)

The attacker skips the forwarding rule (E5) and only reads mail. **No real-time rule fires in tiered or lake architectures.**

| Architecture + model | First detection |
|---|---|
| Index-at-ingest, either model | R-NRD at 09:14 |
| Tiered / lake, traditional, no hunt team | **None.** Discovered when the fraud is noticed by finance — days later |
| Tiered / lake, agentic with hunting agent | H-NRD at **02:00 next day** — ~17 hours later. Too late to stop the fraud request; in time to cut off ongoing mailbox access and protect Sam |

**This is the clearest illustration of the main point:** an agent can only investigate what something prompts it to look at. Proactive hunting partly makes up for routing choices, on a schedule. Routing evidence to where real-time detection can see it is what actually moves MTTD.

---

## Side-by-side summary (illustrative)

| Metric | A: Index / Trad | B: Tiered / Trad | C: Lake / Trad | D: Tiered / Agentic | E: Lake / Agentic |
|---|---|---|---|---|---|
| First alert | 09:14 | 09:48 | 09:48 | 09:48 | 09:48 |
| Contained | 10:57 | 12:40 | 12:40 | 10:05 | 10:08 |
| Root cause found | 09:14 (in alert) | 13:30 | 13:13 | 10:12 | 09:55 |
| Fraud request sent | No | **Yes** | **Yes** | No | No |
| Compromised users | 1 | **2** | **2** | 1 | 1 |
| Analyst hands-on min | ~138 | ~150 | ~150 | ~13 | ~10 |
| Monthly data cost* | ~$42,000 | ~$12,900 | ~$11,400 | ~$12,900 | ~$11,400 |

\* Steady-state monthly cost from the `assumptions.md` defaults, after 30% pipeline reduction:
- **Index-at-ingest:** all 700 GB/day goes to the hot tier.
- **Tiered:** 175 GB/day hot, plus 525 GB/day in the cheap tier.
- **Lake:** the same 175 GB/day hot, plus 525 GB/day in the lake (365-day retention, 5× compression).

Query costs are a few dollars per incident and aren't included. The engine will calculate the exact figures.

### The four messages this table carries

1. **Tiering saves about 70% of data cost** — a real benefit, not a vendor gimmick.
2. **With a human SOC, that saving came out of detection and response quality**: one more victim and a fraud attempt that got through.
3. **The agentic SOC recovers the response side** on cheap architectures: containment, scope, and root cause all happen sooner, with about 10× less human effort.
4. **Nothing in the agentic column moved the first alert.** Only index-at-ingest, a streaming rule on DNS/proxy, or routing that "promotes" newly-registered-domain hits into the hot tier gets you the 09:14 alert. That's the "what else" an agentic SOC needs.

---

## Toggle: detection-aware routing ON

This is the constructive answer to message 4. The pipeline enriches each DNS/proxy event with how old its domain is. Events for domains under 7 days old are **copied** to the hot tier, and everything else stays where it was. Dana's 09:12 visit to `halvorsen-login.example` (3 days old) is promoted, so **R-NRD fires at 09:14 on every architecture.**

| Run | Plays out like | First alert | Contained | Fraud sent | Compromised users | Monthly data cost |
|---|---|---|---|---|---|---|
| B+ Tiered / Trad + routing | Run A | 09:14 | 10:57 | No | 1 | ~$12,900 (+~$17) |
| C+ Lake / Trad + routing | Run A | 09:14 | 10:57 | No | 1 | ~$11,400 (+~$17) |
| D+ Tiered / Agentic + routing | Scenario 1 Run B | 09:14 | 09:36 | No | 1, and the attacker never reaches the mailbox | ~$12,900 (+~$17) |
| E+ Lake / Agentic + routing | Scenario 1 Run B | 09:14 | 09:36 | No | 1, and the attacker never reaches the mailbox | ~$11,400 (+~$17) |

The **quiet attacker** (variant 2b) is also caught at 09:14 with the toggle on, because the alert no longer depends on the forwarding rule.

**What the UI should say when the toggle is flipped in this scenario:**

> Detection-aware routing copied **1 event** out of about 400 GB/day of DNS and proxy logs into real-time detection: Dana's visit to a 3-day-old domain. That one event moved the first alert from 09:48 to 09:14, for about $17 a month.
>
> It only works for patterns you anticipated. An attacker using a 30-day-old domain wouldn't be promoted. That's what the hunting agent is for.

**Final ranking for executives (illustrative):** the best outcome at close to the lowest cost is **Lake or Tiered + detection-aware routing + agentic operations**. Each of the three choices does a different job:
- the cheaper architecture cuts the data bill
- routing brings back early detection
- the agents cut response time and human effort
