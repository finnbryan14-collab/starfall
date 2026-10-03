# Starfall

A Genshin Impact companion app: a probability-first wish planner, an artifact keep-or-trash scorer with a resin estimator, and daily timers. Installable web app, local-first, built for Finn and friends.

## Read first

| File                  | What's in it                                                   |
| --------------------- | -------------------------------------------------------------- |
| `docs/SPEC.md`        | What v1 does and its acceptance criteria                       |
| `docs/ROADMAP.md`     | The ordered task list. Work from here.                         |
| `docs/MATH.md`        | Every probability model, with test cases and sources           |
| `docs/DATA.md`        | Enka, wish history, GOOD import, static data, storage schema   |
| `docs/DESIGN.md`      | Visual direction, tokens, motion rules, copy voice             |
| `design/preview.html` | Working visual reference: open it in a browser                 |
| `design/tokens.css`   | Design tokens (source of truth for color, type, space, motion) |
| `docs/DECISIONS.md`   | Why things are the way they are. Append when you make a call.  |

## Stack

- Next.js (App Router) + TypeScript strict, `src/` directory, pnpm
- Tailwind CSS mapped to `src/styles/tokens.css`
- anime.js v4 (`animejs`) for all animation
- Dexie (IndexedDB) for persistence; screen state is plain React hooks (see DECISIONS: Zustand went unused)
- d3-scale and d3-shape for chart geometry (rendered as our own SVG, not a chart library)
- Comlink + Web Worker for Monte Carlo
- Vitest (unit), Playwright (e2e and screenshots)
- A hand-written service worker in `public/sw.js` (see DECISIONS: Serwist was more machinery than a local-first app earns)
- Deploy on Vercel

## Layout

```
src/
  app/            routes: plan, artifacts, timers, account; api/ route handlers (enka, wishes)
  components/     UI components (no math in here)
  engine/         pure TS models: wish/, artifacts/, income/, calendar/, timers/  (no React, no DOM, no fetch)
  workers/        Comlink workers that call engine/
  motion/         anime.js helpers (useAnimeScope, tweenNumber, reduced-motion guard)
  data/           generated static data and ID maps (from scripts/)
  db/             Dexie schema and queries
  styles/         tokens.css, globals.css
scripts/          build-static-data.ts and other generators
```

## Commands

```
pnpm dev          # local dev server
pnpm test         # Vitest (watch: pnpm test:watch)
pnpm test:e2e     # Playwright, at 390x844 and 1280x800
pnpm lint         # ESLint + Prettier check
pnpm format       # Prettier write
pnpm typecheck    # tsc --noEmit
pnpm perf         # engine performance budget, run isolated
pnpm build:data   # regenerate everything in src/data/ and public/data/
pnpm build:game-data # just the characters, weapons, artifact sets and talents
pnpm build:models # re-author the burst shards in Blender (headless)
pnpm build        # production build
```

Update this section if the scripts change.

## Rules

**Engine**

- `src/engine/` is pure and deterministic. Randomness uses a seeded RNG passed in as an argument.
- Every model in MATH.md gets its listed tests before its UI is built.
- Game constants that could change between patches carry a `source` URL and `verifiedAt` date next to the value.
- Don't state game numbers from memory. If a number isn't in MATH.md or DATA.md, look it up and cite it.

**Design**

- Use tokens only. No hex values or raw pixel sizes in components when a token exists.
- One big answer per screen (Bodoni numeral). Everything else stays quiet.
- Gold means 5★ or "your target." Never decorative.
- No all-caps labels, no middle-dot meta strings, no arrows appended to button text, no identical card grids.
- Match `design/preview.html` unless DESIGN.md says otherwise.

**Motion**

- All animation goes through `src/motion/` and anime.js. Inside React, use `createScope({ root })` in `useEffect` and `revert()` on cleanup.
- Motion responds to something the person did. No looping ambient animation, no scroll-triggered fade-ins on every section.
- Always honor `prefers-reduced-motion` by jumping to the end state.

**Data and privacy**

- Enka and wish-history requests go through our route handlers, never directly from the browser.
- Respect Enka's `ttl`. Never retry on 429 without waiting.
- Never log, persist, or send the wish-history authkey anywhere except the one proxied request.
- HoYoLAB cookies are an **explicit opt-in**, off by default, and everything else works without one (DATA.md section 5). Only the six cookie names those endpoints need are kept, filtered before the first write. Never widen that set without a DECISIONS entry.
- No game memory reading, no input automation. Permanently out of scope: it risks bans.

**Accessibility**

- 44px minimum tap targets, visible gold focus rings, 4.5:1 text contrast.
- Rarity is never color alone; show ★ counts too.
- Charts get an `aria-label` sentence and a hidden data table.

## Workflow

1. Take the next unchecked task in `docs/ROADMAP.md` (or run `/next-task`).
2. Read the doc sections it references. If something is ambiguous, pick the reading most consistent with SPEC.md, note it in DECISIONS.md, and continue.
3. Write engine tests first, then the engine, then UI.
4. Run `pnpm test` and `pnpm lint`. For UI tasks, take a Playwright screenshot at 390×844 and 1280×800 and compare with the preview.
5. Check the box in ROADMAP.md and commit with a message that names the task.

## Definition of done

Tests pass, lint is clean, reduced motion works, the screen works at 390px and 1280px, keyboard focus is visible, and the ROADMAP box is checked.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
