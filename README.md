# Starfall

Planning package for a Genshin Impact companion app, ready for Claude Code.

**v1:** a wish planner that tells you your actual odds of getting a character by a date, an artifact keep-or-trash scorer, a resin estimator for farming replacements, and daily timers.

## Start building

1. Unzip this folder somewhere you keep projects and open it in Claude Code (terminal, desktop, or web).
2. Say: **"Read CLAUDE.md, then run /next-task."**
3. Keep running `/next-task`. Each one completes a single checkbox in `docs/ROADMAP.md`.

Open `design/preview.html` in a browser (it needs internet for fonts and anime.js) to see the target look and motion. Its numbers are real: it runs the same probability models described in `docs/MATH.md`. Try the steppers on the Plan tab and "Roll to +20" on the Artifacts tab.

## Assumptions (change these first if they're wrong)

- Installable web app for phone and laptop, not a native app
- For you and friends first, not a public launch
- America server
- Name: Starfall (settled; see docs/DECISIONS.md)

Edit `docs/DECISIONS.md` and tell Claude Code what changed.

## What's inside

```
CLAUDE.md                 Instructions Claude Code reads every session
.claude/commands/         /next-task command
design/preview.html       Visual reference with working math and anime.js motion
design/tokens.css         Colors, type, spacing, motion tokens
docs/SPEC.md              v1 features and acceptance criteria
docs/ROADMAP.md           Ordered task list (Phases 0–5)
docs/MATH.md              Pity, 50/50, constellation, artifact, and resin models with tests
docs/DATA.md              Enka, wish history, GOOD import, static data, storage
docs/DESIGN.md            Visual direction, motion system, copy rules
docs/DECISIONS.md         Decision log
docs/BACKLOG.md           Everything saved for after v1
```
