# Per-unit boot screens and shelf OG cards

Status: plan, written 2026-09-11 on `prototype/major-route-transitions` for
Codex to review and implement. Nothing here is built. Every file, function,
and number below was read from the tree at f54e6e2; where the plan asserts a
measurement it says where it came from.

## Outcome

Every shelf gets the 2D loading screen About has today, drawn from the live
scene rather than by hand, chosen by URL before first paint, landing on the
live shelf the way About's does, and every room path unfurls with a card of
its own shelf. The system is one generator, one renderer, one freshness
check, and one preview page, so a future session adds or refreshes a shelf by
running a command rather than by drawing.

Concretely, when this is done:

- `/projects`, `/musings`, `/talks` open on a 2D drawing of that shelf that
  glides onto the live shelf, exactly as `/` does for About.
- `/#books`, `/#weightlifting`, `/#systems` (the three stops that are also
  real pages, ADR 0025) open on About's drawing for the first paint and swap
  to their own drawing once hydration reads the hash. The server never sees
  a hash, so this is the ceiling, not a shortcut.
- `/golf` opens centred on the Weightlifting drawing with no glide. The golf
  stop is a camera position between two shelves, not a shelf. Owner call
  below.
- `/projects`, `/musings`, `/talks`, `/golf` each carry a captured OG card of
  their shelf, made by the homepage card's generator with a unit parameter.
- `/admin/boot` (development only, 404 in production like `/admin/captions`)
  shows any unit's drawing at any viewport and theme, with arrow keys to
  page between the seven. It is the review surface for this work and for
  every later change to a shelf.
- `pnpm generate:room-boot:local` refreshes every drawing;
  `pnpm generate:room-og:local` refreshes every card; `pnpm verify:artifacts`
  says when either is stale without opening a browser.

## What exists today, and what the plan reuses

About's boot is hand-authored and owner-reviewed. The plan keeps it as it is
and reuses its machinery for the other six shelves.

| Piece                                      | Where                                                                                                                    | Reused how                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Boot stage (centred box, glide, pre-paint) | `boot/aboutBootStage.ts`                                                                                                 | Generalised to a unit index. The two self-contained functions keep their contract; per-unit numbers move into the geometry record they are handed. |
| Projector (one camera for every drawable)  | `scene/aboutBootPerspective.ts`, ADR 0024                                                                                | `projectAboutBootPoint` is already generic in its camera argument. Add `unitBootRestCamera(unitIndex)`.                                            |
| Placement and parallax                     | `dom/bootVignette.ts` (`bootPlacementStyle`, `bootParallaxStyle`)                                                        | Take a camera argument instead of reading `ABOUT_BOOT_CAMERA`.                                                                                     |
| Raster, trace, simplify                    | `scripts/generate-about-boot-silhouettes.mjs`                                                                            | `rasterize`, `trace`, `simplifyLoop`, `smoothLoopPath`, `expandRaster` move to `scripts/lib/silhouette.mjs` and both generators import them.       |
| Cadence, keyframes, wait notes, motes      | `dom/bootVignette.ts`, `dom/BootScreen.tsx`                                                                              | Unchanged. The generic renderer emits the same `stacks-boot-item` and `stacks-boot-item-motion` structure so the CSS and the reveal logic apply.   |
| Location routing                           | `ABOUT_BOOT_STAGE_LOCATION_ROUTING`, `data.ts` (`initialScenePositionFromLocation`)                                      | Returns a unit index instead of a boolean. One table, read by the pre-paint script, the stage, and the boot screen.                                |
| Headless capture harness                   | `scripts/generate/home-og-scene.mjs`, `home-og-local.mjs`                                                                | The build-and-serve wrapper, the `data-world="ready"` wait, the settle loop, the pixel-match tolerance, and the manifest pattern.                  |
| Scene registry                             | `Grabbable.tsx` names every prop's groups `nod:<hoverKey>` and `shade:<hoverKey>`; `window.__stacks` (`bbox`, `project`) | The extractor groups meshes by those names inside each unit root, through the same hooks the harness already uses. Works in a production build.    |
| Books drawing prototype                    | `route-transition-prototype/booksShelfDrawing.ts`, `BooksBootPrototype.tsx` (variant D)                                  | Its row projection becomes the Books unit's data-bound drawable. The `?variant=bookshelf` experiment retires.                                      |
| Solo unit and camera stills                | `scene/screenshotMode.ts`, `ScreenshotModeDriver.tsx`, `unitActivity.tsx` (`setSoloUnit`)                                | Gain a `screenshot-unit` parameter so the OG generator can capture any shelf alone.                                                                |

