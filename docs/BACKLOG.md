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

- **Build optimizer:** shipped at `/account/builds` — the damage formula, the stat layer, the generated game data, build assembly, the branch-and-bound search in a worker, and a buff panel for team effects as explicit inputs. Still open: weapon and talent passives (currently typed in by hand), transformative reactions, and presets for the common team buffs so nobody has to look up what Bennett's burst is worth.
- **Sanctifying Elixir vs. domain farming** comparison.
- **"Level to +8, then decide"** flow that remembers the piece and re-scores it.
- Pick artifacts from the imported GOOD inventory instead of manual entry.

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
