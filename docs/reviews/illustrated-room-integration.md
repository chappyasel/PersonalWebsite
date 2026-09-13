# Illustrated room integration

The room opens with an empty illustrated shelf. Its objects assemble in a stagger, then the drawing grows into its final frame and the cards and navigation appear. Those controls stay mounted while WebGL loads behind the illustration. The drawing dissolves into the ready room with the camera already at its ordinary resting pose. If WebGL fails, visitors can keep using the illustrated room.

This implements the approved direction on `feat/illustrated-room`, based on `f54e6e2`. The earlier experiments remain on `prototype/illustrated-room-review`, `prototype/boot-geometry`, and `prototype/boot-render-masks`.

## Behavior

- About keeps its original SVG and book covers. The other six shelves use the approved captures, packaged as 24 self-contained SVGs across two themes and two viewport sizes. Background props stay out of the drawings.
- Server-rendered route selection chooses the first shelf. Hash stops switch after hydration. CSS selects the initial theme and viewport variant without making the routes dynamic or downloading every drawing.
- The existing reader, links, navigation, history, and focus remain available during loading, transition, and WebGL failure. A stalled or failed image cannot keep the server shell over the hydrated reader.
- Ordinary reader input leaves automatic entry enabled. Wheel travel and native phone swipes move a horizontal row of illustrated shelves. Registration waits until travel settles, and the hidden 3D camera adopts the selected shelf before promotion. A projection mismatch uses an automatic stationary fade. Renderer failures or invalid artwork evidence expose a "Retry 3D" action.
- Reduced motion and data-saving preferences retain the semantic document experience. Golf retains its existing boot because it is a fractional stop between shelves.
- The Scene Diagnostics panel has a live illustration-handoff control. Its off path avoids registration traversal and per-frame handoff work.

## Matching and animation

One boot state machine owns illustration, dissolve, a final painted-frame acknowledgement, and the live room. Assets settling and the first frame are necessary but insufficient. The active shelf must pass the saved geometry, pose, and content checks, then paint two resting frames for the current artwork key and recovery epoch. Projection alignment determines whether the handoff is recorded as matched or as an ordinary fade; it does not decide whether a working renderer stays mounted.

First paint and hydration derive each drawing's final box from the ordinary resting camera. The entrance applies a temporary uniform transform to that box. The six captured shelves use a uniform scale and translation fitted from their immutable captured probe coordinates. About projects its shelf geometry, landmark anchors, and reading covers through the viewport camera while retaining its approved glyph paths. Runtime registration compares the resulting image against mounted geometry through the actual resting camera, with a 3 CSS pixel maximum for a matched handoff. Finite projection residuals above that limit use the same stationary dissolve without claiming an exact match. Pending nested Suspense content retries within the normal boot deadline. A missing mesh does not become proof of a successful match.

During the 160 ms dissolve, the ordinary resting camera and captured shelf pose stay fixed. There is no camera travel or lens interpolation. After the dissolve, the renderer paints an ordinary frame before publishing readiness. Pointer parallax and idle camera motion resume only after promotion. Context loss returns to the same reader without replacing its DOM tree.

## Artifact integrity

The approved SVG bytes are unchanged. The generator packages texture details, registration metadata, and a browser-free source fingerprint. Runtime code fetches the selected and adjacent SVGs for continuous scrolling, and only the selected registration file. There are 483 embedded image details across the 24 drawings. SVG payload totals 1,636,199 bytes before compression and 873,824 bytes with gzip.

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

No discovery is added. Scrolling preserves the existing room navigation rather than introducing a new discovery. Automatic loading, fallback, and camera arrival fail achievement quality-bar test 2, which requires a qualifying action with meaning beyond incrementing a counter. Visitors do not earn an achievement for their device losing WebGL or for waiting for the room to load.

## Feedback checkpoint after 46b4953

The first checkpoint incorrectly treated any click, key, or wheel event as a permanent request to stay in 2D. Its hidden camera also adopted the selected shelf only after promotion, allowing the transition to visit About before moving back. Regression tests now require automatic promotion after navigation and reject registration while the ordinary camera is at another shelf.

