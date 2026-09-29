# Product spec (v1)

## What Starfall is

A Genshin Impact companion that answers two questions better than anything else: **"Will I get the character I want?"** and **"Is this artifact worth my resin?"** It also keeps the daily timers in one place so it's worth opening every day.

**Who it's for (v1):** Finn and his friends. Installable on a phone, usable on a laptop. No accounts.

**What makes it different:** it answers in probabilities, not just counts. Other planners tell you that you'll have 108 pulls; Starfall tells you that's a 72.9% chance at Skirk and that 18 more pulls gets you to 90%.

## v1 features

### 1. Wish planner (Plan tab)

**Inputs:** target character, target date (defaults to the end of that character's banner), constellation goal (C0–C6), primogems, Intertwined Fates, current pity, guaranteed or not, Welkin days remaining, and income assumptions (editable in a sheet; see MATH.md §3).

**Outputs:**
- The chance of reaching the goal by the date, as the big answer.
- The Fate Dial curve (DESIGN.md).
- Chances for each constellation up to the goal (C0, C1, C2…).
- "Pulls for 50 / 75 / 90% odds" and how many more pulls or primogems that means.
- A projection of your primogem balance by date as a small line under the dial.

**Acceptance:**
- Changing any input updates results in under 50ms and replays the Fate Dial animation once.
- With 90 pulls, pity 0, guaranteed, C0: shows 100%.
- Plans save automatically and several can exist (e.g. "Skirk C1" and "Save for 7.2").

### 2. Keep-or-trash scorer (Artifacts tab)

**Inputs:** slot, main stat, level, 3–4 substats with values (manual entry in v1; pick from imported inventory in v2), goal (crit value threshold or a character's stat weights).

**Outputs:** the verdict and the chance of meeting the goal at +20, a histogram of final scores with the goal line, and a "Roll to +20" button that animates one sampled outcome.

**Acceptance:**
- Manual entry takes under 20 seconds on a phone (substat picker filters out the main stat and already-chosen stats).
- Results are deterministic for the same input (seeded RNG) so the number doesn't jitter.

### 3. Resin estimator (Artifacts tab, under the scorer)

**Inputs:** set, slot, main stat, goal (defaults to "as good as the piece above").
**Outputs:** median resin and days, 90th-percentile resin and days, and the per-run chance.

**Acceptance:** on-set ATK% sands with 30+ crit value lands near 15,000 resin at the median (MATH.md §4).

### 4. Timers (Timers tab)

Original Resin, Parametric Transformer, expeditions, realm currency, daily and weekly reset. Each timer is set by tapping it and entering the current value.

**Acceptance:**
- Values stay correct after closing and reopening the app hours later.
- With the app installed to the home screen, notifications fire for "resin full" and "transformer ready" (Phase 4; see ROADMAP).

### 5. Account tab

- UID import from Enka (showcased characters, used to prefill character goals and stat weights).
- Wish history import (fills pity and guarantee automatically; shows luck stats).
- GOOD inventory import (Phase 2).
- Backups: export and import everything as one JSON file.
- The fan-project notice.

## Out of scope for v1

Full damage calculator and build optimizer, team builder, ER requirement calculator, material planner, sharing and friend comparison, accounts and sync. All are in `docs/BACKLOG.md`.

## Assumptions to confirm with Finn

These were chosen so work could start; change them in `docs/DECISIONS.md` if they're wrong.

1. Installable web app (PWA) rather than a native app.
2. Built for Finn and friends first, not a public launch.
3. America server (daily reset at 04:00 UTC−5).
4. Name: Starfall (settled 2026-09-28; see docs/DECISIONS.md).
