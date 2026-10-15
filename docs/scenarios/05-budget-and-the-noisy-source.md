# Scenario 5: The Budget and the Noisy Source

**Purpose:** Show the most common failure mode of index-at-ingest in real life. Indexing everything is expensive, so under a fixed budget the team stops collecting the noisiest sources. Then compare that with tiered storage and detection-aware routing on the same budget.

**Exec one-liner:** Under a $15,000/month SIEM budget, index-at-ingest has to drop firewall and DNS logs. It finds out about the attack four hours later, never learns how it started, and misses an infected laptop. A tiered setup on the same budget keeps those logs, and with routing it catches the attack within a minute.

> **Source of truth:** the simulation engine (`js/engine/simulate.js`) with the scenario data in `scenarios/05-budget-and-the-noisy-source.json`. The table below is engine output with default assumptions and the scenario's $15,000 budget cap.

All names, domains, and IPs are fictional (`.example` domains, RFC 5737 IP ranges).

---

## Setup

- **Budget cap:** $15,000 a month. The scenario sets it automatically, and it can be changed with the "Monthly SIEM budget cap" slider.
- **Index-at-ingest under the cap:** indexing all 700 GB/day (after pipeline reduction) would cost $42,000. To fit the cap, the lowest-value, largest sources are dropped first: DNS + web proxy, then firewall. What's left (identity, email, EDR, cloud) costs $10,500.
- **Tiered and lake** fit the cap without dropping anything ($12,863 and $11,381). Routing adds about $31.

## Attack

Thursday 2026-03-12, local time.

| # | Time | Event | Source |
|---|---|---|---|
| E1 | 08:52 | Jordan, an engineer, installs a trojanized PDF converter from a lookalike site. EDR doesn't flag it | EDR |
| E2 | 08:53 | The malware looks up its C2 server, `cdn-telemetry-sync.example`, which was added to the threat-intel feed yesterday | DNS |
| E3 | 08:53 | First beacon to 203.0.113.80, repeated every 5 minutes | Firewall |
| E4 | 09:30 | Hands-on-keyboard: the attacker explores shares and finds a cached service-account password | EDR |
| E5 | 10:45 | The attacker moves to the build server with that password; it starts calling the C2 server | Firewall |
| E8 | 11:30 | Alex, another engineer, installs the same converter; a second laptop starts calling the C2 server | Firewall |
| E6 | 12:40 | 4 GB of source code is packed into an archive on the build server | EDR |
| E7 | 13:10 | **Objective:** the archive is uploaded to external storage | Firewall |

## Detection rules

| Rule | Needs | Severity |
|---|---|---|
| R-TI: connection to a threat-intel-listed server | Firewall (E3) | High; names the C2 server |
| R-STAGE: large archive created on a server | EDR (E6) | Medium, ambiguous (could be a backup) |
| R-EXF: large upload to unfamiliar storage | Firewall (E7) | High, but only after the theft |

## Results (engine output)

| Setup | First alert | Contained | Root cause | Source code stolen | Compromised | Still active at end | Analyst min | Monthly cost |
|---|---|---|---|---|---|---|---|---|
| Index, **capped**, traditional | 12:41 | 15:38 | Never | **Yes** | 3 | Alex's laptop | 85 | $10,500 |
| Index, **capped**, agentic | 12:41 | 13:03 | Never | No (7 min to spare) | 3 | Alex's laptop | 10 | $10,500 |
| Index, no cap, traditional | 08:54 | 10:31 | 08:54 | No | 1 | — | 105 | $42,000 |
| Index, no cap, agentic | 08:54 | 09:16 | 08:54 | No | 1 | — | 10 | $42,000 |
| Tiered, traditional | 12:41 | 15:38 | 16:28 | **Yes** | 3 | Alex's laptop | 100 | $12,863 |
| Tiered, agentic | 12:41 | 13:03 | 13:03 | No | 3 | — | 20 | $12,863 |
| Tiered + routing, traditional | 08:54 | 10:31 | 08:54 | No | 1 | — | 105 | $12,894 |
| Tiered + routing, agentic | 08:54 | 09:16 | 08:54 | No | 1 | — | 10 | $12,894 |
| Lake + routing, agentic | 08:54 | 09:16 | 08:54 | No | 1 | — | 10 | $11,413 |

## What it shows

1. **Under a budget, index-at-ingest doesn't mean "everything".** It means "everything you can afford", and the noisy sources go first. In this attack, those were the only sources that showed the malware calling home.
2. **Logs that are never collected can't be searched later either.** Tiered storage without routing also misses the early alert, but it can still find the root cause and Alex's laptop afterwards. The capped index-at-ingest setup never can.
3. **The agent still matters.** On the capped setup, it stops the theft 7 minutes before it happens, because it triages the medium-severity archive alert immediately. But it can't find what isn't in the data.
4. **Same budget, different design:** tiered or lake storage plus routing catches the attack at 08:54 for about $12,900 a month, compared with $42,000 for the uncapped index-at-ingest setup that does the same.

The default comparison in the simulator is "Budget: index-at-ingest vs tiered + routing, both agentic", so the operating model is the same on both sides and only the data design differs.
