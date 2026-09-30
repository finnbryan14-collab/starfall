# Math and game models

Everything in this file becomes pure TypeScript in `src/engine/` with Vitest tests. No React, no DOM, no network. Models that depend on numbers HoYoverse doesn't publish are marked **community-derived**; keep them behind a small interface so they can be swapped when better data appears.

A working JavaScript prototype of these models is embedded in `design/preview.html` (search for `ENGINE`). Port it; don't reinvent it.

---

## 1. Character event banner

### Per-pull 5★ chance (community-derived)

HoYoverse publishes a 0.6% base rate, a 1.6% consolidated rate, and a guarantee within 90 pulls. The widely used community model that matches those numbers:

```
p5(n) = 0.006                         for n ≤ 73
p5(n) = 0.006 + 0.06 × (n − 73)       for 74 ≤ n ≤ 89
p5(n) = 1                             for n = 90
```

`n` is the pull number counting from 1 since the last 5★ (so current pity + 1).

**Check:** under this model the expected pulls per 5★ is 62.30, which gives a consolidated rate of 1.605%. That matches the official 1.6%. Make it a unit test.

### The 50/50 and Capturing Radiance

- If the last 5★ lost the 50/50, the next 5★ is the featured character (guaranteed).
- Otherwise HoYoverse's official statement is that, including Capturing Radiance, a 5★ from the event banner has a **55% consolidated chance** of being the featured character. Sources explaining the mechanic below.
- Capturing Radiance does not create a guarantee. A plain loss still does.

Community write-ups describe a hidden loss counter that makes Capturing Radiance more likely after repeated losses. Those accounts disagree on the details and are not official. Implement:

```ts
interface FiftyFiftyModel {
  // chance a non-guaranteed 5★ is the featured character, given hidden state
  featuredChance(state: FiftyFiftyState): number;
  next(state: FiftyFiftyState, outcome: 'won' | 'radiance' | 'lost'): FiftyFiftyState;
}
```

Ship `consolidated55` as the default (stateless, 0.55). Leave a `counterModel` stub and a settings toggle labeled "Experimental: loss-counter model" for later.

### Constellation targets

"Get the character at C*k*" means _k_+1 copies. Run a forward dynamic program over pulls with state `(copies, guaranteed, pity)`; the probability mass that reaches the target copy count at pull _t_ gives the CDF. See `featuredCdf` in the prototype. It handles 400 pulls × 7 copies in a few milliseconds, so no worker is needed.

**Tests:**

- Guaranteed, pity 0, 1 copy → CDF(90) = 1.
- Not guaranteed, pity 0, 1 copy → CDF(180) = 1 and CDF(90) ≈ 0.6345.
- CDF is non-decreasing and ends at 1 once `pulls ≥ 90 × (2 × copies − (guaranteed ? 1 : 0)) − pity`.
  Worst case is a lost 50/50 before _every_ copy, because the guarantee clears again after each
  featured pull — so each copy costs two 5★ rather than one, and a player already on a guarantee
  saves exactly one of them. An earlier version of this line read `(90 − pity) + 90 × copies`, which
  assumes a single loss across the whole run: right for one copy by coincidence, and too short from
  two up. At C6 it gives 720 pulls where the true bound is 1,260, which silently truncates the
  curve. `exhaustionBound()` in `src/engine/wish/featured.ts` is the implementation, and
  `featuredCdf` defaults `maxPulls` to it so the curve always ends at certainty.
- Monte Carlo simulation (100k runs, seeded) agrees with the DP within 0.5 percentage points at 10 checkpoints.

### Outputs the UI needs

