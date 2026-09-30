# Starfall

A Genshin Impact companion that answers in probabilities, not counts.

Other planners tell you you'll have 108 pulls. Starfall tells you that's a
**72.9% chance at Skirk**, and that 26 more pulls gets you to 90%. It also scores
artifacts before you level them, estimates the resin to farm a replacement, and
keeps the daily timers in one place.

Installable on a phone, usable on a laptop. No accounts, no sign-up. Everything
lives in your browser.

## Running it

```bash
corepack enable pnpm
pnpm install
pnpm dev
```

| Command           | What it does                                      |
| ----------------- | ------------------------------------------------- |
| `pnpm dev`        | Local dev server                                  |
| `pnpm test`       | Unit tests (Vitest)                               |
| `pnpm test:e2e`   | End-to-end tests (Playwright, 390px and 1280px)   |
| `pnpm lint`       | ESLint and Prettier                               |
| `pnpm typecheck`  | `tsc --noEmit`                                    |
| `pnpm build`      | Production build                                  |
| `pnpm lighthouse` | Audits a running production build on port 3101    |
| `pnpm build:data` | Regenerates the character map and banner calendar |
| `pnpm vapid`      | Generates a Web Push key pair                     |

`design/preview.html` opens in a browser on its own and shows the visual target.

## Deploying

Starfall is a Next.js app with a handful of route handlers. It deploys to Vercel
with no configuration, but **set `STARFALL_CONTACT` first**.

1. Push the repository to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new). The framework, build
   command and package manager are all detected.
3. Add one environment variable:

   ```
   STARFALL_CONTACT = https://github.com/you/starfall
   ```

   Enka.Network asks every client to identify itself in the `User-Agent` so they
   can get in touch about your traffic. Without this, Starfall sends
   `contact-not-set`, which is honest and useless to them.

4. Deploy.

Notifications are not wired up yet — see `docs/ROADMAP.md`, which records the
constraint that decides the shape of them (Vercel's Hobby plan allows one cron
run per day).

Once the repository is on GitHub, a weekly Action regenerates the character map
and banner calendar and **opens a pull request** rather than pushing. The banner
calendar sets every plan's default target date, so that diff is worth a glance.

## What leaves your device

Almost nothing, and never silently.

- **Your UID**, to Starfall's own proxy and then to Enka.Network, to read the
  characters in your in-game showcase.
- **One wish-history request** per import. The link's authkey is used once and
  never stored — there's a test that reads back every browser store to prove it.
- **A HoYoLAB cookie, only if you opt in.** Off by default; everything else
  works without one. Only the six cookie names those endpoints need are kept.

Everything else — plans, pulls, artifacts, timers — is IndexedDB on your device.
There is no server copy and no account, so `Account → Backups` is the only thing
standing between you and a cleared browser.

## The docs

| File                | What's in it                                            |
| ------------------- | ------------------------------------------------------- |
| `docs/SPEC.md`      | What v1 does and its acceptance criteria                |
| `docs/ROADMAP.md`   | The ordered task list                                   |
| `docs/MATH.md`      | Every probability model, with test cases and sources    |
| `docs/DATA.md`      | Enka, wish history, HoYoLAB, GOOD import, storage       |
| `docs/DESIGN.md`    | Visual direction, tokens, motion rules, copy voice      |
| `docs/DECISIONS.md` | Why things are the way they are. Append when you decide |
| `docs/BACKLOG.md`   | Everything saved for after v1                           |

Game constants carry a source URL and a `verifiedAt` date next to the value, so
a number that has gone stale can be found rather than trusted.

---

Starfall is a fan project and is not affiliated with HoYoverse. Game content and
materials are trademarks and copyrights of HoYoverse. Banner schedules from
[paimon.moe](https://paimon.moe) (MIT); character data from
[Enka.Network](https://enka.network).
