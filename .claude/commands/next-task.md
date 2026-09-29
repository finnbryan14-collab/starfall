---
description: Pick up the next unchecked task in docs/ROADMAP.md and complete it
---

1. Open `docs/ROADMAP.md` and find the first unchecked task (`- [ ]`).
2. Tell me which task you're starting in one line.
3. Read every doc section the task mentions (SPEC, MATH, DATA, DESIGN) and look at `design/preview.html` for any UI work.
4. Follow the workflow in `CLAUDE.md`: engine tests first, then engine, then UI.
5. Verify the task's "done when" condition. Run `pnpm test` and `pnpm lint`. For UI, take Playwright screenshots at 390×844 and 1280×800.
6. Check the box in `docs/ROADMAP.md`, append any judgment calls to `docs/DECISIONS.md`, and commit.
7. Summarize what changed in two or three sentences and name the next task.

$ARGUMENTS
