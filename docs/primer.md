# Primer: From Traditional SOC to Agentic SOC

A vendor-neutral explainer that backs the simulator. Each section starts with a one-line **For execs** summary; the rest is for readers who want the mechanics.

---

## 1. What a SOC does

**For execs:** A Security Operations Center turns a firehose of machine logs into a small number of decisions — "is this an attack, and what do we do about it?" — as fast as possible.

Every SOC, regardless of tooling, runs the same loop:

```
Collect → Normalize → Detect → Triage → Investigate → Respond → Learn
```

The two numbers that matter most:

- **MTTD (mean time to detect)** — from the attacker's first action to the first alert about it.
- **MTTR (mean time to respond/contain)** — from that alert to the attacker being cut off.

Everything in this primer is ultimately about moving one of those two numbers, or about what it costs to move them.

---

## 2. Ingestion: the data pipeline

**For execs:** Before any security tool sees a log, a pipeline decides what to keep, how to clean it, and where to store it. Those decisions quietly set both your bill and your blind spots.

A security data pipeline sits between log sources (identity provider, email, endpoints, firewalls, DNS, cloud) and the places data is stored. Typical stages:

| Stage | What it does | Why it matters |
|---|---|---|
| **Collect** | Pull or receive logs from sources | A source never collected can never be searched |
| **Parse** | Turn raw text into fields (`user`, `src_ip`, `action`) | Unparsed data is only text-searchable |
| **Normalize** | Map every source's fields to one common schema (e.g. OCSF, an open vendor-neutral schema) | Lets one detection rule work across many products |
| **Enrich** | Add context: geo-IP, asset owner, threat intel, domain age | Saves every downstream analyst/agent the lookup |
| **Reduce** | Drop duplicates, trim verbose fields, sample noisy data | Cuts volume — and cost — often substantially |
| **Route** | Send each event to hot index, cheap tier, data lake, or nowhere | **This is a security decision disguised as a cost decision** |

The last row is the thread that runs through the whole simulator.

---

## 3. SIEM: detection and search

**For execs:** The SIEM is where logs are searched and where detection rules turn patterns into alerts.

A SIEM does two jobs:

1. **Detection** — rules that continuously watch incoming data. Example: *"a user signed in from two countries within an hour"* (impossible travel), or *"a mailbox rule now forwards mail externally."* Rules only fire on data they can see **as it arrives**.
2. **Search / investigation** — ad-hoc queries an analyst (or agent) runs after an alert: *"what else did this user do today?"*

Detections are only as good as **detection engineering** — the ongoing work of writing, testing, and tuning rules. Too loose, and analysts drown in false positives. Too tight, and attacks slip through.

---

## 4. Where the data lives: three data architectures

**For execs:** "We don't index everything any more" is now a common claim. It's a legitimate cost strategy — but it changes what your detections can see. It is a separate question from whether your SOC is agentic.

### 4.1 Index-at-ingest (classic)

Every event is parsed and indexed into fast "hot" storage on arrival.

- ✅ Any search is fast; every detection rule sees every log.
- ❌ Cost scales with volume. In practice teams **drop whole log sources** (often DNS, proxy, firewall — the noisy ones) to fit the budget. Those become permanent blind spots.

### 4.2 Tiered

The pipeline routes high-value data to the hot index and the rest to a cheaper tier: limited-search storage, archive, or "rehydrate on demand."

- ✅ Much cheaper per GB; you keep data you'd otherwise have dropped.
- ❌ Real-time detection rules typically **do not run** on the cheap tier.
- ❌ Searching it is slower, more limited, or billed per query; restoring archived data can take minutes to hours.

### 4.3 Federated / data lake

Data lands in open-format files on object storage and is queried in place ("schema-on-read"). The SIEM indexes only a subset, or nothing.

- ✅ Cheapest storage, long retention, one copy shared with other teams (IT, fraud, data science).
- ❌ Query speed depends on how the data is laid out; real-time detection needs a separate streaming path; normalization work moves to query time.

### Summary

| | Index-at-ingest | Tiered | Federated / lake |
|---|---|---|---|
| Cost per GB | High | Mixed | Low |
| Real-time detection coverage | Everything indexed | Hot tier only | Streaming subset only |
| Search speed on "low-value" data | Seconds (if kept at all) | Minutes–hours | Minutes |
| Typical failure mode | Sources dropped for budget | Evidence in the blind tier | No one thinks to query it |

---

## 5. SOAR: automated response

**For execs:** SOAR runs pre-written playbooks so routine responses (disable account, block domain, open ticket) happen in seconds instead of hours.

A playbook is a fixed decision tree: *if alert type X with field Y, then do A, B, C.* SOAR is excellent when the situation matches the playbook exactly and brittle when it doesn't — and attackers rarely follow your playbook. Most SOCs automate the first few enrichment steps and leave the judgment to people.

---

## 6. The traditional SOC operating model

**For execs:** Humans are the integration layer. Alerts wait in a queue until a person has time, and that person stitches together five tools by hand.

```
Pipeline → SIEM rule fires → alert queue → Tier-1 analyst triages
        → escalate → Tier-2 investigates across tools → SOAR playbook / manual action
```

The constraints are human: queue wait time, minutes per alert, shift coverage, and **alert fatigue** — when most alerts are false positives, real ones get closed by mistake.

---

## 7. The Agentic SOC operating model