Measured on 2026-09-11 against a running dev server: the About boot block in
the homepage HTML is 110 KB raw and 19 KB gzipped. That is the budget
reference for one unit's drawing. Seven inline would be about 140 KB
gzipped, which is why each unit's artwork is its own chunk and the server
renders only the one the route asks for.

## The decision: extract from the live scene, do not re-author

Three ways were weighed.

**Hand-author six more drawings the way About was drawn.** About's drawing
accreted over about eight commits between 2026-08-21 and 2026-09-11 (git log
of `dom/BootScreen.tsx` and `boot/`), an ADR, and a sync document. The other
six units are 500 to 1,200 lines of r3f each with dozens of procedural props
(shakers, tubs, boards, the Macintosh, the lighthouse, phone screens, easels,
packed spines). Rejected as the main path. About stays
hand-authored because it is the owner-reviewed one.

**Pose tables plus offline GLB tracing, About's generator generalised.** Each
unit would need a data-only `<unit>ScenePose.ts` that both the JSX and the
generator read. That covers the five to seven GLB props per unit (counted
with grep on 2026-09-11) and none of the procedural geometry, whose only
source is JSX. It also reintroduces the two-coordinate-list drift ADR 0024
was written to end. Rejected as the main path.

**Runtime extraction (chosen).** A development hook walks the mounted unit at
its rest pose and hands a Node generator every drawable's unit-local
geometry, material, and texture URL. Node projects it through the unit's
analytic rest camera, rasterises and traces it with the About generator's
existing code, samples the drawable's displayed colour from a screenshot in
each theme, and writes one generated module per unit. Adding a prop to a
unit's JSX and rerunning the generator updates the drawing. There is no
second coordinate list.

The cost is that regeneration needs headless Chromium, the same dependency
`pnpm generate:home-og:local` already has. The freshness check does not: it
hashes the unit's sources and models the way `check:home-og` does, so
`pnpm verify:artifacts` runs anywhere.

AGENTS.md forbids ad-hoc browser automation unless Chappy asks. This plan
adds repo-owned generator scripts with documented commands, the same class as
the OG generator, and asks Codex to run them only for the captures the
outcome needs. Interactive inspection stays off the table; `/admin/boot`
exists so review happens in Chappy's own browser.

## Architecture

### One rest camera per unit

`scene/aboutBootPerspective.ts` moves to `boot/bootPerspective.ts` (the old
path re-exports until the last importer moves). `aboutBootRestCamera` becomes

```ts
unitBootRestCamera(unitIndex, vw = 1440, vh = 900, railRightPx = RAIL_RIGHT_PX_FALLBACK): BootCamera
```

For unit 0 it is the existing function. For unit N ≥ 1: `scenePosition = N`,
`cameraCompositionForViewport(vw, vh, N, railRightPx)` gives height, distance,
lens, `lateralOffset`, and the aim; `cameraDepthOffsetsForViewport(vw, vh, N,
shippedDefault)` gives the eye lift and pitch at knot N. Unit-local eye x is
`lateralOffset` (world x is `N * UNIT_SPACING + lateralOffset`, and the unit's
origin is at `N * UNIT_SPACING`). Unit-local eye z is `composition.z -
unitPose(N).position[2]`; the aim's z is `composition.lookZ` minus the same.
`unitYaw` is `unitPose(N).rotation[1]`, which alternates +0.10 and −0.12.

`ABOUT_BOOT_CAMERA` stays as `BOOT_CAMERAS[0]`. A test proves
`unitBootRestCamera(0)` equals it field for field.

### One stage for every unit

`boot/aboutBootStage.ts` becomes `boot/bootStage.ts`. The two self-contained
functions keep the contract stated at the top of that file (parameters and
`Math` only, their `toString()` is the pre-paint script). What changes:

