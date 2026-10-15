# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

A personal study project building an **Agentic SOC simulator**: an interactive web app that shows executives and other readers how an Agentic SOC differs from a traditional one, and how ingestion pipelines, SIEM, and SOAR fit together. `docs/PLAN.md` is the source of truth for scope and phases.

Current phase: **Phase 5 built** (alert storm, ransomware at 2 a.m., "Inside the agent"). All planned phases are done.

## Layout

- `docs/PLAN.md` — approved plan (scope, phases, tech approach)
- `docs/primer.md` — vendor-neutral concepts primer the app's explanations draw from
- `docs/assumptions.md` — every parameter behind the simulator's metrics and costs
- `docs/scenarios/*.md` — scenario scripts (design input; the engine is the source of truth for timings)
- `index.html` — the single-page app: home (story picker), exec (race view), and analyst (detailed view) screens
- `css/theme.css` (palette tokens for both themes, dark default, bundled font), `css/exec.css` (executive view), `css/analyst.css` (analyst view)
- `js/stories.js` — the four executive stories, their comparisons, and plain-language team names
- `js/ui/exec.js` — home screen, race view, scoreboard, verdict, glossary
- `js/ui/agent-view.js` — "Inside the agent": the agentic side's steps as one agent or a team of specialists
- `vendor/fonts/` — Figtree woff2 and its SIL Open Font License
- `js/engine/` — `simulate.js` (discrete-event simulation of one SOC configuration), `cost.js` (routing + monthly cost), `assumptions.js` (every parameter, mirrored in `docs/assumptions.md`)
- `js/ui/` — side panel, architecture diagram (`diagram.js`), pipeline walk-through dialog (`pipeline.js`), narrator (comparative beats built from both results), executive summary, assumption sliders, routing info dialog; `js/main.js` wires state, playback, presets, and the shareable URL hash
- `scenarios/*.json` — scenario data: attacker events, detection rules, variants, `labels` (all scenario-specific wording the engine and UI use), optional `paramOverrides`, `defaultPreset`, `pipelineDemo`, `noise` (an alert storm), and per-rule `autoContain`
- `tests/run-all.mjs` — dev-only check (needs Node): `node tests/run-all.mjs` prints metrics for every scenario × configuration; `node tests/run-all.mjs --timeline <scenarioId> <variant> <arch> <model> <on|off>` prints one timeline; `node tests/narrate.mjs <scenarioId> <variant> <arch-model-0|1> <arch-model-0|1>` prints the narrator beats for one comparison

## Constraints

- **No build step, no install.** Plain HTML, CSS, and JavaScript (ES modules), served directly by GitHub Pages from `main`. No npm, bundler, or framework. Any third-party library goes into `/vendor/` as a pinned copy.
- **Local preview:** `python3 -m http.server` from the repo root. Opening `index.html` from disk won't work.
- **Vendor neutral:** describe architecture patterns and capability categories, never products or companies.
- **Plain language in the executive view:** no rule IDs, tier names, or acronyms. Rules carry a `plain` name and sources a `plain` name for the narrator; technical terms stay in the analyst view.
- **Theme:** dark by default with a light option; every color is a token in `css/theme.css`.
- **Numbers:** every figure shown in the app must come from a parameter in `docs/assumptions.md`. Label it Illustrative unless a public source has been verified.
- **Fictional data:** use `.example` domains and RFC 5737 documentation IP ranges.
- **Keep the axes separate:** data architecture and operating model are independent selectors. Agent design belongs in the "Inside the agent" view, not as a third selector.
