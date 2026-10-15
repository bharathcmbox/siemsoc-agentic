# siemsoc-agentic

A personal study project covering SIEM (Security Information and Event Management) and SOC (Security Operations Center) concepts.

## Agentic SOC simulator

An interactive, vendor-neutral simulator that runs the same attack through two security operations setups side by side. On each side, you choose:

- **Data architecture:** index-at-ingest, tiered, or federated / data lake
- **Operating model:** traditional (human analysts + SOAR playbooks) or agentic (AI agents + human approval)
- **Detection-aware routing:** on or off. When on, it promotes suspicious events from cheap storage into real-time detection

Each side shows an architecture diagram for its settings, and "Inside the pipeline" follows one real event through parsing, normalization, enrichment, reduction, and routing.

### Run it

Nothing to install. The app is plain HTML, CSS and JavaScript.

- **On GitHub Pages:** in the repo's Settings → Pages, choose *Deploy from a branch*, then `main` / `(root)`. The simulator will be at `https://bharathcmbox.github.io/siemsoc-agentic/`.
- **Locally (optional):** run `python3 -m http.server` in this folder and open http://localhost:8000. Opening `index.html` directly from disk won't work, because browsers block loading the scenario files that way.

The URL updates as you change settings, so you can share a link to a specific comparison.

### Read more

- [Plan](docs/PLAN.md)
- [Primer: from traditional SOC to agentic SOC](docs/primer.md)
- [Metrics and cost assumptions](docs/assumptions.md)
- Scenarios: [1 — Phishing to BEC](docs/scenarios/01-phishing-to-bec.md) · [2 — Where did the evidence go?](docs/scenarios/02-where-did-the-evidence-go.md) · [5 — The budget and the noisy source](docs/scenarios/05-budget-and-the-noisy-source.md)

All companies, people, domains and numbers are fictional or illustrative.
