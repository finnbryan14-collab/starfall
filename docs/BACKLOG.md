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

- **Build optimizer:** stat-target search first (hit an ER threshold, maximize crit value), full damage formula later.
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

## Correctness, known gaps

- **Non-America servers.** Everything assumes the America server: reset at 04:00 UTC-5, and gacha-log timestamps read at that offset. Europe is UTC+1 and Asia/TW are UTC+8 (`genshin.py` records all three). The server is already derivable from the UID — `recogniseServer` in `src/lib/hoyolab.ts` — so the fix is to thread an offset through `src/engine/time.ts` and everything that defaults to `AMERICA_UTC_OFFSET`, rather than to gather new data. Until then a Europe player's daily reset countdown is six hours out and their pull timestamps are six hours early.
