# Homepage 3D scene: fine-detail and performance options

Date: 2026-08-14
Repository snapshot: `3aa3317`
Scope: selection menu only; no implementation changes

## Executive recommendation

The scene already uses many of the standard optimizations: the WebGL world is
dynamically loaded, touch devices skip the postprocessing download, desktop AO
is half resolution, depth of field is 0.6 resolution, meadow vegetation is
instanced with two geometry LODs and four quality-density rungs, images are
staged by unit, GLBs use Meshopt/shared atlases, photograph planes request the
device's maximum anisotropy, and grounding is analytic rather than a live
shadow map.

The highest-confidence next sequence is therefore:

1. **M0 — establish a repeatable CPU/GPU/visual baseline.**
2. **P0 — isolate quality state from the seven content units.** This is a
   prerequisite for any reversible or more granular quality system.
3. **P1 — redesign the DPR ladder around a physical-pixel budget and add a
   real low-end escape below 2.5×.** Preserve native 3× on the target iPhone
   portrait view when it is sustainable.
4. **P2 — make movement regression temporary and recovery conservative.**
5. **P3 — reduce the global real-light count.** This is likely the largest
   scene-specific shader win after DPR.
6. **P4 — spatially tile the meadow's instanced buffers.** Keep instancing and
   LOD; add useful culling.
7. **V1 — right-size image textures by visual role.** This buys both sharper
   hero media and substantially lower mobile texture memory.
8. **V2 — add a genuinely cloud-shaped top tier, compiled out of lower tiers.**
9. **P5 — retain the cheap photographic finish when expensive desktop effects
   are removed.**
10. Then choose between **V3 material microdetail**, **P6 texture
    deduplication**, and a small **A1 KTX2 experiment** based on the baseline.

This order attacks measurement, transition churn, fill rate, light-loop cost,
vertex work, and texture memory before adding more full-screen shader work.

## What dynamically adjusts today

