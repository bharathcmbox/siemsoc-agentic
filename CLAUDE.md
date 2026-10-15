# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

A personal study project: an **Agentic SOC simulator** that shows executives and business leaders how an AI-assisted security team differs from today's, and how ingestion pipelines, SIEM, and SOAR fit together. `docs/PLAN.md` is the source of truth for scope and phases.

All five planned phases are built and live at **https://bharathcmbox.github.io/siemsoc-agentic/** (GitHub Pages, deployed from `main`, root folder).

- **Executive view (default):** six stories → race view → plain-language caption, scoreboard, verdict.
  - **Race view, top to bottom:** the story's question and intro; "ways to watch this story" cards when it has more than one comparison; the race box (play controls, the two lanes on one clock with an amber "Attack begins" flag, legend, caption).
- **Deeper views on every story:**
  - **Where they appear:** cards under the race, plus caption links at the moments they explain.
  - **Inside the agent:** the AI team's steps as one agent or a team of specialists.
  - **Inside the pipeline:** one log line through parse, normalize, enrich, reduce and route.
- **What AI agents can get wrong:** a "Before you trust an AI agent" band on the home screen, a Risks screen (`#risks`, or `#risks/<group>` to jump to a group), and the prompt-injection deep dive (`#risks/injection`). Each story's verdict has a "What could go wrong here" section, the race has amber caption links to it, and "Inside the agent" marks steps that read untrusted text. Opened from a story, the risk screens offer "Back to the story". All wording comes from `docs/ai-risks.md`.
- **Analyst view (behind a switch):** side-by-side configuration, timelines, architecture diagram, pipeline walk-through, assumption sliders. Shares state with the executive view.

## Layout

- `index.html`: the single-page app, with four screens: home (story picker), exec (race view), analyst (detailed view), risks (what AI agents can get wrong)
- `css/theme.css`: palette tokens for both themes (dark default), the bundled font, page basics
- `css/exec.css`, `css/analyst.css`, `css/risks.css`: styles for each view
- `js/main.js`: app controller, with shared state, playback, presets, view switch, theme toggle, and the URL hash
- `js/stories.js`: the six executive stories, their comparisons, and plain-language team names (`title`, `sub`, `ref`). When a story has more than one comparison, each needs a `chapter` (a short question) and a `teaser` (one line); the race view shows them as numbered "ways to watch this story" cards
- `js/engine/simulate.js`: discrete-event simulation of one SOC configuration against a scenario
- `js/engine/cost.js`: routing, budget cap, and monthly cost
- `js/engine/assumptions.js`: every slider parameter, mirrored in `docs/assumptions.md`
- `js/ui/`:
  - `exec.js`: home, race view, "ways to watch" cards, explore cards, caption links, scoreboard, verdict, glossary
  - `narrator.js`: comparative "beats" built from both results. A beat can carry `links` (`{ kind: 'agent' | 'pipeline', side, label }`, or `{ kind: 'risk', topic, label }`), which the race view shows as caption links. Each moment is tagged (`begin`, `storm`, `blind`, `alert`, `triage`, `approval`, `rootcause`, …); a scenario risk's `at` picks the first matching moment that involves an AI-assisted side
  - `risks.js`: the home band, the Risks screen and the injection deep dive, with their wording. Keep it in step with `docs/ai-risks.md`
  - `agent-view.js`: "Inside the agent", showing one agent or a team of specialists, with "Reads untrusted text" on steps that read attacker-writable data
  - `panel.js`, `diagram.js`, `pipeline.js`, `summary.js`, `params.js`, `routing-info.js`: analyst view pieces
