# Review and alternative proposal for per-unit boot artwork

Reviewed 2026-09-11 against `f54e6e2` and
[`docs/plans/room-boot-per-unit.md`](../plans/room-boot-per-unit.md).
This is a proposal, not an implementation or an approved replacement plan.

Follow-up: two isolated prototypes and authorized captures are reviewed in
[`2026-09-11-boot-prototype-comparison.md`](2026-09-11-boot-prototype-comparison.md).
That report includes the live comparison page, measured limits, the owner's
negative visual feedback, and the revised proposal to establish a complete
Projects composition before expanding the generator. The source review below
predates those captures.

I would keep the live scene as the geometry source. I would change the capture
contract, the division of work between Three and Node, and the boot selection
lifecycle before implementing the six shelves. The current plan describes the
surrounding machinery more completely than the process that produces a readable
illustration.

## What I would keep

- Preserve the reviewed About artwork and its existing behavior.
- Reuse the projector, stage equations, contour tracing, cadence, book layout,
  and OG capture runner where their contracts fit.
- Generate one shelf at a time and check freshness without a browser.
- Use Projects as the first visual specimen. Its Mac, photos, lamp, and small
  circuit boards expose several different rendering problems.
- Provide a development preview and explicit per-route OG metadata.

The case against copying six sets of coordinates is sound. The case against
shared pose data is overstated. ADR 0024 requires consistent projection; shared
geometry and pose constants consumed by both renderers satisfy that requirement.
About already uses them. The actual problem with pose tables here is coverage of
procedural JSX, not an inherent conflict with the ADR.

## Findings

### 1. The specified capture can never reach its readiness gate

P1, confidence 10/10. Plan lines 282 to 285.

The capture URL contains `hold-boot=1`, then waits for
`html[data-world="ready"]`. In `boot/worldBootMachine.ts:477`, `holdBoot` returns
from `settle` before reveal arbitration. At line 703, only revealing or live
states produce the `ready` document phase. Holding the boot and waiting for
that phase are incompatible.

The URL construction also breaks hash stops. Executing the proposed expression
with the real `unitUrl` produces:

```text
/#books?harness&nomeadow&nopostfx&hold-boot=1
search = ""
hash   = "#books?harness&nomeadow&nopostfx&hold-boot=1"
```

Those flags never become search parameters, and the hash no longer names Books.
`data.ts:169` already accepts search as its second argument. Use that argument
or construct a `URL` and set its search parameters.

Recommendation: capture after normal scene readiness, with a separate capture
operation that freezes the required state. Reserve `hold-boot` for reviewing the
loading presentation. Assert the resolved unit and capture settings before
exporting anything.

### 2. The proposed projection adds the anchor twice

P1, confidence 10/10. Plan lines 269 to 270 and 300 to 301.

The extractor returns vertices in unit-local coordinates. The Node step passes
each vertex to the generalized `aboutBootSilhouettePoint(anchor, 1, vertex)`.
That helper expects an anchor-relative vertex and explicitly adds the anchor
in `scene/aboutBootPerspective.ts:350`.

A Node check using the current helper and camera gives:

```text
anchor = [0.7, 0.3, 0.1]
vertex = [0.8, 0.5, 0.15]

Direct projection:                   [0.812507, 0.505057]
Proposed helper call, then placement: [1.537801, 0.815291]
Subtract anchor before helper call:  [0.812507, 0.505057]
```

Recommendation: state the coordinate system in every export field and project
absolute unit-local points directly. If retaining the existing silhouette
helper, subtract the anchor first. Add one independent numeric regression case
before any visual capture.

### 3. The image contract misses the site's actual images

P1, confidence 10/10 for the missing data. Plan lines 263 to 268 and 377 to 379.

`scene/LitImage.tsx:100` applies photograph treatment into a canvas and assigns
that canvas to `texture.image`. The default warmth is nonzero. Consequently,
ordinary treated photographs can have no `image.src`, exactly the condition
the plan uses to turn them into plain mesh silhouettes.

Other omissions compound this:

