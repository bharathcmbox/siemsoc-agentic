# siemsoc-agentic

A personal study project covering SIEM (Security Information and Event Management) and SOC (Security Operations Center) concepts.

## Agentic SOC simulator

**[Open the simulator](https://bharathcmbox.github.io/siemsoc-agentic/)**

An interactive, vendor-neutral simulator for executives and business leaders. Pick a story, then watch today's security team and an AI-assisted team handle the same attack on one clock, with a plain-language caption, a scoreboard, and a verdict.

### Stories

Each link opens the story directly in the simulator.

Every story also has two deeper views, shown as cards under the race and linked from the caption at the moments they explain:

- **Inside the agent:** how the AI team worked the case, as one agent or as a team of specialists, with who is allowed to do what.
- **Inside the pipeline:** how one log line is parsed, cleaned up, enriched, and routed, and where each team's data is stored.

1. [What happens when a finance employee clicks a phishing link?](https://bharathcmbox.github.io/siemsoc-agentic/#story=phishing), including [what if the attacker targets the agent?](https://bharathcmbox.github.io/siemsoc-agentic/#story=phishing&cmp=attack-agent)
2. [Cheaper log storage: what do you give up?](https://bharathcmbox.github.io/siemsoc-agentic/#story=storage)
3. [What if the attacker never trips an alarm?](https://bharathcmbox.github.io/siemsoc-agentic/#story=quiet)
4. [Can your team find one real attack in 400 false alarms?](https://bharathcmbox.github.io/siemsoc-agentic/#story=storm)
5. [Ransomware at 2 a.m.: who is awake?](https://bharathcmbox.github.io/siemsoc-agentic/#story=ransomware)
6. [Same budget, smarter design?](https://bharathcmbox.github.io/siemsoc-agentic/#story=budget)

### What AI agents can get wrong

A neutral guide to the risks of AI agents in a security team, and the guardrails that catch them: bad judgment, misaligned goals, too much power, runaway resources, and manipulation.

- [What AI agents can get wrong](https://bharathcmbox.github.io/siemsoc-agentic/#risks)
- [When the logs talk back](https://bharathcmbox.github.io/siemsoc-agentic/#risks/injection): how attackers can trick an AI agent through the logs it reads, and what stops it

Each story's verdict also lists what could go wrong with the AI-assisted team in that story, with the guardrail for each, and the race offers amber links at the moments where those risks apply.

### Analyst view

The **Analyst view** switch opens the detailed comparison, where you set each side yourself:

- **Data architecture:** index-at-ingest, tiered, or federated / data lake
- **Operating model:** traditional (human analysts + SOAR playbooks) or agentic (AI agents + human approval)
- **Smart routing (detection-aware routing):** on or off. When on, it promotes suspicious events from cheap storage into real-time detection

Each side shows an architecture diagram for its settings, with buttons for both deeper views.

The URL updates as you change settings, so you can share a link to a specific comparison.

### Run it locally

Nothing to install. The app is plain HTML, CSS and JavaScript, published by GitHub Pages from `main`.

To run it on your own machine, run `python3 -m http.server` in this folder and open http://localhost:8000. Opening `index.html` directly from disk won't work, because browsers block loading the scenario files that way.

### Read more

- [Plan](docs/PLAN.md)
- [Primer: from traditional SOC to agentic SOC](docs/primer.md)
- [Metrics and cost assumptions](docs/assumptions.md)
- [What AI agents can get wrong](docs/ai-risks.md)
- Scenario write-ups:
  1. [Phishing to BEC](docs/scenarios/01-phishing-to-bec.md)
  2. [Where did the evidence go?](docs/scenarios/02-where-did-the-evidence-go.md) (includes the quiet-attacker variant)
  3. [The alert storm](docs/scenarios/03-alert-storm.md)
  4. [Ransomware at 2 a.m.](docs/scenarios/04-ransomware-at-2am.md)
  5. [The budget and the noisy source](docs/scenarios/05-budget-and-the-noisy-source.md)

All companies, people, domains and numbers are fictional or illustrative.
