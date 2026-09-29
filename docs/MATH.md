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
| Daily reset            | 04:00 server time (America server: UTC−5)                                                                                                                            |

Timers compute from a stored `setAt` timestamp and the rule, never from a ticking counter, so they stay correct when the app is closed.

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