**For execs:** AI agents do the triage and investigation work that used to wait in a queue, across all your tools, and ask a human to approve consequential actions. Investigations take minutes instead of hours, and every alert gets looked at.

```
Pipeline → SIEM rule fires → agent triages immediately → agent investigates
        (queries SIEM, cold tier, lake, EDR, identity, email) → proposes response
        → human approves → action executes → agent writes the case report
```

What changes:

- **No queue.** Every alert is triaged on arrival, including the medium/low ones humans skip.
- **Breadth.** The agent can query every tier and tool without the friction that makes humans skip a step.
- **Consistency and documentation.** Every step, query, and piece of evidence is recorded.

What does **not** change:

- **Detection coverage.** Agents mostly start when something triggers them. If no rule fires, there is nothing to triage. An agent cannot move the first alert earlier than the data and detections allow.
- **Data reachability.** An agent querying a cold tier waits as long as a human would for that query — it just never forgets to ask.
- **Accountability.** Humans still own consequential actions and the outcome.

### So is it a panacea?

No. An agentic SOC compresses the **response** side (MTTR, analyst effort, scoping) dramatically. The **detection** side (MTTD) still depends on:

1. **Detection-aware routing** — don't send detection-relevant data to a tier no rule watches.
2. **Streaming detections or proactive hunting** over cheap/lake data. A hunting agent can do the latter, but on a schedule, not in real time.

### What can go wrong

| Risk | Example | Guardrail |
|---|---|---|
| Hallucinated conclusions | Agent asserts a lateral-movement path no log supports | Every claim must cite evidence; humans can click through |
| Overconfidence | Closes a true positive as benign | Confidence thresholds, sampling human review of closures |
| Prompt injection via logs | Attacker plants "ignore previous instructions" in a field the agent reads | Treat log content as data, constrain tools, approve actions |
| Runaway query cost | Agent scans the whole lake repeatedly | Per-investigation query budgets |
| Excess privilege | Agent can disable any account, including executives' | Scoped permissions, approval for high-impact actions |
| Weak audit trail | Can't reconstruct why an action was taken | Immutable step-by-step logs |

---

## 8. Inside the agent: architecture choices

**For execs:** Vendors describe "one agent" or "a team of named agents." That's one of several design choices, and not the most important one. Ask what it can do without approval, what data it can reach, and whether you can audit every step.

| Design choice | Options |
|---|---|
| **Structure** | One generalist agent with many tools · an orchestrator delegating to specialist agents (triage, investigation, malware analysis, detection engineering, hunting, response, reporting) |
| **Autonomy** | Copilot (human asks, AI answers) · Autonomous per alert with human approval for actions · Autonomous within policy |
| **Placement** | Built into a SIEM/XDR platform · Overlay across your existing tools via their APIs |
| **Trigger** | Reactive to alerts · Also proactive (hunting, detection tuning) |

### Generalist vs specialist team

| | Single generalist | Specialist team |
|---|---|---|
| Strengths | One continuous chain of reasoning; simpler audit trail | Tightly scoped permissions per role; parallel work; each role can be evaluated separately |
| Weaknesses | Broad permissions; one overloaded context; jack-of-all-trades | Context lost at handoffs; coordination overhead; harder end-to-end audit |

**Caveat:** the count of named agents is partly packaging. A "single agent" may use sub-agents internally; several "named agents" may be one model with different instructions. Judge by behavior, not branding.

### Built-in vs overlay

- **Built-in** agents get deep access to their own platform's data and actions, but are limited to what that platform holds.
- **Overlay** agents work across a mixed tool estate, but are bound by each tool's APIs, rate limits, and — importantly — each tool's data tiers. An overlay agent querying a tiered SIEM inherits that SIEM's blind spots and latencies.

---

## 9. Questions to ask a vendor

1. Which actions can the agent take **without** human approval? Can we configure that per action and per asset?
2. Which data can it reach, in which tiers, and how long does a cold-tier or lake query take?
3. Does it only react to alerts, or does it also hunt? On what schedule?
4. Does every conclusion cite the evidence behind it? Can we replay an investigation step by step?
5. How does it handle untrusted text inside logs (prompt injection)?
6. What controls cap query cost per investigation?
7. How do you measure its accuracy — false-closure rate on true positives specifically?
8. If it's an overlay: what happens when an underlying tool's API is slow, rate-limited, or down?
9. What happens to our routing and detection-engineering work — does the platform help decide what goes to which tier?

---

## Glossary

| Term | Meaning |
|---|---|
| **AiTM** | Adversary-in-the-middle phishing: a fake login page that relays to the real one and steals the session token, bypassing MFA |
| **BEC** | Business email compromise: using a hijacked mailbox to commit payment fraud |
| **Detection engineering** | Writing, testing, and tuning detection rules |
| **EDR** | Endpoint detection and response: agent software on laptops/servers |
| **IdP** | Identity provider: the system that handles sign-in and MFA |
| **MTTD / MTTR** | Mean time to detect / respond (contain) |
| **OCSF** | Open Cybersecurity Schema Framework: an open, vendor-neutral log schema |
| **Rehydration** | Restoring archived data into a searchable tier |
| **Schema-on-read** | Applying structure when querying, rather than at ingest |
| **SIEM** | Security information and event management: log search plus detection rules |
| **SOAR** | Security orchestration, automation and response: playbook automation |
| **Tier-1 / Tier-2** | First-line alert triage / deeper investigation analysts |