- `aboutBootStageForViewport(vw, vh, railRightPx, g)` becomes
  `bootStageForViewport(unitIndex, vw, vh, railRightPx, g)`. The geometry
  record gains `units: Array<{ z: number; yaw: number; eyeHeight: number;
pitchDegrees: number }>` (unit z from `unitPose`, yaw, and the depth knot at
  that integer position). For `unitIndex > 0` the About shift is zero and
  `scenePosition` is exactly the index, so the lerp toward unit 1 collapses to
  the stop's own composition, and `lateral` is the full `stopLateralOffset`
  on desktop. Everything after that line is the same maths.
- The layout geometry gains `viewBoxes[]` (one per unit, see below) and
  `canonicalEyeX[]` (the eye x each unit's drawables were projected for, at
  1440×900 with the rail fallback). `eyeShift` uses the active unit's entry.
- `aboutBootStageEnabledForLocation` becomes `bootStageUnitForLocation(pathname,
hash, routing): number | null`. Same table, same resolution order (hash
  wins, then pathname, then About). It returns `null` for golf, which keeps
  the centred stage with no glide, exactly today's behaviour for every
  non-About stop.
- The document gets `data-boot-unit="<index>"` beside `data-boot-stage`.
  `publishAboutBootStage` and `setAboutBootStagePhase` take the unit from the
  location every time, as they do today.

`aboutBootStage.test.ts` already builds a reference stage from the live camera
helpers over a viewport matrix. Extend the matrix over units 0..6 (the
reference function is the same helpers with `scenePosition = N`). Keep the
existing About assertions byte for byte: the About stage must not move.

### The generated composition

One module per unit, `boot/compositions/<slug>.generated.ts`, written by the
generator and never hand-edited (the About silhouettes file has the same
header). Its shape:

```ts
export const PROJECTS_BOOT_COMPOSITION: GeneratedBootComposition = {
  unit: 4,
  slug: "projects",
  extractorVersion: 1,
  camera: { eye, aim, unitYaw },           // rounded, part of the signature
  viewBox: { minX, minY, width, height },  // plane units, y up, margin 0.12
  drawables: [
    {
      id: "grab:mac:projects",             // registry id, node name, or synthesized
      label: "Macintosh",                  // layout-editor label when there is one
      kind: "silhouette",                  // "silhouette" | "image"
      shelf: "top",                        // "top" | "lower" | "floor"
      anchor: [x, y, z],                   // unit-local; y is the shelf surface or the floor
      depth: 1.043,                        // anchor's depth ratio, for paint order
      profile: [width, height],            // scene units, like ABOUT_BOOT_MODEL_SILHOUETTES
      projection: [a, 0, 0, d, e, f],      // raster to scene units, same matrix form
      viewBox: [0, 0, w, h],
      path: "M…Z",
      color: { light: "#c2a377", dark: "#94795a" },
      cadenceSlot: 3,
    },
    {
      id: "artifact:projects-cabin",
      kind: "image",
      shelf: "top",
      anchor: [x, y, z],
      depth: 0.98,
      href: "/images/stacks/v8/512/projects-cabin.webp",
      size: [width, height],               // real target-plane size (docs/about-boot-sync.md rule)
      corners: [[x, y], …],                // four projected plane points, y up
      cadenceSlot: 5,
    },
  ],
  sources: { "src/app/components/stacks/scene/units/UnitProjects.tsx": "<sha256>", "public/models/mac.glb": "<sha256>", … },
};
```

Rules the generator enforces:

- Every number that reaches markup is rounded with `bootFixed` (thousandths).
  Node and Chrome disagree in the last bit of `sin`, `cos`, `hypot`, `atan2`,
  and React refused to hydrate a dozen attributes the first time this was
  learned (ADR 0024).
- Paint order is by `depth` within shelf, top shelf before lower, floor last;
  SVG has no depth buffer. `cadenceSlot` is authored separately: left to
  right by anchor x on the top shelf, then the lower shelf, then the floor,
  which is About's order.
