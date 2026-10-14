# Wall detection — validation notes (13 October 2026)

Branch: `improve-wall-detection`. This is an experimental branch; **do not merge or deploy to production without reviewing representative PDF/TIFF drawings**.

## What was tested

### Fiskislóð 41 — vector-line regression fixture

Source: `apps/slokkvitaeki/app/kjarni/turbopaint/lib/board/fixtures/fiskislod41-1haed.json` (original stroke geometry supplied with Kjarni).
- 776 strokes in the primary 0.48 pt class.
- Existing primary PDF reconstruction: 62 wall segments.
- Multi-class reconstruction with the included synthetic non-wall groups: 62 segments, **0 unexpected additions**.
- This fixture is not a labeled ground-truth model, and 62 is **not** an accuracy score.
- Additional controlled dual-class case: two secondary-width interior partitions recovered.

### Norðurhella 17 — scanned PDF stress test

Source: original scanned user-provided PDF pages A02 and A03. Analyzed at 2200 px width using Kjarni's existing `skonnunarVeggir` pipeline.
- A02 / first floor: 156 detected wall segments on the *full page*; 114 segment midpoints within the building review region.
- A03 / second floor: 214 detected segments on the *full page*; 155 segment midpoints within the review region.
- Segment counts are **not** true-positive counts. The overlay still shows missed segments and false positives.
- Running the detector directly on a cropped bitmap yielded fewer segments; detect at full image resolution, **then** filter by building area as a safer default.
- This experiment evaluated the existing scan pipeline; it does **not** establish a scan-quality improvement from the vector patch.

## Local focused regression tests

The focused `pdf-veggir.test.ts`, `pdf-veggjaflokkar.test.ts` and `skonnun-veggir.test.ts` set: **22 passed, 0 failed** in a TypeScript-on-the-fly Node harness (local copy of the branch-equivalent detector).

Vercel preview deploys for `kjarni-3dwork` and `slokkvitaeki` reported success for commit `f8626ed5f1e0cdf4af41832a0b1beae9cbe78596`. Deployment success does not verify geometric accuracy.

## Required before merge

- Visually verify the multi-width detector on ordinary high-quality vector PDFs from multiple municipalities.
- Check that extra strokes do not create dimension lines as walls.
- Confirm glass, door gaps and original saved equipment positions are unchanged.
- Test large multipage TIFF scans and performance separately.
- Validate a full company-profile → TurboPaint → Teikningar round trip against a test record without touching live data.

The goal is one authoritative wall geometry model produced by TurboPaint, with Teikningar as the company-profile gateway.

## Dalshraun 1 — missing 3D walls (14 October)

From the existing *saved* TurboPaint board for `Reitir - Dalshraun 1 — 1. hæð` (read-only):
- 227 wall polylines: 180 plain, 46 glass-tagged, 1 door-tagged.
- The old `siaVeggiFyrirYfirlit` removes unclassified/non-fire short wall pieces whose length is below **7% of the building's longest dimension**. On this actual board 170 of the 180 plain wall polylines are shorter than the threshold (~171 board units).
- Thus the incomplete 3D model is **not only** a detection problem: most *already-saved* room partitions were being hidden at rendering time.
- In the 3D viewer, **Allir veggir** is now enabled by default. Turn it off to compare to the older simplified view. `husUrBordi` retains the original filtered default outside this opt-in 3D viewer mode.
- Regression test: old mode removes short fragments; detailed mode preserves all 10 test fragments. Local focused `hus3d.test.ts`: 21 passed.

Doors:
- The saved board has **one** door-tagged segment; missing doors cannot be reconstructed merely by improving the 3D renderer. Existing door segments now receive a reversible *illustrative* open door-leaf view, which does not modify saved geometry.
- Additional doors require better wall-gap / arc detection and visual verification on the original PDF. Do not invent doors in safety plans.

Large PDFs and TIFFs:
- This 3D change uses saved polylines, so it does **not** download or reprocess large documents. Separate streaming/tiling processing is still needed for giant source scans.

**The building remains incomplete; the change restores hidden saved walls rather than claiming to have found every missing wall.**
