# Backlog

Ideas from planning, not scheduled. Pull into ROADMAP.md when v1 ships.

## Planning

- **Banner decision helper:** compare "pull now vs. save for a later banner" as probability outcomes side by side.
- **Weapon banner planner** (MATH.md §2), including the combined "character + signature weapon" goal.
- **ER requirement calculator** per team rotation.
- **Account health dashboard:** under-built characters, crit ratio, talent levels.
- **What to farm today:** domain weekday rotation × your planned characters' talent books and weapon materials.
- **Endgame lineup planner** with reset countdowns and this season's eligible characters.
- **Patch calendar** with banner and event countdowns.

## Artifacts and builds

- **Build optimizer:** shipped at `/account/builds` — the damage formula, the stat layer, the generated game data, build assembly, the branch-and-bound search in a worker, a weapon picker over every weapon of the right type on the account, and a buff panel for team effects as explicit inputs. Still open: weapon and talent passives (currently typed in by hand), transformative reactions, and presets for the common team buffs so nobody has to look up what Bennett's burst is worth.
- **Sanctifying Elixir vs. domain farming** comparison.
- **"Level to +8, then decide"** flow that remembers the piece and re-scores it.
- Pick artifacts from the imported GOOD inventory instead of manual entry.

### The DPS calculator, expanded

Asked for on 2026-10-02: see every imported character, artifact and weapon, and calculate directly against them to optimise builds, teams and rotations for maximum damage. Four steps, and they get progressively harder for a reason worth knowing up front.

**1. Show everything.** _Done 2026-10-05._ `/account/roster` has three tabs, each filterable and sortable, and `src/lib/inventory.ts` joins a weapon to the generated tables so a row reads "674 base ATK, CRIT DMG 44.1%" rather than just "Mistsplitter Reforged". The summary says how much of the account is idle, which is the thing a list cannot tell you. The build screen now computes against any weapon of the right type, not only the one the export says the character is holding.

Left out deliberately: "what this piece would be worth elsewhere" needs a damage figure per piece per character, which is step 2's assignment problem and not a label step 1 can print honestly.

**2. Optimise across the account, not one character at a time.** Today the search answers "what are the best five for Hu Tao". The real question is "where does this piece do the most good", which is an assignment problem across the whole roster rather than a search per character. The branch-and-bound objective already exists; what is missing is the outer loop and a way to express "nobody may wear the same artifact twice".

**3. Teams.** Resonance is machine-readable and should be modelled properly rather than typed in — two Pyro characters is 25% ATK, and that is a table, not a judgement. Character buffs are the hard part and the boundary that has held all along: no dataset encodes "Bennett's burst gives +X ATK" as something executable, so each one is hand-written with a source and a date, the way every other game constant in `docs/MATH.md` is. Doing twenty of the common supports well beats doing all 129 badly.

**4. Rotations.** The largest step, and the one that needs a model the app does not have yet: a timeline with energy, cooldowns, buff durations and infusion windows, so "Bennett Q → Xiangling Q → Hu Tao E → N1C" produces a damage-per-rotation figure rather than a damage-per-hit one. Needs step 3 finished first, because a rotation is mostly an argument about which buffs are up when.

Step 2 is mostly engineering on parts that already exist. Steps 3 and 4 are mostly research, and each hand-written buff is a number that has to be cited rather than remembered.

## Social

- Shareable build cards (image export).
- Compare builds with friends.

## Platform

- Optional sync (accounts) once more than a few friends use it.
- Home-screen widget for resin (needs a native wrapper, e.g. Capacitor).
- Experimental Capturing Radiance loss-counter model toggle.

## Blocked on someone else

- **Akasha build rankings.** `GET akasha.cv/api/getCalculationsForUser/{uid}` returns, per showcased character, the damage calculation with its exact conditions and that account's placement — `ranking: 110104, outOf: 270589` — keyed on the UID already imported. It would answer the one question the artifact scorer cannot: not "is this piece worth resin" but "is this build any good".

  Blocked by their Cloudflare, which fingerprints the client. From one machine at one instant with one User-Agent, curl gets 200 and Node's `fetch` gets 403, so a serverless function is refused. There is no browser route either: the API sends no `Access-Control-Allow-Origin` and answers a cross-origin preflight with 403.

  Both ways through would mean circumventing that — impersonating a browser's TLS handshake, or stripping the `Origin` header — so the only legitimate next step is to ask the maintainer for an API key or an allowlisted User-Agent. See DECISIONS, 2026-09-29.