- A drawable's outline is traced through the unit's rest camera from its
  anchor (`aboutBootSilhouettePoint`'s convention: the raster is in the
  anchor-relative orthographic frame, so the projection matrix and the
  placement transform downstream are unchanged). A floor prop shows its top
  from the eye's real height, as About's dumbbell does.
- The module must stay under 24 KB gzipped. The generator prints each unit's
  size and refuses to write one over 40 KB; the simplify tolerance
  (`SIMPLIFY_TOLERANCE`, 1.35 today) and `MAX_EDGE` (220) are the knobs. This
  is a generator guard on a data file, not a bundle ceiling, and nothing here
  may ever fail `pnpm build` (the route budget was deleted on 2026-09-04 for
  exactly that, see CLAUDE.md).

### The extractor: page side

A development hook, installed with the rest of `window.__stacks` in
`StacksCanvas.tsx` (`installDevHooks`, gated the same way):

```ts
__stacks.bootTrace(unitIndex): {
  unit: { index, slug, yaw, position },
  drawables: Array<{
    id: string; label: string | null; root: string | null;
    kind: "mesh" | "image";
    material: { color: string | null; map: string | null; alphaTest: number; transparent: boolean; opacity: number };
    triangles: Float32Array | number[];    // flat unit-local xyz, unit pose removed
    bbox: { min: [x, y, z]; max: [x, y, z] };
    imageQuad?: [[x, y, z], [x, y, z], [x, y, z], [x, y, z]];
  }>;
}
```

How it walks:

1. The unit root is the group `CollisionIndexedUnit` registers with
   `useUnitActivityRoot(index, root)` (`scene/Scene.tsx`). Call
   `updateWorldMatrix(true, true)` first; `StaticWorldRoot` freezes matrix
   auto-update but the frozen `matrixWorld` is correct.
2. Group meshes by owner. Every Grabbable wraps its prop in groups named
   `impulse:<hoverKey>` and `nod:<hoverKey>` (`Grabbable.tsx`, around line
   2750), in production builds too, so a mesh under a `nod:` group belongs
   to that hover key. The layout editor's registry
   (`sceneLayoutEditorController`) is development-only and is not needed.
   Otherwise a mesh belongs to its nearest named ancestor, else to the
   nearest ancestor that is a direct child of the unit root. Labels come
   from `content/stacks/objects.md` titles by id where one exists. A
   per-unit tuning file (below) can split or merge by id.
3. Skip: `Sprite`, `Points`, `Line`, anything with `visible === false`,
   meshes whose material is additive or has `opacity < 0.2`, every
   `shade:<hoverKey>` subtree (the contact shade Grabbable draws under a
   prop), and node names matching an exclusion list (contact pools, insect
   perch probes, glow halos, `ShelfSpacingProbe`). The list lives in the
   extractor and is printed in the run report so a silent skip is visible.
4. `InstancedMesh` expands every instance matrix. `SkinnedMesh` is not
   expected in a unit; throw if one appears.
5. A mesh whose geometry has four vertices after welding and whose material
   `map` has an addressable `image.src` (a `LitImage`, a book cover, a label,
   a cutout) becomes `kind: "image"` with the quad's unit-local corners and
   the URL as the scene loaded it (`scenePhotoUrl` role size, or the
   `proxiedBookCover` URL). Canvas textures (the Macintosh screen, the phone
   screens, the sticker camera) have no URL and stay `mesh`.
6. Everything is returned in unit-local coordinates: world matrix applied,
   then the inverse of the unit pose.

This hook is the only new page-side code. It is a read, it runs once per
generator call, and it is not in the production bundle beyond the existing
dev-hooks gate.

### The extractor: Node side

`scripts/generate/room-boot.mjs`:

1. `--url` (default `http://127.0.0.1:3319`), `--unit <slug|all>`,
   `--report-only`, `--check`.
