# Scenario 3: The Alert Storm

**Purpose:** Show alert fatigue as what it mostly is, a capacity problem, and how AI agents change it.

**Exec one-liner:** A misconfigured scanner sets off 400 false alarms in two hours. Four analysts working in order can't get through them, so the one real alert waits for hours, and the payroll data is gone before anyone looks. AI agents look at every alert as it arrives, and the attacker is stopped 22 minutes after the first alert.

> **Source of truth:** the simulation engine with `scenarios/03-alert-storm.json`. Figures below are engine output with default assumptions.

## How the storm is modeled

- **The storm:** 400 alerts arrive evenly from 09:00 to 11:00.
- **Today's team:** works the queue first in, first out. 4 Tier-1 analysts × 1 alert per 10 minutes is about 24 alerts an hour. A medium alert waits until everything that arrived before it has been worked, or the normal queue wait, whichever is longer.
- **High-severity alerts jump the queue.** That's how today's team finally hears about this attack: from the download alert, after the data has gone.
- **The AI-assisted team:** an agent triages every alert as it arrives. It closes the scanner alerts with a reason, and a person spot-checks 5% of them (20 alerts, 1 minute each).
- **New settings:** "Tier-1 analysts on shift" and "Share of auto-closed alerts a person spot-checks".

## Attack

| Time | Event |
|---|---|
| 09:00–11:00 | Storm: 400 "repeated failed sign-in" alerts from the company's own scanner |
| 09:20 | Password spraying from one overseas address against 300 accounts |
| 09:41 | One guess works: the attacker signs in as Lee Chen (HR), from abroad |
| 10:30 | The attacker browses the HR file share |
| 13:30 | **Objective:** payroll data for 5,000 employees downloaded |

Detection: "Successful sign-in after many failures, from a new country" (medium) fires at 09:42 and looks like the storm. "Large download from the HR share" (high) fires at 13:31.

## Results (engine output)

| | Today's team | AI-assisted team |
|---|---|---|
| First alert | 09:42 | 09:42 |
| Original alert picked up | 14:50 (after 5 h 8 min in the queue) | 09:44 |
| Attacker stopped | 15:08 | 10:04 |
| Payroll data stolen | **Yes** | No |
| Analyst time | about 34 hours (mostly the storm) | 30 min |

## Fairness notes

- Many tools group duplicate alerts. These come from 400 different servers and look slightly different, so they don't collapse into one.
- A team could spot the scanner and bulk-close the storm. The real alert comes from a different but similar-looking check, so a quick bulk-close could have closed it too.