- P(target by the pulls you'll have), for C0 through the chosen constellation.
- The full CDF curve for the Fate Dial.
- Pulls needed for 50%, 75%, and 90% odds (so the app can say "You're 18 pulls short of 90% odds").

### Reading the model backwards: how lucky a run was

"Average pity 58 against 62.3 expected" gives the sign but not the size. Three 5★s at that pace is noise; forty is not. The exact answer uses the same distribution:

> The pulls needed for _k_ 5★s is the _k_-fold convolution of the single-5★ distribution. Its survival function at the pulls actually spent is the share of players who would still be waiting.

So "luckier than 93%" is exact, not a heuristic or a simulation — the planner's own model, read in the other direction (`src/engine/wish/luck.ts`).

- Only the pulls that produced a 5★ count. Pity built up since the last one is an unfinished attempt and carries no information yet.
- Exact up to 150 copies; beyond that the central limit theorem takes over (150 independent draws of a distribution bounded at 90). A test asserts the two agree across that boundary to within 2 points, so the number a player sees never jumps.

---

## 2. Weapon event banner (Epitomized Path) — backlog, not v1

Not scheduled: SPEC.md does not list weapons in v1, no ROADMAP phase has a weapon task, and BACKLOG.md carries "Weapon banner planner". Kept here so the model is not lost. Community-derived and lower confidence — confirm every number against current sources before building:

- Base 0.7%, rising from pull 63 by about 7% per pull, guaranteed by 80 (in practice 5★ weapons almost always land by 77).
- A 5★ is one of the two featured weapons 75% of the time; each featured weapon is 50% of that.
- Epitomized Path: since 5.0 the chosen weapon is guaranteed after one miss (fate points max at 1).

Same DP shape as characters, with state `(pity, fatePoint, guaranteedFeatured)`.

---

## 3. Primogem income projection

Pulls available by a date = fates + floor((primos + projected income) / 160) + optional starglitter shop fates.

Income sources (user can toggle and override each):

| Source                                                                | Shape                                             |
| --------------------------------------------------------------------- | ------------------------------------------------- |
| Daily commissions                                                     | per day                                           |
| Blessing of the Welkin Moon                                           | per day while active (user enters days remaining) |
| Endgame modes (Spiral Abyss, Imaginarium Theater, and any newer mode) | per reset, with an expected-completion slider     |
| Events                                                                | per patch, user estimate                          |
| Maintenance and livestream compensation                               | per patch                                         |
| Paimon's Bargains fates (starglitter)                                 | per month, capped                                 |
| Battle Pass                                                           | per patch, if owned                               |

**Do not hardcode amounts from memory.** In Phase 1, research the current values, then store them in `src/engine/income/defaults.ts` with a `source` URL and `verifiedAt` date on every field. Show "Assumptions checked Sep 2026" in the income sheet so stale defaults are visible.

Patch cadence: versions run about six weeks in two ~three-week banner phases (7.1 launched Sep 23, 2026; phase 2 starts Oct 13). Store known banner windows in `src/engine/calendar/banners.ts`, also with sources.

### Keeping the balance current (the ledger)

No API reports a primogem balance, so it has to be typed at least once. It does not have to be typed twice: income is the projection above, and spending is in the wish history that is already imported.

    balance(now) = confirmed + income(confirmed → now) − 160 × pulls since confirmed

The confirmed pair (primogems, fates, and the instant) is an **anchor** and is never overwritten. Everything shown is derived from it, so a wrong answer is traceable to either the anchor or the assumptions rather than to a figure that has been silently mutated. Typing a balance re-anchors it at that moment.

Rules the implementation follows (`src/engine/ledger/balance.ts`):

- Wishing spends Intertwined Fates first; primogems are only converted when those run out, at 160 each.
- Only banners that take **Intertwined Fate** count: character (301), character-2 (400), weapon (302) and Chronicled Wish (500). Beginners' (100) and Standard (200) take Acquaint Fate, which is not part of a wish budget.
- Gacha-log timestamps are **server-local with no zone**, so they are read at the server's UTC offset. Read as UTC, an America account's pulls land five hours early and can fall on the wrong side of the anchor or a reset.
- Income is rounded **down**. Overstating a balance promises pulls the player cannot afford; understating it only withholds one they can.
- A pull whose timestamp will not parse counts as spent, for the same reason.
- Welkin is paid for the whole backfilled window: the plan stores days remaining from _now_, so over a window already elapsed the player plainly had at least that many.
- If the spend outruns the anchor plus income, the balance clamps at zero and the screen says the anchor is wrong rather than showing a confident zero.

---

## 4. Artifacts

### Drop model (5★ from AR45+ domains)

| Fact             | Value                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| Resin per run    | 20 (condensed resin: 40 for double drops)                                        |
| 5★ per run       | about 1.07 on average (one guaranteed, ~7% chance of a second)                   |
| Set              | 50/50 between the domain's two sets                                              |
| Slot             | 20% each: flower, plume, sands, goblet, circlet                                  |
| Initial substats | 4 lines 20% of the time from domains, 34% from bosses and strongbox; otherwise 3 |

### Main stat chances

| Sands             |        | Goblet                                   |         | Circlet           |     |
| ----------------- | ------ | ---------------------------------------- | ------- | ----------------- | --- |
| HP%               | 26.68% | HP%                                      | 19.25%  | HP%               | 22% |
| ATK%              | 26.66% | ATK%                                     | 19.25%  | ATK%              | 22% |
| DEF%              | 26.66% | DEF%                                     | 19.00%  | DEF%              | 22% |
| Energy Recharge   | 10%    | Each elemental / physical DMG% (8 types) | 5% each | CRIT Rate         | 10% |
| Elemental Mastery | 10%    | Elemental Mastery                        | 2.5%    | CRIT DMG          | 10% |
|                   |        |                                          |         | Healing Bonus     | 10% |
|                   |        |                                          |         | Elemental Mastery | 4%  |

### Substats

New substat lines are picked by weight among stats not already present and not equal to the main stat:

| Stat              | Weight | Max roll (5★) |
| ----------------- | ------ | ------------- |
| HP                | 6      | 298.75        |
| ATK               | 6      | 19.45         |
| DEF               | 6      | 23.15         |
| HP%               | 4      | 5.83%         |
| ATK%              | 4      | 5.83%         |
| DEF%              | 4      | 7.29%         |
| Energy Recharge   | 4      | 6.48%         |
| Elemental Mastery | 4      | 23.31         |
| CRIT Rate         | 3      | 3.89%         |
| CRIT DMG          | 3      | 7.77%         |

- Each roll is 70%, 80%, 90%, or 100% of the max, uniformly.
- Upgrades happen at +4, +8, +12, +16, +20. A 3-line piece gains its 4th line at +4; after that each upgrade picks one of the four lines uniformly.

### Keep-or-trash scorer

Monte Carlo, seeded, 20,000 trials, in a Web Worker (use Comlink). Input: the piece's slot, main stat, current level, current substats, and a **goal**:

- Default goal: crit value (2 × CRIT Rate + CRIT DMG) of at least 30.
- Character goal: weighted roll value using that character's stat weights (e.g. ATK% 1, CRIT 1, ER 0.5). Stat-weight presets live in `src/engine/artifacts/weights.ts`.

Output: P(goal met at +20), the distribution of final scores for the histogram, and a verdict:

| P(goal) | Verdict                                              |
| ------- | ---------------------------------------------------- |
| ≥ 35%   | Level it                                             |
| 15–35%  | Level to +8, then decide (re-run with the new state) |
| < 15%   | Feed it                                              |

Thresholds live in one config object so they're easy to tune.

**Check:** an ATK% sands at +0 with CRIT Rate 3.11, CRIT DMG 6.99, ER 5.18, DEF 18.52 has about a 50% chance of finishing at 30+ crit value.

### Resin estimator

For a target (set, slot, main stat, goal):

```
p = 0.5 (set) × 0.2 (slot) × P(main) × P(fresh drop finishes at goal)
per-run success ≈ 1 − exp(−1.07 × p)
runs for quantile q = ceil( ln(1 − q) / ln(1 − per-run success) )
resin = runs × 20
```

Report the median and the 90th percentile, and convert to days at 180 resin per day (natural regen is one per 8 minutes). Example: an on-set ATK% sands that finishes at 30+ crit value costs about 15,000 resin at the median and about 50,000 for 9-in-10 odds.

Newer crafting paths (Sanctifying Elixir via the Artifact Transmuter, which guarantees at least two rolls into chosen substats since 5.5) are a backlog comparison feature, not v1. (See BACKLOG.md → Artifacts and builds.)

---

## 5. Timers

| Timer                  | Rule                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Original Resin         | +1 every 8 minutes up to a cap of 200 (raised from 160 in version 4.7)                                                                                               |
| Parametric Transformer | Usable again 166 hours after use, which is 6 days 22 hours. The gadget description rounds to 7 days, so assuming 7 makes a player wait two hours too long every week |
| Expeditions            | 4, 8, 12, or 20 hours, per slot                                                                                                                                      |
| Realm currency         | User enters current amount, cap, and hourly rate from their teapot                                                                                                   |
| Daily reset            | 04:00 server time. Weekly reset is Monday at the same instant                                                                                                        |

Timers compute from a stored `setAt` timestamp and the rule, never from a ticking counter, so they stay correct when the app is closed.

### Which clock

Genshin runs three, and everything dated — daily and weekly resets, the Abyss on the 16th, the Theater and stardust shop on the 1st, banner windows, the timestamps on imported wishes — is on **server** time, not the player's.

| Server         | Offset | Reset, in UTC        |
| -------------- | ------ | -------------------- |
| America        | UTC−5  | 09:00                |
| Europe         | UTC+1  | 03:00                |
| Asia, TW/HK/MO | UTC+8  | 20:00 the day before |

- source: https://game8.co/games/Genshin-Impact/archives/301599
- verifiedAt: 2026-09-29

The server is read off the UID (`src/engine/account/server.ts`), so nobody is asked for it. Before an account is imported there is nothing to go on, so America is assumed and the Account screen says so.

**Watch the sign.** A server ahead of UTC resets at a _negative_ UTC hour, which puts the instant on the previous UTC day. Building a candidate from today's UTC date and adding one day if it is not late enough — the obvious implementation — leaves the "next" reset in the past for Asian accounts from 20:00 UTC onwards, and over-counts a projection's days by one. Step forward by however many whole days it takes instead. Tested across all 24 hours for every offset, because which hour you ask at is exactly what decides whether it shows.

---

## 6. Outgoing damage

The formula every damage number in the game comes from. Written down here because the optimiser's whole job is to maximise it, and a search is only as good as the objective it is searching against.

    DMG = (Σ(Base DMG × Base Multiplier) + Additive Base Bonus)
          × DMG Bonus × Elevation
          × DEF Multiplier × RES Multiplier × CRIT Multiplier
          [× Amplifying Multiplier, when the hit triggers Vaporize or Melt]

- **Base DMG** = ability% × the stat it scales with (ATK unless the talent says otherwise — some scale off Max HP, DEF or EM).
- **DEF Multiplier** = `(Lv_char + 100) / (k × (Lv_enemy + 100) + (Lv_char + 100))`, where `k = (1 − DEF reduction)(1 − DEF ignored)`. Note this depends on _character_ level, so a level-90 character takes less of a penalty than a level-70 one against the same enemy.
- **RES Multiplier** is piecewise, and the negative branch is why RES shred is so strong:

  | RES       | Multiplier        |
  | --------- | ----------------- |
  | < 0       | 1 − RES/2         |
  | 0 to 0.75 | 1 − RES           |
  | ≥ 0.75    | 1 / (4 × RES + 1) |

- **CRIT Multiplier** is `1 + CRIT DMG` on a crit and `1` otherwise. Starfall also reports an **average**, `1 + min(1, CRIT Rate) × CRIT DMG`, which is ours rather than the game's — it is the right objective for an optimiser, because a build is played many times, not once. Crit rate is capped at 1 in that average: overcapped rate is genuinely wasted and the number should say so.
- **Amplifying Multiplier** = coefficient × (1 + EM bonus + reaction bonus), where the coefficient is 2.0 for Melt triggered by Pyro, 1.5 for Melt triggered by Cryo, 2.0 for Vaporize triggered by Hydro, 1.5 for Vaporize triggered by Pyro.
- **EM bonus (amplifying)** = `2.78 × EM / (EM + 1400)`. Transformative reactions use `16 × EM / (EM + 2000)` instead and are not implemented yet.

### The test case

The wiki's own worked example, reproduced exactly by `src/engine/damage/formula.test.ts`:

> Mona at level 70 with 1500 ATK, 150 EM, 80% CRIT DMG and 40% Hydro DMG Bonus, casting a level 6 Stellaris Phantasm (6.19×) with a further 52% bonus, into a level 75 Fatui Agent at 10% base Hydro RES shredded 40%, with 23% DEF reduction, critting and triggering Vaporize.

    DEF mult   = 170 / (0.77 × 175 + 170)        = 0.55783
    RES mult   = 1 − (−0.3 / 2)                  = 1.15
    EM bonus   = 2.78 × 150 / 1550               = 0.26903
    Amplifying = 2 × 1.26903                     = 2.53806
    DMG        = 1500 × 6.19 × 1.92 × 0.55783 × 1.15 × 2.53806 × 1.8
               = 52,246.50

The wiki prints 52,246.50, which is what those _rounded_ intermediates multiply out to. Carrying full precision through the same formula gives **52,246.9986**, and that is what Starfall reports. Every intermediate agrees with the wiki's to every digit it printed, so the half-point is display rounding rather than a difference in the model — worth knowing before comparing against a hand calculation.

- source: https://genshin-impact.fandom.com/wiki/Damage
- verifiedAt: 2026-09-30

### Not modelled

Transformative reactions, elevation, and anything conditional a talent or weapon passive does. Team buffs are **explicit inputs**, not inferred: no dataset encodes "Bennett's burst gives +X ATK" as something executable, so each one is written by hand or typed by the player. Saying so is the difference between a calculator that is wrong and one that is incomplete.

---

## Sources

- Pity and consolidated rates: https://news.bittopup.com/news/genshin-impact-pity-system-guide-90-pull-guarantee-50-50
- Capturing Radiance official wording (55% consolidated): https://genshin-impact.fandom.com/f/p/4400000000000461675 and https://game8.co/games/Genshin-Impact/archives/468191
- Loss-counter model (unofficial): https://news.bittopup.com/news/capturing-radiance-50-50-22.5-double-loss-explained
- Main stat and substat distributions: https://genshin-impact.fandom.com/wiki/Artifact/Distribution
- Substat roll values: https://genshin-impact.fandom.com/wiki/Artifact/Stats and https://keqingmains.com/misc/artifacts/
- Domain drop rates and 4-line chances: https://news.bittopup.com/news/genshin-impact-loot-scaling-guide-ar45-drop-rates
- Sanctifying Elixir 5.5 change: https://www.sportskeeda.com/esports/genshin-impact-5-5-introduce-new-artifacts-qol-feature
- Banner calendar (7.1): https://game8.co/games/Genshin-Impact/archives/305012
- Damage formula, with the worked example used as a test: https://genshin-impact.fandom.com/wiki/Damage
- Server reset times and offsets: https://game8.co/games/Genshin-Impact/archives/301599 and https://www.rpgsite.net/feature/10336-genshin-impact-daily-reset-time-when-the-server-reset-is-in-your-region
- Intertwined Fate price and use: https://genshin-impact.fandom.com/wiki/Intertwined_Fate
- Acquaint Fate is for Standard and Beginners' Wish: https://genshin-impact.fandom.com/wiki/Acquaint_Fate
- Chronicled Wish takes Intertwined Fate: https://game8.co/games/Genshin-Impact/archives/446618