The illustrated view now shares a static sky, horizon haze, and meadow across its horizontal shelf row. Artwork grows to the available stage bounds with a 700px physical shelf cap. Phone swipes and desktop wheel input use the existing room gesture exclusions, preserving reader scrolling, search overlays, and browser pinch zoom. The scroller waits for the initial URL selection and snaps directly to that shelf. Rail navigation retains its requested destination until smooth scrolling finishes, so a delayed image or queued scroll event cannot snap back to the previous shelf. Only the active phone sheet paints its title; inactive sheets remain mounted and measurable.

The feedback audit exercises a section change during delayed renderer registration, no-WebGL wheel travel, and a native phone swipe. It checks automatic arrival on Systems without an About detour, the correct URL and active shelf, a settled artwork rectangle, the atmospheric background, and inactive phone sheet visibility. All three cases passed headlessly. All six recovery cases also passed against the rebuilt production app, including navigation with an indefinitely stalled Projects image and automatic recovery after context loss. The updated suite passes 3,941 tests across 466 files, with eight tests skipped. TypeScript, ESLint, artwork freshness, and the production build passed.

```sh
node scripts/verify-illustrated-room-feedback.mjs
```

For visual review, `/projects` exercises normal automatic entry. `/projects?hold-boot=1` keeps the illustrated room available for scrolling and layout feedback. The hold is a review switch; normal visits enter 3D automatically.

## Dissolve-in-place checkpoint after 8d45705

Loading uses an abstract sky-to-ground gradient with a small "Loading 3D…" status and "You can explore while it loads." The status stays visible through the dissolve. A settled fallback restores the illustrated meadow and shows "2D view" with an optional retry action.

The drawing starts at the resting 3D camera's scale and position. Both the parser-time script and hydrated layout run the same projection functions, without requiring WebGL. SVG bytes for the six captured shelves are unchanged. Generated metadata now includes immutable world-space layout probes derived from the original capture, not a new prop list.

Touch-down, continuous wheel input, and rail travel synchronously block renderer acknowledgement. React also invalidates registration while a reader panel is expanded, a modal is open, the active shelf changes, or the artwork's viewport rectangle changes. A stale decode, registration promise, or painted-frame callback cannot promote the previous drawing. Scrolling at the row boundary still holds the transition until input stops.

The same held-touch audit exposed a timing race independent of gesture handling. A fractional timeout could fire before the dissolve deadline, leaving the phase unchanged with no timer to advance it. The adapter now rounds the delay upward and rechecks the clock on every wake. Regression tests reproduce the original stall, verify an early wake rearms, and verify unmount cancels that rearmed timer. The live surroundings now render under the fading atmosphere so they do not appear abruptly on the final frame.

The full suite passes 3,969 tests across 468 files, with eight tests skipped. Independent Three.js tests cover all seven resting cameras, both artwork themes, first-paint serialization, and representative desktop and phone viewports. Headless development checks measured a 0.5005px Projects residual and a 0.0174px About phone residual; camera and projection matrices did not change during either dissolve. Four held-touch runs and four continuous-wheel runs resumed automatic entry after settling in the production build, without additional input. Production evidence is recorded in the summary alongside the route and recovery results.

A remaining limit belongs to the saved image variants. At some portrait tablet proportions, neither frozen capture fits the ordinary camera within 3px. The app retains its complete 2D view and offers explicit retry rather than automatically showing a misaligned handoff. Tests pin this behavior at 600×900, 820×1180, and 1024×1366. Exact matching at those proportions requires additional capture views or reprojectable artwork. The first-load correction below supersedes the decision to retain 2D solely for an alignment miss. About's frozen glyph interiors remain an artistic approximation; its measured shelf corners and anchors are not a claim about every glyph pixel.

No new Field Note qualifies. Automatic presentation and loading still fail quality-bar test 2.

## First-load and entrance correction after b35243d

The previous checkpoint incorrectly treated a viewport alignment miss as a loading failure. Projects at 1200×900 loaded successfully, missed the saved drawing by 5.00px, and then unmounted its ready renderer. It now paints two ordinary resting frames and enters automatically. The state machine records that ordinary-frame proof separately from a successful 3px match. Stale keys, held gestures, unfinished props, and invalid capture identities retain their existing checks.

The UI enters once per resident room. The shelf appears first, the content rises 12px into place, and the navigation follows with a 6px rise. Interaction or reduced motion ends the entrance immediately. Shelf navigation and renderer retries do not replay it. Only the content and navigation move; the measured artwork box remains fixed.