- Rounded book covers use `ShapeGeometry`, not a four-vertex quad.
- `fitCover` at line 39 stores crop, zoom, and focal position in texture repeat
  and offset. A URL and four corners do not preserve those values.
- Mac screen and Apple mark details use canvas textures. Flattening each to
  one sampled color discards the recognizable detail.
- `ModelProp.tsx:3` documents multicolor palette atlases shared across models.
  Splitting by material alone cannot recover the different atlas regions.
- The triangle record has no UVs, material groups, or alpha samples, so the
  existing binary triangle rasterizer cannot reconstruct those appearances.
- An SVG affine matrix cannot map a rectangle to every perspective quad.
  Existing approximate frame behavior does not prove that arbitrary new image
  planes will fit the proposed 3 px gate.

Recommendation: capture textured details with the renderer that already knows
their geometry and sampling. Use traced flat regions where that simplification
is intentional. Do not build a second texture renderer in Node.

Prototype follow-up: the geometry worker identified an important qualification.
`scene/photos.tsx:33` sets `ARTIFACT_PHOTO_GRADE = 0`, and `DeskFrame` passes that
value to `LitImage`. Default Projects desk-frame photographs therefore do not
necessarily become canvas-backed. The missing-data finding applies when treatment
is active and to actual canvas details; it does not establish that every default
Projects photograph would disappear. I verified that override in the source.

### 4. Grouping and color sampling need a defined illustration model

P2, confidence 9/10. Plan lines 246 to 259 and 290 to 299.

The production `nod:<hoverKey>` names are real, but an interaction owner is not
always a drawing part. One owner can contain a case, a screen, a logo, glass,
and hardware. Many unowned procedural objects sit inside unnamed groups.
Falling back to a direct child of the unit root can collect unrelated geometry
under the unit's outer group. An unnamed-object fallback also lacks stable IDs
for the promised tuning files.

The skip rules do not explicitly exclude shelf furniture or data-bound Books
rows, even though the renderer draws those again. The single-material record
also needs a rule for owners containing multiple meshes and materials. The
tuning schema offers merges but no concrete split operation.

Bounding-box samples cannot determine which object supplied a pixel. The center
of a hollow trophy, a handle, or a leaf cluster can be background. A nearer prop
can cover every chosen point. Taking medians does not resolve that ambiguity.
Additionally, `nopostfx` disables the chain whose grade the plan says it samples;
see `scene/sceneDiagnosticsRuntime.ts:43`.

Recommendation: add stable drawing-part metadata beside scene objects, with no
second pose list. Separate furniture, static artwork, live rows, and omissions
explicitly. Sample colors inside an object mask with the intended grade enabled.

### 5. Promoting the Books prototype needs a dependency split first

P2, confidence 10/10. Plan lines 324 to 333.

`route-transition-prototype/booksShelfDrawing.ts:1` imports `primitives.tsx`,
`UnitBooks.tsx`, and runtime `Color`, `Euler`, and `Vector3` from Three. Moving
the function and replacing its projector does not make it safe for the initial
boot graph. `stacks/initialGraph.test.ts` exists specifically to prevent that
dependency path.

The prototype also draws shelf furniture and bookends itself. Promoting its
whole output on top of generated fixtures duplicates those objects.

Recommendation: extract data-only row geometry and color calculations, with
plain numeric transforms, into shared modules. Render only the live book rows
through the boot path. Test the dependency boundary from the new Books entry
point as well as the existing homepage roots.

### 6. Rekeying the artwork is not a complete hash handoff design

P2, confidence 9/10. Plan lines 388 to 395.

`dom/BootScreen.tsx:265` sends `bootVignetteStarted`, resets the stage to `start`,
adopts animations, and cancels them on cleanup. Rekeying that lifecycle can
restart presentation while the room is already ready or the prior artwork is
gliding. The 1200 ms ceiling bounds extra waiting; it does not prevent a visual
jump, stale completion callback, or late chunk replacing the drawing mid-fade.

There is also an earlier mismatch: the pre-paint stage would resolve the hash
while the HTML still contains the pathname's artwork. Those two pieces need one
selection contract.

