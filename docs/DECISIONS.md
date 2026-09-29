# Decisions

A running log. Newest at the bottom. When a decision changes, add a new entry instead of editing the old one.

| Date | Decision | Why | Revisit if |
|---|---|---|---|
| 2026-09-28 | Installable web app (Next.js PWA), not native | One codebase for phone and laptop; fastest to build | Home-screen widgets become a must-have |
| 2026-09-28 | Built for Finn and friends first | Keeps hosting, rate limits, and policy simple | Opening to the public |
| 2026-09-28 | Local-first storage (IndexedDB via Dexie), no accounts | No backend to run; privacy by default | Friends want sync across devices |
| 2026-09-28 | Probability engine is pure TypeScript in `src/engine/`, fully unit-tested | The math is the product; it must be trustworthy and reusable across features | Never |
| 2026-09-28 | 50/50 uses the official 55% consolidated rate by default | The only published figure; community loss-counter models disagree | Better data on Capturing Radiance appears |
| 2026-09-28 | anime.js v4 for all motion | Timeline, SVG draw, motion paths, and text scramble in one small library | A motion need it can't meet |
| 2026-09-28 | No HoYoLAB cookies in v1 | Cookies grant broad account access | Live resin sync becomes worth the risk |
| 2026-09-28 | Working name "Astrolabe" | Navigator's star instrument; fits planning and constellations | Finn picks another name |
| 2026-09-28 | America server defaults (reset 04:00 UTC−5) | Finn plays in the US | Friends on other servers |
| 2026-09-28 | Renamed to "Starfall" | Names the gold 5★ wish meteor — the moment the app exists to predict; an ordinary English word, so low trademark risk for a fan project | Finn picks another name |
| 2026-09-28 | `--faint` lightened from `#6c70a3` to `#8789c0` | Old value measured 3.70:1 on `--ink` and 3.27:1 on `--well`, under the 4.5:1 floor DESIGN.md sets. New value measures 5.26:1 and 4.64:1 — the smallest lift clearing both, still well under `--dim`’s 7.26:1 so the text hierarchy survives. Chart axis text also went 11px → 12px | A palette rework |
| 2026-09-28 | Steppers use `type="text" inputmode="numeric"` with hand-written `role="spinbutton"` ARIA | Native `<input type="number">` cannot display thousands separators, and "11,200" is far easier to read than "11200" on a phone. DESIGN.md’s accessibility line was amended to match | A native control gains formatting |
| 2026-09-28 | pnpm enabled via `corepack`, pinned in `packageManager` | pnpm was not installed; corepack ships with Node 24, needs no global install, and pins the version per-repo | Corepack is removed from Node |
