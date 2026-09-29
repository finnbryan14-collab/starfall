# Design direction

Astrolabe should feel like a navigator's instrument for the night sky: calm, precise, and a little beautiful. The app answers questions about chance ("will I get her?", "is this worth leveling?"), so the design treats probability as the main character and everything else as quiet support.

Open `design/preview.html` in a browser before building any screen. It is the visual reference for this document, with working math and the real motion. When this document and the preview disagree, this document wins; update the preview afterward.

## The idea in one sentence

Every screen gives one answer in a large Bodoni numeral and shows where that answer came from as a line of light across a star chart.

## Why these choices

- **Night indigo, not black.** Genshin's own interface lives in dark blue and gold, and wishes are literally stars. We borrow that vernacular so the app feels at home next to the game, without copying any of its UI art.
- **Gold means something.** Gold, violet, and blue are the colors of the 5★, 4★, and 3★ wish meteors. We only use them to encode rarity or "the thing you're aiming for." Gold is never decoration.
- **Bodoni numerals.** High-contrast Didone figures read like an old star catalogue or almanac. They make a percentage feel like a measured reading rather than a dashboard stat. Bodoni is display-only: 28px and up.
- **Source Sans 3 for everything else.** Quiet, legible at 14px on a phone, with true tabular figures so columns of numbers line up.

## Tokens

All values live in `design/tokens.css`. Copy it into `src/styles/tokens.css` and map it into Tailwind's theme. Never hardcode a hex value in a component.

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#141739` | Page background |
| `--well` | `#1c2050` | Input wells, sheets |
| `--rule` | `#30357a` | Hairlines that group content |
| `--starlight` | `#ece6d6` | Primary text |
| `--dim` | `#a2a5cc` | Secondary text |
| `--gold` | `#e7b75f` | 5★, the target, primary action |
| `--violet` | `#b18cf0` | 4★ |
| `--blue` | `#74a9ee` | 3★ |
| `--feed` | `#e4708a` | "Feed it" verdicts, destructive actions |

Element colors (`--pyro` … `--geo`) appear only on small element tags next to character names.

### Type scale

Major third (1.25) from a 16px base. Line lengths stay under 70 characters. Body text is 16px with 1.5 line height; secondary text is 14px.

| Use | Face | Size | Notes |
|---|---|---|---|
| The answer (one per screen) | Bodoni Moda 500 | `--t-hero` (76px) | Tabular, tight tracking (-0.02em) |
| Screen title | Bodoni Moda 500 italic | `--t-2xl` | Sentence case |
| Section heading | Source Sans 3 600 | `--t-lg` | Sentence case, never all caps |
| Body | Source Sans 3 400 | `--t-md` | |
| Secondary, axis labels | Source Sans 3 400 | `--t-sm` / `--t-xs` | `--dim` or `--faint` |

Load fonts with `next/font/google` so there is no layout shift.

## Layout

Mobile first. A single reading column (`--column`, 460px max) with a 16px gutter. Content is left-aligned. On screens 1024px and wider, a left rail replaces the bottom bar and the column gains a second pane for inputs.

Group content with space and hairline rules (`--rule`), not boxes. The only filled surfaces are input wells and bottom sheets. There are no card grids with identical shadows.

```
Mobile (390 wide)                     Desktop (≥1024)
┌──────────────────────────┐          ┌─────┬──────────────────┬──────────────┐
│ Astrolabe          (UID) │          │     │ Skirk returns    │ Your stash   │
│                          │          │ ✦   │ Oct 13           │ Primogems    │
│ Skirk returns Oct 13     │          │ ◇   │                  │ Fates        │
│ 72.9%                    │          │ ⧗   │ 72.9%            │ Pity         │
│ chance you get her       │          │ ◎   │ [ Fate Dial ]    │ 50/50        │
│ [ Fate Dial chart ]      │          │     │ C0  C1  C2       │ Income       │
│ C0 73%  C1 16%  C2 2%    │          │     │                  │              │
│ ──────────────────────── │          │     │                  │              │
│ Primogems      − 11,200 +│          │     │                  │              │
│ Fates          −     14 +│          └─────┴──────────────────┴──────────────┘
│ Pity           −     22 +│
│ 50/50   [Not guar.|Guar.]│
│ Income by Oct 13  +3,850 │
├──────────────────────────┤
│  Plan  Artifacts  Timers  Account │
└──────────────────────────┘
```

Navigation has four destinations: **Plan** (wish planner), **Artifacts** (keep-or-trash and resin estimator), **Timers**, and **Account** (UID import, wish history import, backups).

## Signature element: the Fate Dial

The wish planner's chart. X is pulls, Y is the chance you've gotten the target by that pull.

- The full curve is drawn in `--faint` as a thin line: what's possible.
- The part you can afford (0 → your pulls) is drawn in `--gold` with a soft gold wash beneath it: what's yours.
- A small meteor (gold dot with a short glow) sits where your pulls meet the curve.
- A single 50% hairline and a pull axis with three or four ticks. No other gridlines, no legend.

