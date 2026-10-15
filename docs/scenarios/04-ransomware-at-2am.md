# Scenario 4: Ransomware at 2 a.m.

**Purpose:** Show why attackers choose nights and weekends, and what changes when the first responder doesn't sleep.

**Exec one-liner:** Late on a Friday night, an attacker gets in with a contractor's stolen password. Today's on-call setup notices too slowly; automatic isolation stops the ransomware, but only two minutes after encryption starts and after the backups are deleted. The AI-assisted team has the attacker cut off by 2:03 a.m., before the file servers are touched.

> **Source of truth:** the simulation engine with `scenarios/04-ransomware-at-2am.json`. Figures below are engine output with default assumptions.

## Setup

- **Off hours:** queue waits are 4× longer (one on-call analyst), and approvals take 30 minutes (someone has to wake up).
- **Today's team also has automatic isolation.** Many endpoint security tools isolate machines on their own when they see ransomware-style mass file changes, so the simulator gives today's team that too. New engine feature: a detection rule can carry `autoContain`.

## Attack

| Time | Event | Detection |
|---|---|---|
| 01:20 | VPN sign-in with a contractor's stolen password; connects to a jump server | "VPN sign-in from a new country" (medium) at 01:21 |
| 01:35 | Password-stealing tool on the jump server | "Password-stealing tool detected" (high) at 01:36 |
| 02:15 | Signs in to 14 file servers with a stolen admin password | — |
| 02:40 | Backups deleted | — |
| 03:00 | **Objective:** encryption starts | "Mass file renaming" (high, automatic isolation) at 03:01 |

## Results (engine output)

| | Today's team | AI-assisted team |
|---|---|---|
| First alert | 01:21 | 01:21 |
| Picked up | 02:56 (the high-severity alert, after 1 h 20 min) | 01:23 |
| Attacker stopped | 03:02, by automatic isolation | 02:03, after on-call approval |
| Backups deleted / encryption started | **Yes / Yes** | No / No |
| Analyst time | 110 min | 10 min |

## What it shows

- The AI agent's advantage grows off hours, because the queue is where the time goes.
- Automatic isolation is valuable, but it reacts to the damage itself. It can't act on the earlier warning signs.
- The agent still waits for a person to approve. The 30-minute overnight approval is most of its response time, so faster on-call approval, or pre-approved actions for clear cases, would matter more than a faster agent.
