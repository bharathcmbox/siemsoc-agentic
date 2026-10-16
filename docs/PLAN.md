# Agentic SOC Simulator — Plan

Status: approved (rev 7). Phases 1–5 built. Phase 4 redesigned the app for executives; the original detailed view lives behind the "Analyst view" switch.

## 1. Goal and audience

Show non-specialists, in about 10 minutes, how an Agentic SOC differs from a traditional SOC, and how ingestion-time data handling, SIEM, and SOAR fit together in each model.

- **Executives** want outcomes: time to detect and respond, analyst hours, cost, and risk. They get a short, guided path.
- **Practitioners and curious readers** want the mechanics: what happens at ingestion, in the SIEM and in SOAR, and what the agent actually decides. They get a "show me the details" path.

**Core message:** a SOC makes separate design choices that vendors often blur together:

1. **Data architecture: where data lives and how it gets searched.** Data can be indexed at ingest, split across tiers, or queried in place in a data lake.
2. **Operating model: who does the triage, investigation and response work.** That's either human analysts using playbooks or AI agents with human approval steps.
3. **Agent design (inside the agentic model): how the AI is put together.** It can be one generalist agent or a team of specialist agents. It can act as a copilot or work autonomously, be built into a platform or sit on top of existing tools, and react to alerts or also hunt proactively.

**Main point for executives:** an agentic SOC greatly reduces the human effort in each investigation, but it **doesn't add detection coverage you never had**. An agent can only reason over data it can reach, once something prompts it to look. It works best paired with routing at ingest that takes detections into account, plus either streaming detections or proactive hunting.

## 2. Core experience: one incident, compared side by side

The screen is split, with a shared timeline. Each side is set with two selectors:

| Selector | Options |
|---|---|
| **Data architecture** | Index-at-ingest · Tiered (hot + cheap) · Federated / data lake |
| **Operating model** | Traditional (human + SOAR playbooks) · Agentic (AI agents + human approval) |
| **Detection-aware routing** (toggle) | Off · On. Applies to Tiered and Federated / lake. Under Index-at-ingest it's disabled, with a note that everything is already hot |

The left and right sides can use any combination. The guided tour uses preset comparisons (see §6).

Agent design is deliberately **not** a third selector on the split screen. Its place is the "Inside the agent" view (§5).

Stage by stage:

| Stage | Traditional | Agentic |
|---|---|---|
| **Ingestion** | The data architecture sets what happens here: index everything, route data to tiers, or land it in the lake. | Same architecture choices. The agent doesn't change ingestion. |
| **Detection** | Static correlation rules, which only run on data they can see in real time. | The same rules run, and the agent groups related signals into a single case. (Scheduled sweeps of cold data are an automated job available to both models; the agent handles their hits faster.) |
| **Triage** | The alert waits in a queue, then gets checked by hand. | Immediate automated triage, enrichment and scoring. |
| **Investigation** | An analyst pivots across tools by hand. | The agent queries the tools itself, across all data tiers, and cites its evidence. |
| **Response** | A fixed playbook runs if the alert matches it. Otherwise the work is manual. | The agent adapts the response and **asks for human approval** before high-impact actions. |
| **Reporting** | Written up by hand. | The agent drafts a summary, a MITRE mapping, and a timeline. |

Running counters on both sides: time elapsed, alerts in the queue, analyst minutes spent, GB ingested and its cost, storage cost, detection coverage, time to find the evidence, and whether the attack was contained.

## 3. Data architecture models

These describe architecture patterns, not specific vendors.

| Model | How it works | Strengths | Trade-offs |
|---|---|---|---|
| **Index-at-ingest** (classic) | Every event is parsed and indexed in hot storage as it arrives. | Fast search over everything; every detection rule can see every log. | Cost grows with volume, so teams drop log sources to stay in budget, which creates blind spots. |
| **Tiered** | A pipeline routes high-value data to the hot indexed tier and the rest to a cheap tier with limited search, archive, or rehydrate-on-demand. | Much lower cost; keeps data you'd otherwise drop. | Real-time detection rules usually can't see the cheap tier. Searching it is slower, limited, or billed per query, and rehydrating it can take minutes to hours. |
| **Federated / data lake** | Data lands in open-format object storage and is queried where it sits (schema-on-read). The SIEM indexes only a subset, or none of it. | Cheapest storage, long retention, one copy of the data shared with other teams. | Query speed depends on the data layout. Real-time detection needs a separate streaming path. Normalization moves to query time. |