- `scenarios/*.json`: scenario data
  - **Always present:** attacker events, detection rules (each with a `plain` name), `labels` (all scenario-specific wording), variants, and `pipelineDemo` (the event "Inside the pipeline" walks through)
  - **Optional:** `paramOverrides`, `defaultPreset`, `noise` (an alert storm), `hunt` (the scheduled sweep), and per-rule `autoContain`
  - **AI risks:** `risks`, the verdict's "What could go wrong here" items (`group`, `ref`, `title`, `text`, `guard`, and optionally `at` and `cue` for a caption link). A variant can carry its own `risks`. Keep them in step with the per-story section of `docs/ai-risks.md`
- `scenarios/index.json`: the scenario list for the analyst view's dropdown
- `vendor/fonts/`: the Figtree woff2 font and its SIL Open Font License
- `docs/`:
  - `primer.md`: concepts
  - `assumptions.md`: every number; §9 lists sources
  - `ai-risks.md`: the source for all wording about AI risks and guardrails, with sources
  - `scenarios/*.md`: one per scenario, with results tables
- `tests/` (dev only, needs Node):
  - `node tests/run-all.mjs`: metrics for every scenario × configuration
  - `node tests/run-all.mjs --timeline <scenarioId> <variant> <arch> <model> <on|off>`: one timeline
  - `node tests/narrate.mjs <scenarioId> <variant> <arch-model-0|1> <arch-model-0|1>`: the narration for one comparison

## Workflow

- Work on a branch, open a PR to `main`, and merge. Pages redeploys from `main` within a minute or two.
- Before committing an engine change, save `node tests/run-all.mjs` output from before and after, and diff it. Results for untouched scenarios must not change.
- Check UI changes in a browser at desktop and phone width (about 390px), in dark and light, with no console errors and no sideways scrolling.
- If engine output changes, update the results tables in `docs/scenarios/*.md` to match.
- In scripted multi-file edits, build each file's new text in full before opening it for writing, and check `git diff --stat` afterwards. A script that fails after opening a file empties it.
- `gh pr edit` fails on this repo (a GitHub "Projects (classic)" deprecation error). Change a PR's base with `gh api -X PATCH repos/bharathcmbox/siemsoc-agentic/pulls/<n> -f base=main`.

## Adding a scenario

1. Write `scenarios/<id>.json`, including the full `labels` set (copy the keys from an existing scenario), a `plain` name for every rule, a `pipelineDemo` for the attacker's key event, and a `risks` list (also added to `docs/ai-risks.md`).
2. Add it to `scenarios/index.json`.
3. Add a story to `js/stories.js` with team names. If it has more than one comparison, give each a `chapter` and a `teaser`.
4. Write `docs/scenarios/<id>.md` with engine-output results.
5. Update the README in two places: the story's direct link (`#story=<storyId>`) under "Stories", and the write-up under "Scenario write-ups".

## Constraints

- **No build step, no install.** Plain HTML, CSS, and JavaScript (ES modules), served as-is. No npm, bundler, or framework. Any third-party file goes into `vendor/` as a pinned copy.
- **Local preview:** `python3 -m http.server` from the repo root. Opening `index.html` from disk won't work.
- **Vendor neutral:** the app describes architecture patterns and capabilities, never products or companies. Naming providers is fine only in `docs/assumptions.md` §9, as price sources.
- **Plain language in the executive view:** no rule IDs, tier names, or acronyms. The narrator uses rules' and sources' `plain` names and the teams' `ref` names. Technical terms stay in the analyst view.
- **Fair comparisons:** don't give the agentic side capabilities ordinary automation already has. Scheduled sweeps and automatic isolation are available to both teams. Credit the agent only for what it changes: no queue, immediate triage, and investigating across every system and storage tier.
- **Numbers:** every figure shown in the app comes from a parameter in `docs/assumptions.md`, labelled Illustrative unless it's sourced in §9. Keep `js/engine/assumptions.js` and the doc in sync.
- **Theme:** dark by default with a light option. Every color is a token in `css/theme.css`.
- **Fictional data:** use `.example` domains and RFC 5737 documentation IP ranges.
- **Keep the axes separate:** data architecture and operating model are independent settings. Agent design belongs in "Inside the agent", not as a third setting.
