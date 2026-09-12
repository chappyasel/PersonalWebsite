# Illustrated room integration

The room starts as a usable illustration. Its navigation and reader stay mounted while WebGL loads behind it. Once the renderer proves it matches the drawing, the drawing dissolves and the camera moves into the ordinary 3D view. If WebGL fails, visitors can keep using the illustrated room.

This implements the approved direction on `feat/illustrated-room`, based on `f54e6e2`. The earlier experiments remain on `prototype/illustrated-room-review`, `prototype/boot-geometry`, and `prototype/boot-render-masks`.

## Behavior

- About keeps its original SVG and book covers. The other six shelves use the approved captures, packaged as 24 self-contained SVGs across two themes and two viewport sizes. Background props stay out of the drawings.
- Server-rendered route selection chooses the first shelf. Hash stops switch after hydration. CSS selects the initial theme and viewport variant without making the routes dynamic or downloading every drawing.
- The existing reader, links, navigation, history, and focus remain available during loading, transition, and WebGL failure. A stalled or failed image cannot keep the server shell over the hydrated reader.
- Actual input during startup holds the illustrated view. An explicit "Enter 3D room" action can retry. A geometry or content mismatch also holds the illustration; explicit retry can enter the ordinary 3D view without the matched transition.
- Reduced motion and data-saving preferences retain the semantic document experience. Golf retains its existing boot because it is a fractional stop between shelves.
- The Scene Diagnostics panel has a live illustration-handoff control. Its off path avoids registration traversal and per-frame handoff work.

## Matching and animation

One boot state machine owns `illustrated`, `dissolve`, `travel`, and `live`. Assets settling and the first frame are necessary but insufficient. The active shelf must pass the saved geometry, pose, content, and projection checks, then paint two matching frames for the current artwork key and recovery epoch.

The renderer projects the saved camera through the actual image and canvas rectangles. It compares live geometry against immutable captured probe coordinates with a 3 CSS pixel maximum. Pending nested Suspense content retries within the normal boot deadline. A missing mesh does not become proof of a successful match.

During the 160 ms dissolve, the camera and captured shelf pose stay fixed. Camera travel starts at 180 ms and runs for 400 ms into the ordinary live camera pose. Readiness and analytics publish after the renderer paints the arrival frame. Context loss returns to the same reader without replacing its DOM tree.

## Artifact integrity

The approved SVG bytes are unchanged. The generator packages texture details, registration metadata, and a browser-free source fingerprint. Runtime code fetches only the selected SVG and registration file. There are 483 embedded image details across the 24 drawings. SVG payload totals 1,636,199 bytes before compression and 873,824 bytes with gzip.

Two metadata repairs preserve the capture evidence:

- Systems' clock hand rotations come from the exact archived captures. Tests reconstruct the transforms and pin the original SVG, pose, and probe hashes.
- Books identity version 2 excludes sampled palette colors. Production cover-color timeouts changed three spine colors without changing their books or geometry. Selection, order, cover URLs, titles, authors, and dimensions still determine identity. The exact version 1 preimage and original SHA remain recorded, and generation verifies them before deriving version 2.

`pnpm check:room-artwork` joins `verify:artifacts`. A content or source change that invalidates the drawing must be reviewed and regenerated; runtime matching does not silently bless a new scene.

## Verification

The compact measurements are in [the evidence summary](illustrated-room-integration-evidence/summary.json). Full frames and traces remain local under its ignored `raw/` directory.

- All 28 combinations of seven shelves, light/dark themes, and 1440×900 or 390×844 viewports reached the live room. The largest measured projection residual was 0.001509 CSS pixels. Dissolve camera and projection matrices stayed fixed, with no early readiness, JavaScript errors, or horizontal overflow.
- All seven production shelf smoke checks reached the live room without JavaScript errors or a remaining illustrated overlay. These checks run without the development scene registry.
- Six recovery checks passed: unavailable WebGL with navigation and history, real context loss with reader state preserved, stale registration with explicit retry, stalled image decode, failed image with explicit retry, and reduced motion without a Canvas.
- Browser checks use headless Chromium with native Metal rendering and the ordinary automatic quality policy. These measurements validate geometric registration on this machine; they do not claim coverage of every browser or device.
- Full TypeScript and ESLint checks passed, along with 3,932 tests across 465 test files, with eight tests skipped. Search-index, meadow, About drawing, and room-artwork checks passed. The full production build and its search and weight-log boundary checks passed. Room routes remain static.

Run the checks with the repository's Node 24 runtime:

```sh
pnpm verify
pnpm check:about-boot
pnpm check:room-artwork
pnpm build
node scripts/verify-illustrated-room.mjs --base=http://localhost:3334 --route=/#books --label=production-books --gpu=native
node scripts/verify-illustrated-room-recovery.mjs
```

The homepage OG freshness receipt was already stale at the base commit, with 111 watched files differing and no image drift. The integration adds watched source changes. OG recapture is separate from this boot change; `verify:artifacts` still reports that existing receipt warning.

## Field Notes

No discovery is added. Automatic loading, fallback, and camera arrival fail achievement quality-bar test 2, which requires a qualifying action with meaning beyond incrementing a counter. Visitors do not earn an achievement for their device losing WebGL or for waiting for the room to load.