How this connects to ingestion: in the tiered and lake models, the **pipeline's routing rules become security decisions**. A log marked "low value" at ingest is a log that detection rules will never see in real time.

### Detection-aware routing (toggle)

When this is on, the pipeline enriches each event as it arrives (for example, it looks up how old a domain is). Events from "low-value" sources that match a short list of high-value patterns get **promoted**: a copy goes to the hot tier, where real-time rules can see it. Everything else from those sources still goes to cheap storage or the lake.

- **What it buys:** the real-time detections you anticipated work again, for a tiny share of the volume.
- **What it costs:** a small amount of hot-tier volume. You also take on keeping the pattern list current, and the pipeline now depends on its enrichment lookups working.
- **What it doesn't fix:** patterns nobody anticipated. That's still the job of hunting (by agents or people).

**How the UI explains it.** The toggle never appears as a bare switch:

1. **A one-line label next to the switch:** "Promote suspicious events from cheap storage to real-time detection."
2. **An info panel that opens on first use (and from an ⓘ button):**
   - a three-step mini diagram (event arrives → enrichment checks it against the patterns → promoted to hot, or sent to cheap storage)
   - the current pattern list in plain English
   - three short lists: what it buys, what it costs, what it doesn't fix
3. **Visible effects when it's flipped:**
   - the promoted events animate across the architecture diagram
   - the cost counter moves (only slightly)
   - detection coverage changes
   - previously blind rules light up on the timeline with a "promoted" badge
4. **A guided tour preset, "Tiered agentic, routing off vs on":** the same architecture and operating model on both sides, with only the toggle different.

## 4. Scenarios

All scenarios are deterministic, scripted JSON files. There are no live LLM calls. The full scripts are in `docs/scenarios/`.

1. **Phishing → session token theft → impossible-travel sign-in → mailbox forwarding rule → payment fraud attempt.** This is the flagship scenario. It runs with any architecture and either operating model.
2. **"Where did the evidence go?" (data architecture comparison).** This is the same attack, but the attacker uses a residential proxy near the victim, so the impossible-travel alert doesn't fire. The strongest early evidence (DNS/proxy hits to a newly registered lookalike domain) is high-volume and was routed to the cheap tier as "low value":
   - **Index-at-ingest:** a real-time rule catches the phishing click within minutes. The cost meter shows what that coverage costs every month.
   - **Tiered:** only a medium-severity "new forwarding rule" alert fires, about 90 minutes later. Investigation stalls until someone searches the cold tier and waits for it.
   - **Federated / lake:** searching in place finds the evidence in minutes once someone looks. There's still no real-time alert.
   - **Agentic on tiered or lake:** the agent picks up the medium alert right away and searches the cold tier without being asked. It finds the phishing click and **two other users who clicked the same link**. A per-investigation query budget acts as a guardrail.
   - **Quiet-attacker variant:** if the attacker never creates the forwarding rule, nothing fires in real time on tiered or lake. A nightly scheduled sweep of cold data (an ordinary automated job, available to both teams) is the first detection, about 17 hours later. Today's team contains it at 04:38 after the overnight queue; the agentic team at 02:43. Both are too late to stop the fraud request or the second compromise.
   - **Takeaway:** the agent shortens the time from alert to containment and widens the scope of what gets found. It **can't move the first alert earlier**, though. Only routing and detection engineering can do that, and a scheduled sweep can only partly make up for it, hours later.
   - **With detection-aware routing on:** newly-registered-domain hits get promoted to the hot tier, so the early alert fires at 09:14 on tiered and lake too. That adds only about $31 a month in hot-tier cost. Combined with the agentic model, this gives the best outcome at close to the cheapest cost.
3. **Alert storm:** one real threat hidden in 400 false alarms from a misconfigured scanner. See `docs/scenarios/03-alert-storm.md`.
4. **Ransomware at 2 a.m.:** stolen contractor password, password theft, lateral movement, backups deleted, encryption, all off hours. See `docs/scenarios/04-ransomware-at-2am.md`.
5. **The budget and the noisy source (ingestion cost):** under a monthly SIEM budget cap, index-at-ingest has to stop collecting firewall and DNS logs; tiered storage keeps them, and routing makes them useful in real time. The attack is malware calling home to a known C2 server, then source-code theft. See `docs/scenarios/05-budget-and-the-noisy-source.md`.