Recommendation: choose artwork once per boot epoch. Resolve a hash before
presenting a destination-specific drawing. While its asset is unavailable,
show a neutral boot shell. If the world wins the race, reveal it immediately.
Do not restart the vignette to display a late asset.

The server cannot read a fragment. That fact does not require showing the wrong
shelf first; the existing pre-paint script can suppress mismatched artwork.

### 7. The proposed spike can pass without producing faithful artwork

P2, confidence 10/10 about what the measurement establishes. Plan lines 468 to 476.

`getScreenCTM()` and projected anchors establish placement, not whether a path
contains the correct silhouette, photo crop, internal parts, or occlusion. A
solid rectangle can have a perfectly aligned anchor. Comparing extracted
bounding-box anchors to authored About anchors is also ambiguous because they
need not denote the same physical point.

ADR 0024 reports different residuals for origins, floor props, plank corners,
and mobile perspective. It does not establish a universal 3 px illustration
guarantee. Checking only 1440×900 also misses the viewport-dependent parallax
that motivated that ADR.

Recommendation: keep origin alignment, then add named landmarks, silhouette
boundary measurements, texture-detail checks, and a repeatability check. Test
desktop, wide desktop, and phone cameras before expanding to six shelves.
Owner review should establish whether the generated drawing is readable at its
actual initial size.

### 8. Freshness and payload claims need stronger boundaries

P2, confidence 9/10. Plan lines 303 to 310 and 381 to 387.

Hashing inputs is the right approach, but the described dependency closure is
too narrow. Relevant inputs include theme code outside `scene/`, data selection
in `page.tsx`, `public/data/speaking.json`, atlas images, treatment code, tuning,
and renderer/toolchain versions. A remote URL is not a content digest. Live
Books data must be excluded from static captures and supplied at runtime.

The existing OG checker also binds generated image bytes to their provenance.
The boot design should include output integrity and publish all files for a
unit only after successful validation.

