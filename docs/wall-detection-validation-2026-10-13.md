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

## Rotated drawing door detection (14 October)

Read-only inspection of Dalshraun 1 / first-floor saved geometry:
- Wall angles include visible groups near **4.6°**, **94.6°** and other small rotations.
- Earlier `finnaHurdir` uses `asStefna(...,1.5)`, rejecting most of these as non-axis-aligned and leaving many possible door openings unexamined.
- Added `hurdagreining-snuning.ts`: estimate candidate rotations near ±2–15°, rotate coordinates temporarily, run the established door-gap detector with image callbacks in original coordinates, then rotate accepted geometries back.
- **Conservative by design**: supplemental rotated candidates become actual door objects only with a positive door-arc verification callback. No arc ⇒ diagnostics only, not a saved door.
- Added synthetic regression cases for a 4.6° rotated plan with and without arc evidence and for axis-aligned plan compatibility.
- Connected to the automatic workflow on the preview branch; no changes to existing company data.
- This is not yet a measured Dalshraun door-detection recall improvement, because the source PDF could not be retrieved for a controlled image-level comparison.

Large source documents must be processed separately; rotated-gap checks operate on compact extracted segments, not the original 130 MB image.

## Visualization-only repair of tiny gaps (14 October, night batch)

- Added `hus3d-smasamkeyti.ts`: connects only facing, nearly collinear **solid** wall endpoints with gaps of no more than **10 cm** in the current 3D scale.
- Does not join glass, door objects, EI classes that differ, isolated short noise, or segments where the gap midpoint overlaps tagged glazing/doors.
- Uses an endpoint spatial grid, a one-endpoint-to-one-endpoint assignment and produces **new temporary 3D fragments only**. Source polylines in Supabase/Teikningar are never rewritten.
- New **Tengja smábil** on/off switch in the TurboPaint 3D viewer, enabled by default and reversible.
- Tested with a tilted 4.6° collinear wall pair, door gap, window gap, perpendicular non-match, >10 cm gap, and immutable input.
- Locally executed combined TypeScript-on-the-fly test set for `hus3d.test.ts`, `hus3d-smasamkeyti.test.ts`, `hurdagreining-snuning.test.ts`, and `hurdagreining.test.ts`: **34 passed, 0 failed**.
- The Vercel preview build succeeded for renderer commit `5a8d546f81ef057554daf7bb2eb9dd82b3f090a1`. A build does not establish that missing real wall geometry was recovered; larger gaps still require analysis/manual review.


## Norðurhella 17 — uploaded A-102 screenshot-PDF, 14 October

**Source:** user-uploaded `nordurhella-17 (1).pdf` (1 page, 2432 × 1315 px). It has exactly one embedded raster image, **zero vector draw operations**, and no extracted text. It is *not* the requested Dalshraun 1 original PDF. Do not add this user-supplied document to the public repository.

**Reproducible read-only experiment:** raster source was cropped to building review area at `x=140..1940, y=125..880` (1800 × 755 grayscale pixels), and sent directly to the current `skonnunarVeggir` pipeline with `kvardi=1`, `fb=1800`, `fh=755`. Local code bytes for both `skonnun-veggir.ts` and `veggja-linur.ts` were verified identical to the development branch at test time.

| Image scan configuration | Wall line candidates | Door gap candidates | Glass candidates |
|---|---:|---:|---:|
| Current filtering (default) | 48 | 10 | 0 |
| Disable final wall verification (`anSiu:true`) | 203 | 40 | 0 |
| `fylla:true` | 29 | 8 | 0 |
| `thykkt:2` without fill | 0 | 0 | 0 |

**Findings:** permissive extraction expands coverage but visibly hallucinates long lines outside/around the curved building, including non-wall site geometry. Conservative extraction misses clearly visible exterior and interior segments. Door candidates are not verified door symbols, and no glass candidates were detected. The root problem is precision/recall tradeoff on a low-resolution raster map, compounded by unreliable building-area segmentation. Do **not** turn off the quality filter automatically, turn all candidates into saved walls, or claim that improving 3D extrusion repairs absent 2D geometry.

**Recommended follow-up:**
1. Select/confirm actual building extent before interpreting scanned lines; exclude site/parking dimensions.
2. Introduce a review-only candidate layer (strong walls vs possible walls vs possible door openings), never auto-save weak candidates.
3. Validate potential doors against arcs and openings visible in source; preserve gaps where doors are proven.
4. Obtain the original *Dalshraun 1* PDF (Hfj_0801115.pdf, first floor) for specific Dalshraun improvements. This Norðurhella A-102 scan cannot validate them.

Screenshots produced locally (not committed to public repo) to avoid publishing user-supplied drawing. No writes to production database.