## 5. Agent architecture: the "Inside the agent" view

This is a drill-down from any Agentic side of the split screen. It explains agent design as **design choices**, never as products.

| Design choice | Options |
|---|---|
| **Agent structure** | One generalist agent with many tools · An orchestrator handing work to specialist agents (triage, investigation, malware analysis, detection engineering, hunting, response, reporting) |
| **Autonomy** | Copilot (a person asks, the AI answers) · Autonomous on each alert, with human approval for actions · Autonomous within policy |
| **Placement** | Built into a SIEM/XDR platform · An overlay that sits across your existing tools through their APIs |
| **Trigger** | Reacts to alerts · Also works proactively (hunting, detection tuning) |

The view works like this:

- A toggle switches between **single generalist** and **specialist team**. The same incident plays out either as one reasoning loop or as swimlanes of specialist agents handing work to each other. Each step shows the tools it called, the permissions it used, the data tier it queried and what that cost, approval points, and audit entries.
- **The outcome metrics stay nearly identical between the two.** This is deliberate. Structure changes how the work is governed and audited, not what gets caught.
- Trade-offs it calls out:
  - **Specialist team:** each agent can have tightly limited permissions, agents can work in parallel, and each role can be tested on its own. The downsides are context lost at handoffs, coordination overhead, and an audit trail that's harder to follow end to end.
  - **Single agent:** one continuous line of reasoning and a simpler audit trail. The downsides are broad permissions, one overloaded context, and a generalist that's average across tasks.
- **A caveat to state explicitly:** the number of named agents is partly packaging. A "single agent" can use sub-agents internally, and several "named agents" can be one model running with different instructions.

## 6. Explainer layers

- **Narrator** (built in the MVP): at each key moment, one or two sentences comparing what each side is doing, generated from the two simulation results. Playback can pause at each moment so a presenter can talk over it.
- **Guided tour** with captions at key moments, including preset comparisons: "Classic vs Tiered (human SOC)", "Tiered human vs Tiered agentic", "Tiered agentic, routing off vs on", and "Classic human vs Lake agentic + routing".
- **Architecture view:** an animated data flow through pipeline → tiers/lake → SIEM detection → SOAR → agents → human. Clicking a component explains what it does.
- **Inside the agent** (§5).
- **The honest section:** what the agent can get wrong (hallucinated conclusions, overconfidence, prompt injection through log content, runaway query costs, gaps in the audit trail) and the guardrails against it.
- **Executive summary card:** MTTD, MTTR, analyst hours, ingest and storage cost, and detection coverage, using illustrative assumptions viewers can adjust with sliders.
- **"Questions to ask a vendor" card:** a vendor-neutral checklist built from §3 and §5, which is the practical thing executives take away.

## 7. Content defaults

- **Vendor neutral:** use capability categories and architecture patterns only, with no vendor appendix.
- **Logs:** plain-English summaries by default, with an expandable "raw log" view. Raw logs use field names loosely modeled on OCSF, an open, vendor-neutral schema.
- **Metrics:** illustrative numbers that viewers can adjust, citing public surveys where they exist. All assumptions are documented in `docs/assumptions.md`.

## 8. Tech approach: runs straight from GitHub

- **Hosting:** GitHub Pages, set to deploy from branch `main`, at `https://<user>.github.io/siemsoc-agentic/`. No install, build step, or GitHub Actions needed.
- **Code:** plain HTML, CSS and JavaScript (ES modules). No framework, bundler, or `package.json`.
- **Third-party libraries:** pinned copies stored in `/vendor/` if needed, so nothing depends on a CDN at runtime.
- **Data:** scenarios are JSON files.
- **Visuals:** SVG and CSS animation, supporting light and dark themes.
- **Local preview (optional):** run `python3 -m http.server` in the repo folder. Opening `index.html` directly from disk won't work, because browsers block modules and JSON loading from local files.
- **Note:** GitHub Pages on a private repo requires a paid GitHub plan.
- **Dropped:** live LLM mode. It would need an API key and a server, which goes against the "nothing to install" requirement.