When inputs change, the gold segment redraws from zero, the meteor rides along it to its new spot, and the big numeral counts to the new value. That is the app's one orchestrated moment. It runs on load and on change, never on a loop.

## Motion

Motion explains a change the person caused. Nothing moves on its own except countdown text.

**Library:** anime.js v4 (`animejs` on npm). In React, wrap each animated component with `createScope({ root })` inside `useEffect` and call `scope.revert()` on cleanup (this is the official React pattern). Put shared helpers in `src/motion/`.

| Moment | Trigger | anime.js tools | Duration |
|---|---|---|---|
| Fate Dial redraw | Load, input change | `svg.createDrawable` on the gold path (`draw: '0 0' → '0 1'`), `svg.createMotionPath` for the meteor, number tween on a JS object with `onUpdate` | `--d-signature` |
| Constellation chances (C0/C1/C2) | After the meteor lands | `stagger(60)` on opacity and a 4px rise | 360ms |
| Keep-or-trash histogram | Artifacts tab opens, goal changes | `stagger(24, { from: 'first' })` on bar `scaleY` from 0 | 520ms total |
| "Roll to +20" sample | Button press | `scrambleText({ text, chars: '0-9' })` on each substat's number (via `innerHTML`) | 700ms |
| Resin ring | Timers tab opens | `createDrawable` on the ring arc | 700ms |
| Tab change | Nav tap | `animate` opacity 0→1 and `translateY` 8px→0 on the incoming panel only | `--d-move` |

**Easing:** `out(3)` for things arriving, `inOut(2)` for things traveling, `spring({ bounce: 0.25 })` only for toggles.

**Reduced motion:** check `matchMedia('(prefers-reduced-motion: reduce)')` in the motion helpers and jump straight to final states. The CSS tokens already zero the durations.

**Never:** scroll-triggered fade-ups on every section, hover lifts on every row, looping ambient animation, parallax, confetti.

**Gotchas found while building the preview (anime.js 4.5):**
- `scrambleText` must target `innerHTML`, and a trailing `%` in the text gets treated as a unit and doubled. Keep units in a sibling element and scramble only the number.
- Timeline children don't apply their `from` values until they start. Anything that should appear later (the gold wash, the "your 108" label, the constellation row) needs `opacity: 0` set before the timeline begins, or it flashes in at full opacity first.
- `svg.createMotionPath(path)` works on an SVG `<g>` inside the same SVG with no extra scaling math; place the group's children at the origin.
- Recreate `svg.createDrawable(path)` each time the path's `d` changes so the dash length matches the new geometry.

## Components

- **Stepper row.** Label left, value right in tabular figures, − and + buttons (44px). Tapping the value opens a numeric keypad. Long-press repeats.
- **Segmented control.** Two or three options in a pill; the selected option fills with `--well-2` and a gold underline.
- **Answer block.** Screen title (Bodoni italic), the numeral (Bodoni hero), then one plain sentence saying what the number means and what to do.
- **Verdict.** Uses the same answer block. The verdict word ("Level it", "Level to +8, then decide", "Feed it") is set in the verdict color.
- **Substat line.** Stat name left, value right, a thin bar behind the value showing roll value (share of max possible).
- **Timer row.** Name, state ("Ready", "Full in 7 h 36 min"), and a thin progress line in `--rule` filled with `--starlight` (gold only when ready).
- **Bottom sheet.** For editing income assumptions, importing, and settings. `--r-sheet` top corners, drag handle, focus trapped.
- **Character chip.** Small portrait from Enka's asset CDN, name, element tag.

## Copy

Plain, specific, sentence case. Answers are sentences a friend would say.

- "72.9% chance you get Skirk by Oct 13." not "Success probability: 72.9%".
- "Level it" / "Feed it" not "Recommended action: Enhance".
- Errors say what happened and what to do: "That UID isn't showing any characters. Turn on your in-game character showcase, then try again."
- Empty states invite the next step: "Add your primogems to see your odds."
- Buttons name the action and keep the name through the flow: "Import wishes" → toast "Wishes imported".

## Accessibility floor

- Text contrast at least 4.5:1 on `--ink` and `--well` (check `--faint` only for 12px+ non-essential labels).
- Rarity is never shown by color alone; pair it with ★ counts.
- Visible focus ring: 2px `--gold` outline with 2px offset.
- Charts have an `aria-label` sentence with the key number, plus a visually hidden table of the curve at 10-pull steps.
- All inputs have labels; steppers expose `role="spinbutton"` semantics via native `<input type="number">`.

## Assets and branding

- The name, wordmark, and icons are original. Do not use HoYoverse logos or UI art.
- Character portraits and item icons come from Enka.Network's asset URLs or genshin-db, which fan tools commonly use. Show the standard fan-site notice in Account and the footer: "Astrolabe is a fan project and is not affiliated with HoYoverse. Game content and materials are trademarks and copyrights of HoYoverse."