A static-import test cannot prove actual route transfer size or dynamic preload
behavior. Next documents a code-splitting limitation when a Server Component
dynamically imports a Client Component. Put any client dynamic registry behind
an explicit client boundary and inspect the built result. [Next lazy-loading
guide](https://nextjs.org/docs/app/guides/lazy-loading).

Recommendation: use server-rendered artwork for path stops, with a small client
motion owner. Measure HTML, RSC payload, artwork images, and client JavaScript
separately. Keep size reporting advisory, consistent with this repository.

## My proposed architecture

The browser should resolve rendering. Node should trace and package the result.
Small scene annotations should identify the parts an illustration needs.

```text
Mounted scene + explicit capture settings + shared book selection
                         |
              Frozen rest-pose snapshot
                         |
           Stable object and drawing-part inventory
                         |
             Three renders masks and detail images
                         |
          Node traces masks, simplifies, validates, hashes
                         |
             Per-unit composition and image assets
                         |
        Server artwork slot + one client boot lifecycle
```

### Capture contract

Define a versioned capture description containing the unit, camera, viewport,
theme, quality policy, animation pose, data-fixture version, and tool versions.
Boot capture uses the ordinary shelf composition. OG capture has its own camera
and staging profile. Screenshot mode's centered camera must not silently become
the boot alignment reference.

Wait for normal world readiness, required textures, and the intended active unit.
Freeze procedural animation and interaction poses for all passes of that
capture. The Projects Mac should have an explicit still rather than whichever
animation frame happens to be visible. Return a diagnostic error on missing
assets or unsupported geometry; preserve the prior generated files.

Load capture machinery only for the explicit generation mode. The existing
`installDevHooks` gate is runtime opt-in in production, not proof of bundle
exclusion. Prefer a lazy capture module. A live capture control belongs in Scene
Diagnostics, defaults off, and allocates no render targets while off.

### Drawing parts and rendering

Use `Grabbable` ownership as a default identity, augmented by typed metadata on
ambiguous subgroups. Metadata says things such as `fixture`, `silhouette`,
`detail`, `live-books`, or `omit`, plus a stable part ID. Transforms continue to
come from the mounted scene. Unknown unowned geometry becomes a reportable
error during generation instead of silently joining one large silhouette.

Reuse the private proxy-scene approach in `scene/PhotoMaskPass.ts:6`. It already
copies live geometry and world matrices into a mask render without replacing
the room's materials. It also documents why scene depth matters for occlusion.
This is a starting point, not a complete generic capture implementation.

For each drawing part:

- Render a full silhouette mask through the frozen boot camera. Preserve
  material sides, alpha coverage, and instance transforms. Unsupported shader
  deformation requires an explicit capture adapter.
- Trace that mask using the existing contour code. Sample a palette color from
  masked interior pixels in the corresponding graded render, or use an authored
  palette override when one flat fill is an intentional simplification.
- Capture important textured details as small transparent raster assets with
  their projection already applied. This preserves canvas textures, rounded
  boundaries, crop, and perspective without an SVG quad approximation.
- Compare the assembled drawing against a full-scene visibility reference.
  Use stable part ordering or bounded splits for overlap. Do not assume sorting
  whole owners by one anchor depth solves every intersection.

Three exposes render-target pixel readback for this operation. The work runs
during generation, not in a visitor's boot. [Three WebGLRenderer
documentation](https://threejs.org/docs/pages/WebGLRenderer.html).

This still needs a spike. It removes the CPU texture-rendering problem, but
alpha handling, stable masks, and illustration quality remain acceptance gates.
The masks should capture complete parts so cadence can reveal them separately;
the full-scene reference checks occlusion instead of baking neighboring props'
holes into every sprite.

### Artifact and runtime contract

Each generated unit contains ordered parts, capture-camera metadata,
anchor-relative placement, theme fills or detail URLs, and integrity metadata.
Keep provenance in an adjacent manifest rather than shipping source hashes in
the client composition. Derive all screen-space coordinates through one
documented pixel-to-plane transform and round only at the markup boundary.

Render the shared supports and planks once from existing geometry. Exclude them
from generic extraction. Exclude Books rows from static output and render those
from shared pure layout data. Static fixtures and live rows must use one tested
ordering contract, including overlap with bookends and photos.

For path routes, pass server-rendered artwork into a small client component that
owns the root ref and motion. This uses Next's supported server-children pattern
and avoids requiring a separate artwork JavaScript component for each static
shelf. It still produces HTML and RSC bytes, which must be measured. [Next
Server and Client Components
guide](https://nextjs.org/docs/app/getting-started/server-and-client-components#interleaving-server-and-client-components).

Keep About's current implementation behind the same outer interface initially.
Generalize the mathematical helpers through wrappers before moving files or
rewriting its artwork. A fixed pre-refactor markup fixture is useful, but shared
CSS, stage geometry, and animation lifecycle need separate regression checks.

For hash entry, the pre-paint resolver publishes the target and hides any
mismatched destination drawing. A client loader fetches only the selected
composition and its details. Show it only if the same boot epoch is still
waiting and no glide has begun. Commit target, camera, layout, and artwork
together. Chunk failure or late arrival keeps the neutral shell until the normal
world handoff; it never lengthens the existing boot deadline.

Persist that selection for the pass. Ignore stale callbacks after navigation,
exit, or a new boot epoch. With JavaScript disabled, retain the existing flat
document behavior.

### OG cards and Golf

Keep the OG extension independent of boot extraction. Reuse its runner and
manifest utilities without making it depend on generated boot compositions.
Represent capture targets by slug and scene position, since Golf is fractional
and does not fit an integer shelf API.

My recommendation for Golf is a neutral loading presentation and an OG capture
of the green itself. Showing Weightlifting teaches the wrong destination.
Keep "Chappy Asel" and "Loading the 3D room" for the other loading screens;
keep the name as the OG signature. Camera crops remain a visual owner choice.

## Proposed implementation sequence

| Task | Deliverable                                                               | Required evidence                                                                                           |
| ---- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| T1   | Fix the capture specification and define coordinates, IDs, and exclusions | URL, projection, and readiness unit cases; no duplicate fixtures or live rows                               |
| T2   | Projects mask-and-detail spike plus an isolated Books row specimen        | Mac screen, treated photo, small board, alpha shape, and book-cover checks; repeated captures               |
| T3   | Add generic stage wrappers and the server artwork slot                    | About baseline unchanged; pre-paint and hydrated layout agree across viewport matrix                        |
| T4   | Add one boot selection lifecycle and pure Books geometry                  | Late asset, failed asset, hash override, warm entry, exit, and stale callback tests; import boundary passes |
| T5   | Generate the remaining shelves and add development preview                | Per-unit completeness report, optical checks, owner readability review, artifact integrity                  |
| T6   | Extend OG capture and explicit metadata, including Golf                   | Per-target image output and metadata assertions; independent artifact checks                                |

T1 through T5 are sequential where they change the capture and boot contracts.
T6 can proceed separately after capture target names are agreed. Avoid concurrent
edits to `StacksCanvas.tsx`, `CameraRig.tsx`, and shared route metadata.

The original estimate is premature because it assigns most generator work after
an anchor-only spike. Estimate expansion after T2 establishes mask fidelity,
the number of authored parts, and the full payload for one shelf.

## Validation and failure handling

```text
URL + initial markup ----- pure resolver / pre-paint parity tests
           |
asset selection ---------- deferred-promise and boot epoch tests
           |
artwork + placement ------- numeric projection / static markup tests
           |
glide + world reveal ----- existing machine tests + late callback cases

scene capture ------------ readiness / inventory / repeated capture checks
           |
mask + detail output ----- silhouette / crop / alpha / overlap comparisons
           |
published artifacts ------ input closure / output hash / atomic write checks
```

The visual spike should retain the proposed 0.5 px origin target. Define the
3 px outline target against named parts and a documented alpha threshold, at
1440×900, 2056×1290, and a phone viewport such as 390×844. Measure the entire
reassembled path, not only its anchor. Treat a failure as evidence to adjust
capture resolution, part boundaries, or camera-specific output. Do not silently
claim universal accuracy from the canonical desktop result.

Specific failure behavior:

- Missing textures, incorrect unit, or unsupported mesh: abort generation with
  IDs and reasons; leave committed output intact.
- Nondeterministic capture: report the changing parts; do not bless new input
  hashes against unverified output.
- Invalid or partial artifact writes: fail the artifact check, naming the unit.
- Late hash artwork or image failure: keep a neutral or already committed
  presentation; allow the room to reveal on its normal schedule.
- Stale animation completion: discard it using the boot epoch and selection.
- Books query degradation: boot and live scene receive the same empty or
  degraded selection; no baked covers remain behind the live rows.

Keep artifact freshness separate from the code gate. Record generated-data size,
rendered HTML, RSC payload, detail-image bytes, and JavaScript transfer. A 24 KB
gzipped TypeScript file is not a measurement of the visitor's loading cost.

## Review verification and limits

I read the relevant source and ran five existing Vitest files:

- `worldBootMachine.test.ts`
- `aboutBootStage.test.ts`
- `aboutBootPerspective.test.ts`
- `screenshotMode.test.ts`
- `initialGraph.test.ts`

All 137 tests passed. Separate Node checks reproduced the malformed hash URL
and the double-anchor projection. These establish the current contracts; they
do not validate the proposed implementation or its visual quality.

No browser, screenshot capture, production build, or application change was
performed for this review. The reported HTML size in Claude's plan was not
remeasured. The proposed visual capture work remains to be validated.

The plan's browser-policy paragraph needs correction. `AGENTS.md` does not
automatically exempt a newly written generator from its explicit browser
authorization rule. A request to review this plan is not a request to run those
captures. This does not prevent completing the source review or this proposal.

Not included in the proposal: redrawing About, changing URL ownership, changing
production quality defaults, or changing the book database/sync contract.
No Field Note is proposed. A loading presentation has no qualifying visitor
action and fails quality-bar test 2.

The remaining owner choices are the illustration treatment demonstrated by T2,
Golf's presentation, the hash-entry neutral shell, and final OG crops. The
recommendations above are proposals, not recorded approvals.