```
index.html            entry point
/css/                 styles, themes
/js/engine/           replay engine, metrics + cost model, data-tier model
/js/ui/               split view, selectors, timeline, architecture diagram, agent views, exec summary
/scenarios/*.json     scenario definitions + sample events
/vendor/              pinned third-party libs, if any
/docs/                PLAN.md, primer.md, assumptions.md, scenarios/
```

## 9. Phases

1. **Concepts and assumptions:** the primer (SIEM, SOAR, pipelines, data architectures, agentic SOC, agent design), the metrics and cost model, scenarios 1 and 2 scripted on paper.
2. **MVP:** the engine with both selectors and the detection-aware routing toggle (including its info panel), the split view and timeline, a narrator that explains each key moment and how the two sides differ (with optional pause at each moment), scenarios 1 and 2 (including the scheduled sweep), and the executive summary card. *Review checkpoint.*
3. **Ingestion and architecture views:** a per-side architecture diagram (animated, click to explain), an "Inside the pipeline" walk-through of one real event (parse, normalize, enrich, reduce, route) with daily volume bars, a SIEM budget cap that drops low-value sources, and scenario 5. *Built.*
4. **Executive redesign:** *Built.* Agreed through a clickable mockup first.
   - **Home:** four stories phrased as business questions (phishing, cheaper storage, the quiet attacker, the budget), in a 2×2 grid.
   - **Race view:** both teams on one clock, with status colors (unnoticed, spotted but active, stopped) and markers for spotted, stopped and attacker succeeds.
   - **Caption:** the narrator rewritten in plain language, naming the teams ("today's team", "the AI-assisted team"); optional pause at each moment; arrow keys step through it.
   - **Scoreboard:** time to spot the attack, time to stop the attacker, did the attacker succeed, analyst time and data cost.
   - **Verdict:** plain takeaways, "What AI agents can get wrong" with guardrails, questions to ask a vendor, and a copyable link.
   - **Analyst view switch:** the Phase 2–3 detailed view, sharing the same state, so any custom comparison also plays in the executive view.
   - **Look:** dark by default with a light option; a calm neutral palette; the Figtree font bundled in `vendor/fonts` (SIL Open Font License); a glossary of plain definitions.
5. **Depth:** *Built.*
   - **Scenario 3, the alert storm:** 400 false alarms against a fixed number of analysts working in order; the agent triages every alert as it arrives, with spot-checks. See `docs/scenarios/03-alert-storm.md`.
   - **Scenario 4, ransomware at 2 a.m.:** off-hours queue and approvals; today's team also gets automatic isolation on mass file changes. See `docs/scenarios/04-ransomware-at-2am.md`.
   - **"Inside the agent":** the agentic side's real steps shown as one generalist agent or a team of specialists (triage, investigation, response, reporting) with orchestrator handoffs, permissions, and a numbered record. Opened from the verdict or the Analyst view.
   - **Engine:** every alert queues on its own (the first one picked up starts the case); alert-storm capacity model; rules can trigger automatic isolation.
   - **Six stories** on the home screen.
6. **What AI agents can get wrong:** *Built.* All wording lives in `docs/ai-risks.md`, reviewed before any UI work. The stance is neutral, with today's-team equivalents where they exist.
   - **6a, content:** five risk groups (bad judgment, misaligned goals, too much power, runaway resources, manipulation) plus accountability and "when the guardrails get it wrong", each as what goes wrong / what it looks like / the guardrail / a vendor question; a prompt-injection deep dive; per-story risks.
   - **6b, main page:** *Built.* a "Before you trust an AI agent" band on the home screen; a Risks screen (`#risks`); the injection deep dive as its own screen (`#risks/injection`) that reuses the pipeline walk-through.
   - **6c, stories:** *Built.* a "What could go wrong here" section in each verdict (from a `risks` list in each scenario file), caption links at the relevant moments, and "reads untrusted text" badges in "Inside the agent". No engine numbers change.
   - **6d, playable:** *Built.* "What if the attacker targets the agent?" as a way to watch the phishing story: the same AI-assisted team without and with the harness. Needs engine support for the injected event and the harness checks.
