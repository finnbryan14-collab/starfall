# Roadmap

Work top to bottom. Each task is small enough for one Claude Code session. Check the box when the task's "done when" is true, tests pass, and the change is committed. Run `/next-task` to pick up the next unchecked item.

## Phase 0: Scaffold and design system

- [x] Create the Next.js app (App Router, TypeScript strict, `src/` dir, pnpm) with `create-next-app@latest`. Add ESLint, Prettier, Vitest, Playwright. **Done when** `pnpm dev`, `pnpm test`, and `pnpm lint` all run clean.
- [x] Copy `design/tokens.css` to `src/styles/tokens.css`; map tokens into Tailwind's theme; set the `--ink` background and body type globally. **Done when** a token swatch page at `/dev/tokens` renders every token.
- [x] Load Bodoni Moda and Source Sans 3 with `next/font/google`; enable tabular figures on the UI font. **Done when** no layout shift on reload.
- [x] Build the app shell: bottom bar (mobile), left rail (≥1024px), four routes (`/plan`, `/artifacts`, `/timers`, `/account`), starfield background (static SVG, seeded). **Done when** it matches the preview's shell at 390px and 1280px.
- [x] Add `src/motion/`: `useAnimeScope(rootRef, setup)` wrapping `createScope` + `revert()`, a `prefersReducedMotion()` helper, and `tweenNumber(el, from, to, format)`. **Done when** a Storybook-free demo page at `/dev/motion` shows each helper, and reduced motion jumps to end states.
- [x] Core components: StepperRow, SegmentedControl, AnswerBlock, BottomSheet, SubstatLine, TimerRow. **Done when** each has a `/dev/components` example and keyboard focus is visible.

## Phase 1: Wish planner

- [x] `src/engine/wish/pity.ts`: `p5Char`, `next5Dist`, expected-pulls test (62.30). **Done when** tests in MATH.md §1 pass.
- [x] `src/engine/wish/featured.ts`: `FiftyFiftyModel` interface, `consolidated55`, DP `featuredCdf` for 1–7 copies, pulls-for-quantile helper. **Done when** DP and Monte Carlo tests agree.
- [x] Research current primogem income values; write `src/engine/income/defaults.ts` with `source` and `verifiedAt` on every field; `projectIncome(inputs, fromDate, toDate)`. **Done when** unit tests cover Welkin expiring mid-range and reset boundaries.
- [x] `src/engine/calendar/banners.ts` with current and next phase windows (sources linked). **Done when** the planner can default the target date from a chosen banner.
- [x] Plan screen UI: inputs, AnswerBlock, constellation row, income sheet. Persist plans in Dexie. **Done when** it matches the preview and survives reload.
- [x] Fate Dial component (SVG + d3-scale + d3-shape) with the signature animation from DESIGN.md. **Done when** input changes replay the animation once and reduced motion shows the end state instantly.
- [x] Playwright test: enter the preview's example (11,200 primogems, 14 fates, pity 22, 50/50, 3,850 income) and assert 72.9% for C0.

## Phase 2: Artifacts

- [x] `src/engine/artifacts/model.ts`: main stat tables, substat weights and max rolls, seeded RNG, `simulateToMax`. **Done when** distribution tests match the published main-stat odds within 0.3pp over 200k samples.
- [ ] `keepOrTrash` in a Web Worker via Comlink; verdict thresholds in config. **Done when** the MATH.md §4 example returns about 50% and the UI stays responsive during the run.
- [ ] `resinEstimate` (median and p90 resin and days). **Done when** the sands example lands near 15,000 median.
- [ ] Artifacts screen: substat entry, verdict, histogram, "Roll to +20" with `scrambleText`, resin estimator. **Done when** manual entry of a 4-line piece takes under 20 seconds on a phone.
- [ ] Stat-weight presets for common roles (crit DPS by ATK/HP/DEF/EM scaling, ER support, EM reaction). **Done when** the goal selector offers them.

## Phase 3: Timers and install

- [ ] Timer engine: each timer computed from `setAt` + rule (resin, transformer, expeditions, realm currency, resets). **Done when** tests cover caps and day boundaries in UTC−5.
- [ ] Timers screen with the resin ring animation. **Done when** values are correct after a simulated 10-hour gap.
- [ ] PWA: manifest, icons (original), service worker with Serwist (or the current recommended Next.js PWA option), offline shell. **Done when** it installs on iOS and Android and opens offline.

## Phase 4: Account

- [ ] Enka proxy route with TTL caching, User-Agent, and per-status error messages; UID import screen; character chips. **Done when** a real public UID imports and a second request within TTL is served from cache.
- [ ] Wish history import (paste URL → proxy paging → merge by id). **Done when** a real import fills pity and guarantee on the Plan tab and the authkey isn't persisted anywhere.
- [ ] Luck stats page: pity at each 5★, 50/50 record, average vs expected.
- [ ] GOOD inventory import with Zod validation and a confirm step.
- [ ] Backups: export and import all tables as one JSON file.
- [ ] Fan-project notice in Account and footer.

## Phase 5: Notifications and ship

- [ ] Web Push (VAPID) for "resin full" and "transformer ready": a small scheduled function that sends pushes at the computed times. iOS requires the app to be installed to the home screen. **Done when** a push arrives on Finn's phone.
- [ ] Deploy to Vercel. Lighthouse: performance ≥ 90, accessibility ≥ 95 on mobile.
- [ ] Share with friends; collect the three most-wanted features from `docs/BACKLOG.md`.
