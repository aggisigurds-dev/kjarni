# TurboPaint — QA gate after PR #205 (2026-10-14)

Branch: `improve-wall-detection-qa-2`. This checklist documents verification work; it does not change geometry, saved drawings, or production settings.

## Previously reported (PR #205)
- 34 targeted tests passed locally, according to the PR description. **Not rerun on this branch.**
- Two Vercel status checks succeeded on the PR head before merge. **Not evidence of browser accuracy.**
- PR #205 was squash-merged as `a2074270ea09a52ba68c2cb06bbebc5691004616`.

## Required before the next merge
- [ ] Run targeted `hurdagreining-snuning`, `hus3d`, `hus3d-smasamkeyti`, `hus3d-gluggar`, and PDF tests; record command, environment, pass/fail counts.
- [ ] Check rotated (~4.6° and 94.6°) and axis-aligned plans with and without door arcs; assert no unconfirmed gap becomes a door.
- [ ] Inspect Dalshraun 1 original source PDF against detected wall/door/glass overlay; record false positives and missing features.
- [ ] Confirm short wall segments do not represent furniture, dimensions or annotations before showing all of them.
- [ ] Verify ≤10 cm bridge is visual-only, does not cross a tagged door/glass opening, and does not persist altered wall geometry.
- [ ] Check Teikningar → TurboPaint → Teikningar round trip and fire equipment marker coordinates using test-only records.
- [ ] Review Vercel preview visually on desktop and mobile; record screenshots and deployment URL.
- [ ] Benchmark huge TIFF and scanned-PDF imports before claiming support.

## Scope
Do not alter main, production Netlify, Supabase data, or company drawings in this QA phase. All checks above remain **unverified** until executed and recorded.