Loading and completed 2D views show the wordmark, theme switch, navigation, and reader. Field Notes, sound, and scene shortcuts appear when 3D becomes live. The live Scene Diagnostics panel remains available. Automatic loading and presentation do not qualify for a new Field Note under quality-bar test 2.

A separate math experiment ruled out a global affine or projective warp as a reliable alignment fix. The saved views contain objects at different depths. Fitting a few anchors distorted other parts of the shelf without meeting the 3px limit across common window sizes. Uniform artwork placement remains unchanged.

Production checks pass for cold Projects loads at 1200×900, 1024×768, 2560×1440, and 820×1180, plus Books at 1200×900. Desktop and phone entrance checks confirm the shelf-first sequence, initially hidden cards and navigation, zero artwork movement, usable theme switching, and restored mute preferences before live presentation. The 354 focused boot and illustration tests pass, along with TypeScript, lint, artwork freshness, and the final production build.

## Restored shelf assembly after b61a481

The owner asked to restore the original empty shelf, staggered objects, and zoom into place while retaining the usable 2D fallback. The entrance now waits for initial URL selection, reveals the selected shelf's existing SVG object groups, grows the drawing from a centered 78% scale into its ordinary camera frame, and then introduces the cards and navigation. About uses its existing landmark cadence and reading-cover geometry. The six captured shelves borrow their approved SVG groups during the entrance, then return to their unchanged static images.

First paint and hydrated asset preparation show the same empty shelf. The generator extracts 24 shelf-only SVGs from the approved drawings; no shelf geometry is authored separately. These add 23,270 bytes gzip across all themes and viewport variants. The original drawing bytes remain unchanged. Embedded photos and book covers decode before the item timelines begin.

Both registration publishers withhold the artwork key until the entrance completes, then measure the final untransformed drawing. A ready renderer waits behind the complete entrance; a slow renderer leaves the finished 2D room available. Pointer, touch, wheel, key, and resize input can settle the entrance immediately, while the existing scrolling barrier continues to prevent a mid-gesture handoff. Hidden tabs pause active animation timelines. Reduced motion skips assembly. A failed or stalled entrance asset releases the reader within a bounded preparation window, and stale callbacks cannot insert an overlay or register the old shelf. Hidden cards and navigation do not accept pointer input.

The 445 focused tests cover boot, illustration, About drawing, and artwork generation. TypeScript, targeted ESLint, artifact freshness, and the production build pass. All 14 headless entrance cases pass across seven shelves at desktop and phone sizes. The audit checks the empty shelf, visible item stagger, final placement, delayed controls, URL selection, and registration only after completion. All five normal cold entries reach 3D automatically without JavaScript errors. After the final CSS build, both Projects entrance sizes pass again. Held-touch and continuous-wheel checks keep 2D visible during input and enter 3D automatically after release.

No Field Note is added. This automatic presentation still fails achievement quality-bar test 2 because there is no qualifying visitor action.

## Reading order, color, and spacing after 2cc3cbb

SVG paint order made Talks start at the far-right plant. Entrance timing now follows measured visual rows, left to right and then down, including About. Vertical overlap keeps short and tall neighbors in the same row. The DOM paint order remains unchanged, so overlapping drawings keep their approved appearance.

The illustrated view's foreground override caused navigation and desktop titles to change from gray to white at the handoff. Both views now use ChromeLayer and PlacardLayer's existing theme colors. The same measured colors persist through the live transition.

Viewport-wide stops left 673px between Talks and its neighbor on desktop and overlapped them by 11px on phone. Stop distances now follow the projected artwork bounds, leaving 48px on phone and up to 96px on desktop. The last stop retains enough trailing space to reach its camera frame. Native scrolling, rail commands, and touch settling all use these distances. Neighbor drawings wait until the centered entrance has finished placing the selected shelf.

The 111 illustration tests pass, including visual reveal order, unequal travel distances, and light/dark artwork gaps at phone, desktop, and wide desktop sizes. TypeScript, targeted lint, artwork freshness, and the production build pass. Headless checks confirm ordered Talks reveals, stable colors, and automatic entry in both themes on desktop and phone. Navigation during loading, fallback wheel travel, and native phone swipes pass.

No Field Note is added. Presentation and spacing changes still fail quality-bar test 2.