2. For each unit and each theme (`light`, `dark`): a new browser context at
   1440×900 with `colorScheme` and the `theme` localStorage key set (the OG
   generator's pattern), navigate to `unitUrl(index) + "?harness&nomeadow&nopostfx&hold-boot=1"`,
   wait for `html[data-world="ready"]`, wait for `window.__stacks.bootTrace`,
   then `page.evaluate(() => __stacks.bootTrace(i))`. Geometry is
   theme-independent, so take it from the light run and assert the dark run's
   drawable ids and bboxes match (a unit that renders different geometry per
   theme is a bug worth knowing about).
3. Colour per theme: screenshot the canvas, project each drawable's bbox
   centre and four interior points with `__stacks.project`, take the median
   of a 7×7 sample around each, then the median of those. Write it as
   `color.light` / `color.dark`. This measures the render, including the
   grade, which is what the memory says to do ("ACES lies"). The tuning file
   can override any id.
4. Anchor: `[bbox centre x, surface, bbox centre z]` where surface is
   `SHELF_SURFACE.top` or `.lower` when `bbox.min.y` is within 0.065 of one
   (the e2e tolerance in `about-boot-vignette.spec.ts`), else the floor with
   `bbox.min.y` as is. Shelf comes from the same test.
5. Project every triangle with `unitBootSilhouettePoint(anchor, 1, vertex,
camera)`, rasterise and trace with `scripts/lib/silhouette.mjs`, smooth
   only when the tuning file asks (About smooths the Vision Pro alone).
6. Write the module through prettier, then the manifest
   `boot/compositions/manifest.json`: per unit, the sha256 of every source
   that fed it (the unit's `units/*.tsx` and the modules it imports under
   `scene/`, every `/models/*.glb` it loaded, every image URL it referenced,
   `room-boot.mjs`, `silhouette.mjs`, the extractor version) plus the camera
   signature. `--check` recomputes the digests without a browser and exits
   non-zero on a mismatch, naming the files, exactly like
   `check-home-og-freshness.mjs`.

`pnpm generate:room-boot:local` wraps it the way `home-og-local.mjs` wraps
the OG capture: production build, `next start` on 3319, generate, stop.
`pnpm check:room-boot` joins `verify:artifacts`, never `verify`.

Software WebGL is fine here: the extractor reads geometry, not pixels, and
the colour sample tolerates a soft render. Budget about two minutes per
unit per theme under SwiftShader (the OG generator's own numbers). Metal on
this Mac needs `--enable-gpu --use-angle=metal`; keep it behind `--gpu`.

### Data-bound drawables

Three units draw things that depend on request-time data and cannot be baked:

- **Books**: the featured covers and the packed spines come from the database
  through `page.tsx`. Prototype D already projects the shared layout
  (`layoutBooksFeaturedRows`, `layoutBooksPackedRows`) into polygons with a
  projector callback (`booksShelfDrawing.ts`). Promote that function to
  `boot/booksBootRows.ts`, give it the analytic camera instead of
  `__stacks.project`, and render its output as the Books unit's live
  drawables on top of the generated fixtures (planks, bookends, lamp). The
  data reaches the boot the way About's reading books do: server props for
  the first paint (`page.tsx` already selects `featuredBooks` and
  `spineBooks`), and `BootReadingBooksBridge`'s pattern for a streamed
  update. Keep the prototype's rule that boards keep their binding colours
  through the reveal; live rows carry sampled jacket colours that are often
  black.
- **About**: the reading stack, unchanged.
- **Musings**: the six spines map blog posts (`NotebookLean`, per
  `page.tsx`'s comment). Their geometry is static, so the generator bakes the
  spines as silhouettes; only titles vary and the boot draws no text.
- **Talks**: stills come from `public/data/speaking.json` with one scene
  override in `page.tsx` (`SCENE_TALK_STILLS`). They are static files, so the
  generator bakes the image quads with the URLs the scene loaded. A test pins
  that the baked hrefs equal the ones `page.tsx` would hand the scene, so a
  new talk fails `check:room-boot` instead of shipping a stale card.

### Per-unit tuning files

`boot/compositions/<slug>.tuning.ts`, hand-edited, small, typed:

```ts
export const PROJECTS_BOOT_TUNING: BootTuning = {
  hide: ["grab:die:projects:*"], // glob on ids
  merge: { "projects-mac": ["grab:mac:projects", "stacks-mac-screen"] },
  color: { "grab:trophy:projects": { light: "#c9a24a", dark: "#8a6d2b" } },
  smooth: ["grab:mac:projects"],
  order: ["grab:mac:projects", "artifact:projects-cabin"], // cadence first, rest follow
};
```

The generator applies it and records it in the manifest, so a tuning edit
marks the module stale. This is where owner review lands without touching
the extractor or the JSX. It replaces `bootVisible: false` and
`colorProfile` from About's composition for the generated units.

### The renderer

`dom/BootScreen.tsx` keeps exporting only components (the Fast Refresh test
in `bootPresentation.test.ts` pins it). It gains:

- `UnitBootArtwork({ composition, camera, live })` in
  `dom/UnitBootArtwork.tsx`: supports and planks from `SHELF_PLANKS` through
  the unit's camera (the existing `aboutBootShelfSupportProjection` and
  `aboutBootPlankProjection` take a camera), then the drawables. A silhouette
  is a `<path>` in a `stacks-boot-item` group placed with `bootPlacementStyle(anchor,
camera)` carrying `--stacks-boot-object-light/dark`; an image is an `<image>`
  with its real width and height and an affine `matrix()` from its corners
  (the rule in `docs/about-boot-sync.md`; no `clipPath` on raster images,
  same document). `live` holds the data-bound drawables.
- `dom/bootArtwork/<slug>.tsx`, one thin client component per unit that
  imports its generated composition and tuning and renders
  `UnitBootArtwork`. Each is loaded through `next/dynamic` (SSR on) from a
  map keyed by slug, so the route's HTML contains the drawing and the client
  downloads one chunk. About's artwork stays where it is and is entry 0 in
  the map. `initialGraph.test.ts` gains a case: the homepage's static graph
  reaches no `*.generated.ts` but About's.
- `BootScreen` takes `bootUnit` (slug) from the route. `page.tsx` accepts it
  and every thin route passes its own (`/projects` → `"projects"`, `/about`
  and `/` → `"about"`, `/golf` → `"training"`). After hydration, `BootScreen`
  reads `bootStageUnitForLocation(pathname, hash)`; when it differs from the
  server's (a hash stop), it renders that unit's artwork with a 200 ms
  cross-fade. `useBootMotion` must re-adopt the new artwork's compositor
  animations (its `animations` list is read once in `start()`), so key the
  motion hook on the unit.
- The wordmark stays "Chappy Asel" under every drawing and the wait label
  stays "Loading the 3D room" (owner call below if either should name the
  shelf).

The About code path is untouched: `ABOUT_BOOT_COMPOSITION`, its glyphs, its
tests, and its e2e snapshots keep passing. A new vitest renders
`BootScreenArtwork` for About with `renderToStaticMarkup` before and after the
refactor slices and asserts the markup is identical, so the generalisation
cannot move a pixel of the reviewed drawing.

### The preview page

`src/app/admin/boot/page.tsx`, development only (`notFound()` in production,
the `/admin/captions` pattern). Query: `unit`, `theme`, `phase`
(`start|placed`), `vw`, `vh`. Renders `BootScreenArtwork` for the unit inside
a frame of the requested size with the stage variables computed by
`bootStageForViewport`, and a strip of the seven units with arrow-key paging.
A "live" toggle opens the real route with `?hold-boot=1` in a new tab for the
alignment check. This page is what "go between them" means in production
terms: a review surface, not a visitor feature.

### Shelf OG cards

`scripts/generate/home-og-scene.mjs` becomes `room-og-scene.mjs` with
`--unit <slug>`; the About invocation is unchanged and keeps writing
`home-og-scene.jpg` and its manifest. For another unit it captures
`unitUrl(index)` plus `?screenshot=1&screenshot-unit=<index>` with the same
lens, crop, settle loop, and pixel-match tolerance, and writes
`public/images/stacks/og/<slug>.jpg` and `og/<slug>.inputs.json`.

Scene changes it needs:

- `screenshotMode.ts` gains `SCREENSHOT_UNIT_PARAM = "screenshot-unit"` and
  a `unit` field (default `SCREENSHOT_UNIT`, which stays 0).
  `ScreenshotModeDriver` calls `setSoloUnit(unit)` and `travelTo(unit)` with
  it. The About restaging (`StillMac`, the featured trio, no couch, no seam
  monstera, `screenshot-portrait`) applies only when the unit is 0; the other
  units are captured as they are. The console's Screenshot section gets a
  unit select so the owner can compose a card by hand.
- `CameraRig` already drops the rail shift, the stops' lateral truck, and
  the pointer parallax in screenshot mode (`currentAboutShift` and
  `currentRailRightPx` both return their capture values when the mode is
  on, around line 215), so a solo shelf rests on its own centre line at any
  stop. Verify with `__stacks.state().camera` at `?screenshot-unit=4` rather
  than assuming it; nothing else in the rig reads the unit. `og-head-on=1`
  squares the unit as it does for About.
- `room-og-config.mjs` holds per-unit overrides of `og-look-y`,
  `og-camera-y`, and `og-fov`, defaulting to About's. Tall shelves (Talks'
  easels, the Musings lighthouse, the Systems grandfather clock) will want a
  slightly higher aim; Codex sets these from a contact sheet and the owner
  picks.

Routes: `src/app/projects/opengraph-image.tsx`, `musings/`, `talks/`, `golf/`
each render `roomOgCard(slug)` from `src/app/roomOgCard.tsx`, the homepage
card's JSX with the scene image parameterised and the same
`HOME_OG_SIGNATURE_TEXT`. `roomStopMetadata` gains an `image` argument so the
`og:image` and `twitter:image` URLs point at the route's own image; the
memory note `gotcha_og_image_no_cascade` is why they are named explicitly.
`/about` keeps the homepage card. Hash stops cannot have their own card; they
unfurl as the homepage, which ADR 0025 already accepts.

Freshness: `home-og-inputs.mjs` becomes per-unit (`roomOgInputManifest(slug)`),
narrowing unit-local sources to that unit the way `ABOUT_UNIT_INPUTS` narrows
to About today, and `check:room-og` runs every manifest. The pre-commit hook
and the CI workflow stay advisory, as decided on 2026-08-30 (memory
`project_og_false_alarms`).

## Slices, in order

Each slice ends green on `pnpm verify` and leaves About's drawing
byte-identical. Estimates are for one focused agent session each.

0. **Spike on Projects (half a day).** Add `__stacks.bootTrace`, write the
   smallest `room-boot.mjs` that produces `projects.generated.ts`, render it
   through a throwaway page, and open the real `/projects?hold-boot=1` beside
   it. Gate: unit origin within 0.5 px and every drawable within 3 px of the
   live prop at 1440×900 (ADR 0024's own residuals), measured with
   `getScreenCTM()` against `__stacks.project`. If grouping by registry
   record produces blobs where the eye expects parts (the Macintosh's screen
   inside its case), decide here between tuning-file merges and material
   splits. Nothing else proceeds until this gate passes.
1. **Generalise camera, stage, projector (one day).** `unitBootRestCamera`,
   `bootStageForViewport(unitIndex, …)`, `bootStageUnitForLocation`,
   `data-boot-unit`, camera arguments on the placement helpers. Tests: the
   stage matrix over units 0..6; unit 0 equals the About constants; the
   pre-paint script still compiles and writes what hydration writes
   (`aboutBootStage.test.ts` already does this); the About markup snapshot.
2. **Generator, all six units (one to two days).** `scripts/lib/silhouette.mjs`
   shared by both generators; `room-boot.mjs`; six generated modules; six
   empty tuning files; `manifest.json`; `check:room-boot` in
   `verify:artifacts`; the run report (skipped nodes, sizes, colour samples).
   Also run the extractor on About as a benchmark and print, per landmark,
   the distance between the extracted anchor and `ABOUT_BOOT_COMPOSITION`'s.
   That report is the fidelity evidence for the six nobody hand-drew.
3. **Renderer and routing (one day).** `UnitBootArtwork`, the per-unit
   artwork components behind `next/dynamic`, `bootUnit` through `page.tsx`
   and the thin routes, the hash-stop swap, the Books live rows from the
   prototype, `/admin/boot`. Retire `BooksBootPrototype` and
   `?variant=bookshelf` (README of the prototype and `store.ts` VARIANTS).
4. **Shelf OG cards (one day plus capture time).** `screenshot-unit`, the
   generator's `--unit`, `room-og-config.mjs`, per-unit manifests, the four
   `opengraph-image.tsx` routes, `roomStopMetadata({ image })`. Verify with
   `curl | grep og:image` per route, the way ADR 0025's memory note says.
5. **Docs and review (half a day).** ADR 0026 in
   `src/app/components/stacks/docs/adr/` ("Draw every shelf's boot from the
   live scene"), a `docs/room-boot-sync.md` that supersedes
   `about-boot-sync.md`'s change method for the six generated units and links
   to it for About, CONTEXT.md entries for Boot Stage (now per unit) and a
   new term "Boot Composition", CLAUDE.md's artifact-gate paragraph naming
   the two new checks, and the tuning pass from the owner's review at
   `/admin/boot`.

## Owner decisions

Codex should build with the recommendation and list the choice in the PR;
none of these blocks slice 0.

1. **Golf's boot.** Recommendation: the Weightlifting drawing, centred, no
   glide (the stop sits at scene position 1.52, nearer Weightlifting than
   Books). Alternative: About's drawing as today.
2. **Wordmark and wait label on a shelf's boot.** Recommendation: keep
   "Chappy Asel" and "Loading the 3D room" everywhere; the drawing names the
   shelf. Alternative: "Chappy's Projects" under the drawing, per the
   page-naming rule of 2026-09-09.
3. **Hash stops.** Recommendation: ship the post-hydration swap in slice 3.
   Alternative: hash stops keep About's drawing and only path stops change.
4. **OG signature.** Recommendation: the same etched "Chappy Asel" on every
   room card; the title already names the shelf and the picture shows it.
   Alternative: the shelf label as the signature with the name smaller, which
   is closer to the daylight pages' eyebrow.
5. **Which props a card frames.** Per-unit `og-look-y` and `og-camera-y` from
   a contact sheet Codex produces in slice 4; the owner picks per unit.
6. **Generated About.** Recommendation: never ships; it is the benchmark in
   slice 2's report. The hand-authored drawing stays.

## Risks and how the plan meets them

- **Headless GPU.** Both generators run on software WebGL by default, as the
  OG generator does for local and CI parity; `--gpu` adds Metal on macOS for
  iteration. The black-frame gate from 2026-09-01 (wait on
  `html[data-world="ready"]`, not only `data-canvas-ready`) applies to every
  capture in `room-og-scene.mjs`.
- **A prop the walk cannot see.** Skipped nodes print in the run report, and
  `/admin/boot` shows the result next to the live route. The tuning file is
  the fix, never a hand edit of a generated module.
- **Overlap contamination in colour samples.** Interior points plus medians;
  the tuning file overrides the rest. About's colours were hand-picked too.
- **First load.** One artwork chunk per route; `initialGraph.test.ts` guards
  the graph; the generator refuses oversize modules. No byte ceiling that
  can fail a build.
- **Hydration.** `bootFixed` on every number, the rule ADR 0024 paid for. The
  About markup snapshot test catches a regression in the shared renderer.
- **The boot machine's clocks.** No new timers. The swap keys the existing
  motion hook; the vignette ceiling (`vignetteCeilingMs`, 1200) still bounds
  the pass.
- **Data-bound units.** Books draws from the same layout functions the scene
  uses, with server props for first paint; Talks pins baked hrefs to
  `page.tsx`'s selection in a test.
- **The rail width.** `RAIL_RIGHT_PX_FALLBACK` (179) is what the pre-paint
  stage solves with for every unit, as it does for About; UnitRail's
  measured width republishes the stage later without restarting the glide.

## Field Notes

Evaluated against the achievement quality bar in
`docs/research/2026-08-24-achievement-exploration-system.md`. A loading
screen is not a visitor action and fails test 2 (the qualifying action has
meaning beyond incrementing a counter). No discovery is added.

## Out of scope

- Redrawing About, or changing its glide, cadence, or copy.
- A flat-mode use of the drawings (the no-WebGL page).
- OG cards for hash stops, which the server cannot distinguish from `/`.
- Regenerating the homepage card; it is unchanged by this work unless the
  About capture's watched sources move.