The adaptation is FPS-based, not GPU-time-, memory-, battery-, or thermal-
based. `StacksCanvas.tsx` mounts Drei `PerformanceMonitor` with only an
`onDecline` callback. In the installed Drei source its defaults are ten 250 ms
sample windows, a 75% threshold, and refresh-aware FPS bounds: below 40 FPS is
"low" on an ordinary display and below 60 FPS is "low" when the highest
observed refresh exceeds 100 Hz. A decline therefore requires at least eight
low windows in an approximately 2.5-second sample. The monitor derives FPS
from `performance.now()` timestamps inside `useFrame`; it does not issue a GPU
timer query. Drei documents the same refresh-rate-aware factor model and
incline/decline/fallback hooks in its
[PerformanceMonitor documentation](https://drei.docs.pmnd.rs/performances/performance-monitor).

The site deliberately ignores a decline callback received within 1.5 seconds
of `wheel` or `touchmove`. Quality then degrades one way for the rest of the
page session:

| `degrade` | DPR on a 3× iPhone | Desktop composer                                                | Atmosphere              |                       Meadow | Grounding        |
| --------: | -----------------: | --------------------------------------------------------------- | ----------------------- | ---------------------------: | ---------------- |
|         0 |               3.0× | AO + bloom + DoF + tilt-shift + vignette + grade + noise + SMAA | full sky, dust          | 12,000 tufts + 1,900 flowers | 7 analytic pools |
|         1 |               2.5× | entirely unmounted                                              | full sky, dust          | 10,560 tufts + 1,672 flowers | analytic pools   |
|         2 |               2.5× | off                                                             | simplified sky, no dust |      8,400 tufts, no flowers | analytic pools   |
|         3 |               2.5× | off                                                             | simplified sky, no dust |      5,400 tufts, no flowers | pools removed    |

Sources in this repository: `src/app/components/stacks/StacksCanvas.tsx`,
`scene/Scene.tsx`, `scene/SceneEnvironment.tsx`, `scene/Effects.tsx`,
`scene/Meadow.tsx`, and `scene/meadowField.ts`.

Three consequences matter:

- A 390×664 canvas at 3× contains 2.33 million physical pixels. At 2.5× it
  contains 1.62 million, 30.6% fewer; at 2× it contains 1.04 million, 55.6%
  fewer. DPR is quadratic, but after the first decline the current ladder
  never uses it again.
- The first desktop decline removes every photographic finishing pass at
  once. The last decline removes seven cheap analytic ground quads; it does
  **not** remove a shadow-map pass. No scene light has `castShadow`, and code
  comments explicitly describe the scene as shadow-map-free.
- Changing `degrade` changes a prop on `Scene`, so all seven units re-render.
  `ModelProp` correctly disposes private clones, but its memo depends on
  caller-provided `tints` and `atlasOverride`; many callers pass inline
  objects. More frequent quality changes can therefore turn a nominally cheap
  tier switch into model/material/texture clone churn.

## Current measured constraints

- The initial homepage client bundle is **177.3 KB gzip against a 180 KB
  budget** (`scripts/check-route-budgets.mjs`). Any selected work must remain
  in the existing asynchronously loaded scene chunk or be build-time-only;
  there is only 2.7 KB of initial-route headroom.
- The 27 local v8 scene photographs total **20.4 megapixels**. Decoded as
  ordinary 4-byte RGBA textures that is **77.9 MiB before mipmaps** and about
  **104 MiB with a complete mip chain**. Download compression does not change
  decoded texture dimensions; Three's texture guide gives the same
  width × height × 4 × 1.33 estimate in
  [Texture memory usage](https://threejs.org/manual/en/textures.html).
- Those v8 images are generally 768–1024 px on an edge, while one global
  `coverWidth` chooses only 256 px on touch and 384 px elsewhere for remote
  portrait, book, talk, and project media. The main portrait and a tiny book
  cover therefore receive the same width policy despite radically different
  projected sizes.
- The meadow already costs only four draw calls, but its three instanced
  meshes set `frustumCulled={false}`. Their full-quality buffers contain
  12,000 tufts and 1,900 flower heads spanning the full traverse, so every
  visible frame submits every instance's vertices even though the camera sees
  a limited horizontal slice.
- The sky is one screen-filling `ShaderMaterial`, rendered through a
  160×96 sphere. Its lower quality is a uniform (`uSimplify`) inside the same
  large shader, not a separately compiled lightweight program. Full light-mode
  clouds already combine a three-octave primary field with a two-octave
  coverage field; simplified mode keeps the two-octave coverage field.
- Every shelf creates one real point light: seven shelf lights before the desk
  and floor-lamp rigs. The code's own budget comment says the whole scene runs
  12 lights. Three builds standard-material programs around the active light
  counts, visible in the official
  [`WebGLLights` source](https://github.com/mrdoob/three.js/blob/r185/src/renderers/webgl/WebGLLights.js)
  and shader-program parameters in
  [`WebGLPrograms`](https://github.com/mrdoob/three.js/blob/r185/src/renderers/webgl/WebGLPrograms.js).
  Offscreen lights are therefore not equivalent to culled meshes.
- `LitImage` already sets photographs to the renderer's maximum supported
  anisotropy; the procedural wood uses anisotropy 4. A blanket "increase
  anisotropy" task would mostly duplicate shipped work and increase sampling
  cost. Three documents that tradeoff in its
  [Texture API](https://threejs.org/docs/pages/Texture.html).

## Selection menu

Effort: **S** (hours to a day), **M** (roughly 1–3 days), **L** (multi-day
asset/system work). Benefit is an estimate until M0 measures it.

### Foundation and adaptation

#### M0 — Repeatable scene performance and visual harness

**Benefit:** foundational · **Effort:** M · **Risk:** low
**Select if:** any performance option will be implemented.

Extend the existing `window.__stacks.state()` and Playwright coverage into a
fixed-checkpoint harness. At units 0, 3, and 6, the seated view, and a scripted
full traverse, record:

- frame-time p50/p95/p99, dropped-frame percentage, and refresh rate;
- `renderer.info.render.calls`, triangles, textures, geometries, and programs;
- framebuffer/CSS dimensions and actual DPR;
- active quality rung and every transition timestamp;
- cold first-painted-WebGL time and context loss;
- development-only GPU time when the timer-query extension exists.

Three exposes render counts and memory counters through
[`WebGLRenderer.info`](https://threejs.org/docs/pages/WebGLRenderer.html).
`EXT_disjoint_timer_query_webgl2` measures GPU command duration without a
synchronous readback, but availability must be detected and disjoint samples
discarded per the
[Khronos extension specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/).
Use Chrome's official
[Performance panel](https://developer.chrome.com/docs/devtools/performance/reference/)
and Apple's
[Safari developer tools](https://developer.apple.com/safari/tools/) for real
device confirmation. If production field metrics are desired, Next exposes
[`useReportWebVitals`](https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals).

**Verification:** three runs per scenario; baseline JSON checked into a test
artifact location; desktop 1440×900 and 2048×613; iPhone 390×664 at 3×; one
real 60 Hz iPhone and one ProMotion device; light/dark; full and forced
degraded tiers.

#### P0 — Isolate quality transitions from content-unit renders

**Benefit:** medium directly, high as an enabler · **Effort:** M · **Risk:** low

Move DPR/composer/environment/meadow quality ownership behind boundaries that
do not change the props of all seven unit components. Stabilize remaining
inline `tints`/`atlasOverride` objects or move them outside render. This makes
recovery and temporary movement modes safe: changing a uniform, instance
count, or environment sub-tree should not reconstruct private model materials.

R3F recommends mutating fast-changing values in `useFrame` rather than routing
them through React state in its
[performance scaling guide](https://r3f.docs.pmnd.rs/advanced/scaling-performance).

**Interaction:** prerequisite for P2 and strongly recommended before making
P1 more granular.

**Verification:** force every tier transition and assert stable texture,
geometry, and program counts after settling; instrument `ModelProp` clone
construction in development and require zero reconstructions caused only by a
quality change.

#### P1 — DPR ladder with a physical-pixel budget and real low-end escape

**Benefit:** high, especially mobile/tablet · **Effort:** M · **Risk:** medium

Keep native 3× on the target iPhone portrait viewport when the monitor says it
is sustainable, but derive the maximum DPR from both device DPR and a physical
pixel budget:

`effectiveDpr = min(deviceDpr, tierCap, sqrt(maxPixels / cssPixels))`.

Use additional sustained-failure caps below the current permanent 2.5× floor,
for example 3 → 2.75 → 2.5 → 2.0, rather than spending the last rung on seven
ground quads. Do not hard-code these exact values before M0; they illustrate
the ordering. Three explicitly recommends controlling drawing-buffer size
rather than blindly multiplying by device pixel ratio in
[`responsive rendering`](https://threejs.org/manual/en/responsive.html), and
MDN makes the same recommendation in
[`WebGL best practices`](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

**Interaction:** the current composer and DPR change are coupled because N8AO
has been treated as unsafe across adaptive DPR. If any composer survives a DPR
change under P5, remove N8AO first and verify target resizing.

**Verification:** the approved iPhone portrait opens at true 3×; large iPad
and ultrawide buffers respect the pixel budget; forced poor performance can
reach ≤2×; silhouette, small-type-on-cover, and cloud-edge crops pass at every
tier; GPU frame time falls monotonically.

#### P2 — Temporary movement regression plus conservative recovery

**Benefit:** high perceived fluidity · **Effort:** M · **Risk:** medium

The current 1.5-second scroll guard prevents a fling from permanently deleting
the composer, but it also gives the heaviest motion no temporary help. Add a
separate reversible movement mode that reduces meadow count and expensive
cloud detail during wheel/touch/camera motion, then restores them after
settling. Avoid changing postprocessing ownership or making a large DPR jump
during a fling; those are visually obvious.

For durable weak-device degradation, allow at most one rung of recovery after
a long stable interval (for example 20–30 seconds), with wide upper/lower
bounds, a cooldown, and a flip-flop ceiling. Drei supports incline, decline,
factor, bounds, and fallback semantics, while R3F documents temporary
regression and debounce restoration in its
[scaling guide](https://r3f.docs.pmnd.rs/advanced/scaling-performance).

**Interaction:** requires P0. The cheap movement mode should be independent of
the durable device rung.

**Verification:** fewer dropped frames in a scripted fling; full quality
returns after settling; no more than one durable tier change in any rolling
10-second interval; no composer flash or model rebuild.

#### P2b — CPU/GPU bottleneck classifier

**Benefit:** high diagnostic value · **Effort:** M · **Risk:** low

Combine ordinary frame timing, main-thread long tasks, renderer counts, and
the optional GPU timer from M0. FPS alone cannot distinguish JavaScript/frame
submission from full-screen fragment cost. Use the classification to choose
between P3/P4 (light/vertex work), P1/P5/V2 (fragment/fill work), and P0/P7
(CPU/allocation work).

**Verification:** every experiment report names CPU-bound, GPU-bound, mixed,
or unknown, with the raw signals that justify the label.

### Scene-specific performance wins

#### P3 — Replace most global real lights with analytic/baked local response

**Benefit:** potentially very high GPU time · **Effort:** L · **Risk:** high
visual retuning

Retain the visible emissive fixture bars, glow sprites, and meadow's existing
analytic lamp pools, but test replacing the seven per-shelf point lights with:

- one camera-following/active-unit shelf light;
- baked vertex/material tint on shelf contents; or
- a small analytic local-light term in the few materials that need it.

Then audit the three-light desk/floor rigs for the same treatment. The goal is
not "no real lights"; it is to stop every standard-material fragment from
paying for lights several units offscreen. This is a more relevant target than
shadow-map tuning because the scene has no live shadow-map pass.

**Verification:** per-material close crops in all seven units and both themes;
active light count/program variants; GPU timer; no visible lighting jump while
crossing unit boundaries; preserve practical on/off interactions and lamp
warmth on nearby props.

#### P4 — Spatially tile the meadow while preserving instancing and LOD

**Benefit:** high vertex reduction, especially portrait mobile · **Effort:** L
· **Risk:** medium

Partition near grass, far grass, and flowers into X/Z tiles with correct
bounding spheres. Keep shared geometry/materials and the existing rung-major
density ordering inside each tile. Let normal frustum culling reject tiles
outside the current slice instead of submitting all 13,900 instances with
`frustumCulled={false}`.

Three's [`InstancedMesh`](https://threejs.org/docs/pages/InstancedMesh.html)
documentation makes bounding-box/sphere recomputation explicit; culling is at
the mesh bound, not per instance. The trade is more draw calls for far fewer
vertex shader invocations, so M0 must arbitrate tile size.

**Verification:** calls may rise but submitted instances/triangles and GPU
time must fall; no density seams at tile or quality-rung boundaries; all
traverse widths plus the seated turn; rerun `check:meadow` and meadow tests.

#### P5 — Progressive desktop postprocessing instead of all-or-nothing

**Benefit:** high quality retention · **Effort:** M · **Risk:** medium

Split the desktop chain conceptually into:

1. expensive spatial effects: N8AO, DoF, tilt-shift, bloom;
2. cheap photographic finish: tone mapping, grade, vignette, noise, SMAA.

On the first decline remove or reduce group 1, beginning with N8AO before any
DPR change, but retain group 2 if its measured GPU cost is small. Only unmount
the composer at a later rung. This preserves the authored color/edge treatment
instead of making the first decline visibly become a different site.

The postprocessing library merges compatible effects into fewer passes; see
the first-party
[`react-postprocessing` repository](https://github.com/pmndrs/react-postprocessing)
and [`EffectComposer` API](https://pmndrs.github.io/postprocessing/public/docs/class/src/core/EffectComposer.js~EffectComposer.html).

**Interaction:** never use a mounted `enabled={false}` composer; current code
correctly unmounts because renderer tone-mapping ownership changes. Precompile
selected variants under P8.

**Verification:** per-effect GPU A/B; approved full/degraded reference shots;
tone-map/exposure parity; no iOS download; no target corruption after DPR
change; program and render-target counts settle after transitions.

#### P6 — Deduplicate generated wood textures and audit derived-texture ownership

**Benefit:** medium GPU memory/startup · **Effort:** S–M · **Risk:** low

`woodGrainTexture()` caches one 256² base, but every `WoodMaterial` clones it
to set repeat. Seven shelves create repeated identical variants (top, lower,
and two straps). Cache the three sampler variants per theme and share them
across materials; unit tone can remain a material color. Add explicit lifetime
rules for any generated texture that is not module-lifetime shared.

This is a concrete reuse opportunity, unlike the GLB atlases, which are already
shared correctly. Three recommends reusing resources and disposing explicitly
in its [resource disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html).

**Verification:** identical wood close-ups and UV scale; lower
`renderer.info.memory.textures`; 20 theme flips do not increase textures,
programs, or geometries after settling.

#### P7 — Gate offscreen unit animation work, not whole scene rendering

**Benefit:** medium CPU/battery · **Effort:** M–L · **Risk:** medium

The sky, meadow wind, dust, and camera keep this scene legitimately continuous,
so converting the entire canvas to `frameloop="demand"` is not a good first
move. Instead, make unit-specific `useFrame` callbacks return immediately when
their unit is outside active ±1/±2, and stop rendering on document-hidden or
canvas-offscreen states. Keep absolute-time animation so re-entry does not
jump or accumulate drift.

R3F's [on-demand rendering guide](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
documents invalidation for settled scenes; here the useful adaptation is
selective because the global atmosphere never fully settles.

**Verification:** CPU frame time and callback counters across units 0/3/6;
hidden/offscreen frame production approaches zero; no first-frame pop when a
unit enters; interactive hover/grab state remains correct.

#### P8 — Precompile the programs the ladder will actually reveal

**Benefit:** medium transition smoothness · **Effort:** M · **Risk:** longer
boot/wasted compile if overused

After the first visible world is ready, use `renderer.compileAsync()` during
idle time for the small set of real quality/theme variants: composer-off,
low-sky, and both themes. This is especially important if V2 uses compile-time
sky defines or P5 retains multiple effect chains. Three's
[`compileAsync`](https://threejs.org/docs/pages/WebGLRenderer.html) uses
`KHR_parallel_shader_compile` where supported and resolves when compilation is
complete.

**Verification:** no long frame on first decline, recovery, theme flip, or
first unit arrival; boot reveal increase stays within the agreed limit; do not
compile unused combinatorial variants.

#### P9 — Test disabling hardware MSAA only on native-high-DPR touch

**Benefit:** medium memory/bandwidth if it wins · **Effort:** S · **Risk:**
jagged fallback silhouettes

Touch already has no composer/SMAA and native 3× provides substantial spatial
sampling. A controlled experiment can compare the current antialiased default
framebuffer against `antialias: false` at 3×. Because the context attribute is
fixed at creation, this must be a device-path decision, not a runtime rung.
Do not ship it merely because it is theoretically cheaper; the user's sharpness
concern makes silhouette evidence mandatory. WebGL context antialiasing is a
requested attribute exposed through
[`getContextAttributes`](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getContextAttributes).

**Verification:** shelf diagonals, bridge cables, frame corners, and textural
edges at 3× and 2.5×; actual sample count/context attributes; GPU time and
memory on real iPhone. Reject if the 2.5× degraded path visibly stair-steps.

#### P10 — Reduce sky-dome geometry before replacing its architecture

**Benefit:** low–medium · **Effort:** S · **Risk:** low if visually gated

The 160×96 sphere is about 30,000 triangles for one background whose dominant
cost is fragment shading. Test 96×48 and 64×32 while keeping the shader and
camera tracking unchanged. A full-screen triangle with reconstructed view rays
could remove the sphere entirely, but that is a larger rewrite and should only
follow evidence that dome vertices matter.

**Verification:** renderer triangles and GPU time; horizon/skyline coordinate
error at ultrawide and portrait extremes; no visible faceting during pointer
parallax or the seated turn.

### Fine-detail options

#### V1 — Role-based image resolution: sharper hero, smaller supporting media

**Benefit:** high fidelity plus high memory reduction · **Effort:** M–L ·
**Risk:** visible compression or transition pop

Replace the single touch/desktop `coverWidth` with projected-size roles:

- hero portrait / large project frame: larger active-tier source sized for
  physical projected pixels;
- featured book covers: keep the existing smaller widths unless M0 shows
  undersampling;
- small desk photos: generate 256/512 variants rather than decoding every
  local 1024 image;
- adjacent units: optionally preload one tier below the active hero.

This addresses both sides of "detail": the hero portrait can stop sharing a
256 px request with a tiny cover, while the 27 local v8 images need not consume
~104 MiB with mipmaps on mobile. Right-sizing must precede KTX2; dimension
reduction helps every GPU and avoids adding a transcoder.

**Interaction:** update `Scene`'s current per-unit warm queue and
`useUnitLod` policy together. Sticky full-resolution upgrades can erase the
memory win over a full traverse, so define which tier remains resident.

**Verification:** projected texels-per-physical-pixel at each role; hero crops
at iPhone 3× and desktop; total decoded pixel estimate and texture count after
a full traverse; transfer/cold frame; no texture pop on normal travel.

#### V2 — Cloud top tier based on mass + erosion, with compile-time lower tiers

**Benefit:** high visual relevance · **Effort:** M–L · **Risk:** high
full-screen fragment cost

The existing five noise samples produce coverage, but "more octaves" alone is
likely to create busier fog rather than more cloud-like forms. Build the high
tier around:

- a low-frequency macro mass/deck;
- a higher-frequency erosion term that cuts broken edges out of that mass;
- vertically shaped bases and softer tops;
- body self-shading separated from the restrained sun-facing rim;
- two deck speeds/scales only if parallax is visible.

Use shader defines or separate materials so low tiers compile out the primary
field, extra erosion, skyline interactions, and unused effects rather than
carrying them behind `uSimplify` runtime branches. Warm both programs under P8.
During movement, P2 can retain macro mass and drop erosion/detail.

**Verification:** fixed-time/seed coverage, connected-component size, edge
frequency, and body/rim contrast checks in addition to screenshots; opening,
middle, and final traverse; light and seated Washington views; native 3× GPU
time; simplified tier must remain recognizably cloudy.

#### V3 — Shared micro-normal/roughness detail on selected hero materials

**Benefit:** medium–high close-up detail · **Effort:** M · **Risk:** texture
sampling/material-variant growth

Wood grain and couch fabric already have procedural surface response, and GLB
atlas props already carry baked vertex AO. Target missing hero surfaces instead:
book cloth/page edges, brushed metal, matte painted fixtures, and perhaps frame
paper. Reuse a very small set of tiling maps; avoid a unique texture per prop.
Use normal/bump/roughness for lighting detail and spend geometry only when the
silhouette must change. Three documents these channels on
[`MeshStandardMaterial`](https://threejs.org/docs/pages/MeshStandardMaterial.html)
and warns that `MeshPhysicalMaterial` has higher per-pixel cost in its
[`MeshPhysicalMaterial` API](https://threejs.org/docs/pages/MeshPhysicalMaterial.html).

**Interaction:** top-tier only if measurements require it; do not increase
anisotropy globally—`LitImage` is already maxed.

**Verification:** same-DPR close crops under both themes and local lamps;
texture/program counts; GPU timer; no moiré at distance or material recompiles
while scrolling.

#### V4 — Close-LOD silhouette details on only the objects that earn them

**Benefit:** medium · **Effort:** M–L · **Risk:** LOD pop, interaction mismatch

Add seams, cable thickness, bevels, curved page blocks, or small hardware only
to objects that occupy enough physical pixels to show them. Preserve low-poly
far versions and switch with hysteresis. Three's
[`LOD`](https://threejs.org/docs/pages/LOD.html) supports distance thresholds
and hysteresis; the meadow already demonstrates the repo's preferred near/far
vocabulary.

**Verification:** hero close-ups improve; far triangle count stays flat or
falls; no switch visible during scripted traverse; grabbable bounds and named
dev-hook nodes remain correct in every LOD.

#### V5 — Move the photographic warm grade out of per-image canvas processing

**Benefit:** medium startup/compatibility, small visual opportunity ·
**Effort:** M · **Risk:** grade mismatch

`LitImage.warmGrade()` draws each decoded image into a canvas and applies an
8% multiply before upload. Test an equivalent material-color or small shader
multiply so the decoded source remains directly usable and future compressed
textures are not converted back to canvas pixels. Keep instance-local sampler
transforms for crop/focus.

**Verification:** pixel-difference threshold against approved graded images;
main-thread decode/grade time; texture memory; no cross-instance crop mutation.

### Asset and architecture experiments

#### A1 — KTX2/Basis on a representative, already-right-sized subset

**Benefit:** potentially high texture memory/bandwidth · **Effort:** L ·
**Risk:** artifacts, transcoder/loader cost

Only after V1, convert a representative subset—one portrait, one detailed
photo, one low-contrast photo, and one data texture—to KTX2. `KTX2Loader`
detects device support and transcodes Basis textures to a supported GPU
compressed format; see Three's
[`KTX2Loader`](https://threejs.org/docs/pages/KTX2Loader.html) and Khronos'
first-party [KTX overview](https://www.khronos.org/ktx/).

Do not begin by converting all 27 originals. Right-sizing has no runtime
transcoder cost and may remove enough memory pressure by itself.

**Verification:** transfer, transcode, first upload, GPU format, estimated
memory, screenshot artifacts, and context loss on iPhone; preserve fallback
until browser/device coverage is proven.

#### A2 — Stage or hibernate distant GLB unit content only if M0 finds CPU/load pressure

**Benefit:** low–medium given the current ~0.5 MB model set · **Effort:** L ·
**Risk:** visible pop and broken interactions

The scene already preloads models and the GLBs already use Meshopt/shared tiny
atlases. A further asset-pipeline pass is lower priority than images. If M0
shows model mounting or offscreen callbacks are material, mount active ±1/±2
model content while keeping cheap shelf silhouettes resident and assets
predecoded. R3F documents nested low-to-high loading in its
[loading models guide](https://r3f.docs.pmnd.rs/tutorials/loading-models).

**Verification:** cold first frame and mount CPU; fast rail jumps; no missing
seat/click target; exact interaction inventory; no model pop in ordinary
travel.

#### X1 — WebGPU/TSL prototype, not an optimization task

**Benefit:** uncertain future headroom · **Effort/Risk:** very high

The current scene is deeply invested in GLSL `ShaderMaterial`, WebGL-specific
postprocessing, and WebGL dev hooks. WebGPU remains a separate renderer and
would require shader/postprocess parity work. MDN still labels WebGPU limited
availability in its
[`WebGPU API`](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API).
Only select this as an isolated prototype with a WebGL fallback, never as the
next production optimization.

## Options intentionally not recommended as standalone tasks

- **"Add instancing to the meadow."** Already done: two grass draws, terrain,
  and flowers. P4 adds the missing spatial culling dimension.
- **"Add LOD to the meadow."** Already done: detailed near geometry, lighter
  far geometry, and four count rungs.
- **"Increase photo anisotropy."** `LitImage` already requests the hardware
  maximum. Test oblique non-photo textures individually instead.
- **"Bake/freeze the shadow map."** There is no live shadow-map pass. Ground
  pools and shelf/contact shading are analytic. The real-light loop is P3.
- **"Optimize the GLBs with Meshopt and shared textures."** Already done, and
  the placed model payload is small relative to decoded photography.
- **"Lazy-load the WebGL scene/postprocessing and stage all images."** The
  scene and effects are already dynamic; touch skips the effects download;
  `Scene` warms current/adjacent images then trickles the rest. V1 changes the
  resolution/residency policy rather than duplicating this.
- **"Switch the whole canvas to on-demand rendering."** Continuous sky,
  meadow, dust, camera, butterfly, and petal motion make this structurally
  inappropriate. P7 targets offscreen work.
- **"Add more cloud noise everywhere."** The full tier already has five noise
  samples. V2 changes form and makes additional work tier-specific.

## Suggested selection bundles

### Bundle A — performance-first without changing the approved look

M0, P0, P1, P2, P4, P6, P8.

### Bundle B — sharper/more detailed while protecting mobile

M0, V1, V2, V3, P1, P4, P8.

### Bundle C — best balance

M0, P0, P1, P2, P3 spike, P4, P5, V1, V2, P8.

### Bundle D — small low-risk pass

M0-lite, P6, P10, V1 for only the hero portrait plus mobile variants, and a
P9 A/B with no commitment to ship.

## Verification contract for the eventual task list

Whichever items are selected, the implementation task should include these
shared gates:

1. **Visual matrix:** light/dark at units 0/3/6, 2048×613 and 1440×900
   desktop, 390×664 iPhone 3×, 1200×400 ultrawide, and seated Washington.
2. **Motion matrix:** idle 15 seconds, ordinary traverse, maximum-speed fling,
   panel open/close, theme flip, seat enter/exit, bridge fireworks, and
   Salesforce crown.
3. **Quality matrix:** force each rung deterministically; record the effective
   DPR/framebuffer and all enabled features; verify recovery and cooldown if
   selected.
4. **Performance evidence:** three runs per scenario; p50/p95/p99 CPU frame
   time, GPU time where supported, dropped frames, calls, triangles, textures,
   geometries, and programs.
5. **Memory/load:** cold transfer, first meaningful WebGL frame, decoded pixel
   estimate after initial load and after full traverse, theme-flip leak loop,
   and context-loss fallback.
6. **Regression suites:** unit tests, TypeScript, ESLint, the existing
   Playwright specs, `check:meadow`, and `check:budgets`.
7. **Budget:** homepage initial JS remains ≤180 KB gzip; no new runtime CDN;
   no touch download of desktop postprocessing; no credentials or `.env`
   values in artifacts.
8. **Decision rule:** an optimization ships only if the measured target cost
   improves and the predeclared visual crops pass. A detail option ships only
   if its improvement is visible at the actual target framing, not just in an
   isolated close-up.
