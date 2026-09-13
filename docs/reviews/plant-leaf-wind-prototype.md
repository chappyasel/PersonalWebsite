# Plant foliage wind

The work replaces ambient whole-pot sway on every plant. Nine leafy placements move; the cactus stays still. Chappy reviewed the completed expansion and approved shipping it. Foliage wind is enabled by default. The production quality resolver is unchanged.

## Review

http://localhost:3337/?debug=1&quality=balanced

In Scene Diagnostics, open Render → Scene effects and materials → **Plant foliage wind**. Uncheck it for the exact resting shapes. Reload restores the enabled default. All boolean diagnostics controls use checkboxes, including Page transitions; numeric wind controls retain their ranges. Existing meadow speed and power controls drive the plants. Maximum settings deliberately exaggerate the response.

| Placement                           | Model / scene scale              | Ambient animation                     |
| ----------------------------------- | -------------------------------- | ------------------------------------- |
| About–Books seam, large floor plant | monstera / 0.92                  | Flexible stems and individual leaves  |
| About, small cactus                 | cactus / existing authored scale | None                                  |
| About, tiny bowl                    | succulent-pot / 0.1672           | Minimal leaf motion                   |
| About, leafy pot                    | potted-plant / 1.05              | Stem and individual leaves            |
| Systems, snake plant                | sansevieria / 0.18               | Blades bend above fixed roots         |
| Projects, small shelf plant         | potted-plant / 0.78              | Stem and individual leaves            |
| Projects, tall floor plant          | yucca-plant / 0.76               | Leaves only; trunk and branches fixed |
| Musings, tiny bowl                  | succulent-pot / 0.1672           | Minimal leaf motion                   |
| Talks, hanging plant                | pothos / 0.62                    | Vines and individual leaves           |
| Talks, small top-shelf plant        | potted-plant / 0.82              | Stem and individual leaves            |

Pots and soil stay fixed relative to their carriers. Existing hover reactions and dragging can still move a whole prop. Wind freezes while a prop is carried or substantially tilted. No plant retains ambient `Sway`; neutral groups preserve its approved rest hierarchy.

The worker preview remains on port 3337 in the isolated `prototype/plant-leaf-wind` worktree. Restart there if necessary:

```sh
export PATH="/Users/chappyasel/.nvm/versions/node/v24.19.0/bin:$PATH"
pnpm exec next dev --hostname 127.0.0.1 --port 3337
```

## Implementation and diagnosis

The old `Sway` instances ignored meadow controls. The initial foliage prototype also advanced its individual leaf clock independently of meadow speed. A real-driver regression reproduced the problem: maximum 4× speed produced only 1.62× leaf travel. Connecting that clock to the speed ratio fixed the regression. The final test requires more than 2× travel for maximum speed alone, and another greater-than-2× increase when power is also maximized. No meadow or global animation policy changed.

Each model is classified once into fixed parts, stems, and leaves using welded connectivity and measured bounds. Classification does not depend on island order. Counts and attachment distances reject unfamiliar geometry. Quantized Meshopt positions are dequantized before root-space analysis, avoiding clipping above one model unit.

| Model         | Vertices / triangles | Fixed pot/rim/soil triangles | Stem islands        | Leaf islands |
| ------------- | -------------------- | ---------------------------- | ------------------- | ------------ |
| monstera      | 935 / 755            | 198                          | 7 flexible          | 7            |
| pothos        | 874 / 704            | 152                          | 3 flexible vines    | 13           |
| potted-plant  | 813 / 390            | 140                          | 1 flexible          | 14           |
| sansevieria   | 1680 / 1456          | 364 across three islands     | 0                   | 8            |
| yucca-plant   | 996 / 594            | 166                          | 6 fixed wood pieces | 12           |
| succulent-pot | 3710 / 2244          | 206                          | 0                   | 48           |

Leaves attach to the nearest stem surface; stemless blades and rosettes anchor at their lowest authored vertex. Each has a quiet collar sized to its length, capped at 20 mm. A fixed 20 mm collar was unsuitable for the smallest leaves. Flexible stems share a continuous bending field, including the pothos's downward vines outside the planter. Independent leaf motion increases quadratically toward the tip and bends across the blade rather than stretching along it. Attachment coordinates give leaves different timing. Succulent response is deliberately small; woody pieces have zero weights.

Private CPU position and normal buffers preserve the single mesh and its existing material, atlas, UVs, topology, and transforms. Normals use the deformation's inverse-transpose Jacobian. Color, depth, and shadow passes consequently consume the same positions. There are no shader patches, skeletons, new dependencies, render targets, or extra draws. A GPU path could reduce uploads if profiling on actual hardware warrants it, but would need consistent hooks for all material and override passes. A rig would still require authored attachments and weights.

Motion remains zero through registration and dissolve, then ramps in over 2.5 active seconds. Hidden or parked rooms, distant units, modal pauses, and grabbed/tilted props freeze their pose. Resume deltas are capped at 1/30 second. Reduced motion and boot retries restore rest; theme replacement inherits the current pose. Off mounts no foliage frame subscriber and allocates no animation geometry. Cleanup restores the original geometry and raycast method and disposes only private buffers.

## Verification and cost

106 tests pass across eight files. Real-asset regressions cover every fixed part and grounded base, leaf attachments, moving tips, normalized normals, exact float32 rest restoration, source immutability, repeated cleanup, reordered triangles, unfamiliar geometry rejection, and unchanged collider signatures for all five grabbable model types at strong wind. Monstera is scenery and has no Grabbable collider. Driver tests cover dissolve, retry, reduced motion, theme replacement, hidden/offscreen pauses, carrying, and speed/power response.

Measured Node 24 CPU updates, 2,000 samples after warmup:

| Model         | Update p50 / p95 | Upload per active frame | Ordinary / maximum sampled displacement at scene scale |
| ------------- | ---------------- | ----------------------- | ------------------------------------------------------ |
| monstera      | 0.045 / 0.074 ms | 22,440 B                | 17.1 / 51.6 cm                                         |
| pothos        | 0.056 / 0.086 ms | 20,976 B                | 4.1 / 10.3 cm                                          |
| potted-plant  | 0.053 / 0.069 ms | 19,512 B each           | 2.1–2.8 / 10.6–14.3 cm across three sizes              |
| sansevieria   | 0.107 / 0.127 ms | 40,320 B                | 2.5 / 8.3 cm                                           |
| yucca-plant   | 0.042 / 0.053 ms | 23,904 B                | 4.6 / 16.9 cm                                          |
| succulent-pot | 0.308 / 0.398 ms | 89,040 B each           | 3.1 / 7.5 mm                                           |

Displacements are sampled maxima over ten seconds of direct binding updates, not guarantees or measurements of the filtered room driver. Maximum means 4× speed and 10× power. Summed maximum vertex travel per second increases 10.8–13.7× across these models. Estimated worst-case uploads for all nine plants at 60 fps are 20.7 MB/s; normal unit activity limits the plants doing frame work. Tiny succulent bowls have the most vertices despite their small screen size and merit attention in future device profiling.

The six-model headless fixture keeps 15 draw calls, 12,312 submitted triangles including shadows, and five textures in both modes. Geometry count is 8 → 14 → 8 over repeated toggles. Enabled CPU submission p50 is about 0.5 ms and p95 about 0.7 ms, at coarse browser timer resolution. These are not GPU-completion timings. Inspected rest, moving, and strong-wind images show fixed pots and moving shadows. The fixture enlarges the small plants and uses source light atlases; the room retains its approved theme overrides.

Full-room headless verification on port 3337 passes the checkbox, reload reset, fixed monstera wrapper, and visits to About, Training, Systems, Musings, and Talks without browser errors. The original traversal used index 2 for Training; the integration harness corrects it to index 4 to cover Projects. The software renderer runs roughly 2 fps in the full room, so that frame rate cannot establish animation cost or final art quality on normal hardware.

```sh
pnpm exec vitest run src/app/components/stacks/scene/plantWind.test.ts src/app/components/stacks/scene/PlantWindDriver.test.tsx src/app/components/stacks/scene/sceneDiagnosticsRegistry.test.ts src/app/components/stacks/scene/swayMotion.test.ts src/app/components/stacks/scene/eggs.sway.test.tsx src/app/components/stacks/scene/unitActivity.test.ts src/app/components/stacks/scene/physicsColliders.test.ts src/app/components/stacks/boot/worldBootSession.test.ts
pnpm typecheck
pnpm exec tsx scripts/prototypes/plant-leaf-wind-benchmark.ts
node scripts/prototypes/plant-leaf-wind-lab.mjs
node scripts/prototypes/plant-leaf-wind-headless.mjs
pnpm check:room-artwork
```

Use Node 24 on PATH for every command. Targeted ESLint and `git diff --check` also pass. Logs are `/tmp/plant-expanded-{tests,typecheck,lint,bench,lab,headless,artwork-check}.log`. Browser reports are `/tmp/plant-leaf-wind-{lab,headless}.json`; lab images are `/tmp/plant-leaf-wind-lab-{rest,wind,wind-later,strong}.png`. Both browser scripts are explicitly headless. No shared preview was opened or restarted.

## Artwork and limitations

The source-review receipt records the neutral rest groups and zero-motion handoff. All 24 artwork cases pass. Generated changes contain source fingerprints and review metadata only; no approved SVG, capture, model, texture, or drawing bytes changed. Homepage OG freshness remains the base branch's advisory condition and was not recaptured.

This remains a kinematic approximation with no leaf collision simulation. Diagnostic on/off intentionally changes pose immediately; boot, resume, and re-enabling ramp the motion. Existing rest picking and planter colliders do not chase leaves. Maximum wind is an exaggerated inspection setting. Chappy reviewed and approved the completed motion before integration.

All current plant sizes are covered. Future cactus additions should remain static; succulent leaves should retain minimal response. New models need measured fixed parts and attachments rather than assuming these classifiers generalize. Field Notes quality-bar test 2 rules out an award: ambient motion has no qualifying semantic visitor action. No discovery or elapsed-time award was added.

## Integration into `feat/illustrated-room`

Applied the cumulative source changes from `000a999`, `19edac8`, and `489ce78` after `ab7a33f`. The newer shelf assembly, reading order, navigation colors, and responsive shelf spacing remain intact. The worker's old fingerprints were excluded. A reasoned source-review receipt against the combined files produces fingerprint `55edbbe5cbbf322103a1d87bf37c6d6a527e575a57fbf51978d0f4a78ed8ab88`. All 24 full drawings and 24 empty-shelf drawings remain byte-identical.

The integration passes 495 tests across 27 files, Node 24 TypeScript, targeted ESLint, the production build and its search/privacy boundary checks, `check:about-boot`, and the 24-case `check:room-artwork`. The production preview is [port 3334](http://localhost:3334/?debug=1&quality=balanced); the worker's port 3337 remains available.

Headless checks on the combined production build pass the foliage checkbox, reload reset, fixed monstera wrapper, and About, Systems, Projects, Musings, and Talks traversal without browser errors. Two desktop/phone assembly cases retain all six entrance phases; five fresh-context loads enter automatically across desktop, tablet, and Books hash selection. The isolated six-model rendering check retains 15 calls, 12,312 triangles, and five textures. Repeated off/on/off cycles return geometry counts from 8 to 14 to 8. This integration run measured enabled CPU submission at about 0.8 ms p50 and 1.0 ms p95 in the isolated fixture; these are coarse CPU timings, not a full-room GPU performance claim.

```sh
node scripts/prototypes/plant-leaf-wind-headless.mjs --base=http://localhost:3334 --out=/tmp/plant-integrated --gpu=native
node scripts/verify-illustrated-room-entrance.mjs --base=http://localhost:3334 --out=/tmp/plant-integrated-entrance
```

Both scripts stay headless. Integration results are recorded in `illustrated-room-integration-evidence/summary.json` under `plantFoliageIntegration`. Logs use `/tmp/plant-integrated-*.log`. This checkpoint is committed on the feature branch; no push, production deployment, or OG recapture is included.

## Exact changed paths

- `AGENTS.md`
- `docs/reviews/plant-leaf-wind-prototype.md`
- `docs/reviews/illustrated-room-integration-evidence/summary.json`
- `docs/reviews/illustrated-room-integration-run.json`
- `public/images/stacks/boot/books/dark-desktop.registration.json`
- `public/images/stacks/boot/books/dark-phone.registration.json`
- `public/images/stacks/boot/books/light-desktop.registration.json`
- `public/images/stacks/boot/books/light-phone.registration.json`
- `public/images/stacks/boot/manifest.json`
- `public/images/stacks/boot/musings/dark-desktop.registration.json`
- `public/images/stacks/boot/musings/dark-phone.registration.json`
- `public/images/stacks/boot/musings/light-desktop.registration.json`
- `public/images/stacks/boot/musings/light-phone.registration.json`
- `public/images/stacks/boot/projects/dark-desktop.registration.json`
- `public/images/stacks/boot/projects/dark-phone.registration.json`
- `public/images/stacks/boot/projects/light-desktop.registration.json`
- `public/images/stacks/boot/projects/light-phone.registration.json`
- `public/images/stacks/boot/systems/dark-desktop.registration.json`
- `public/images/stacks/boot/systems/dark-phone.registration.json`
- `public/images/stacks/boot/systems/light-desktop.registration.json`
- `public/images/stacks/boot/systems/light-phone.registration.json`
- `public/images/stacks/boot/talks/dark-desktop.registration.json`
- `public/images/stacks/boot/talks/dark-phone.registration.json`
- `public/images/stacks/boot/talks/light-desktop.registration.json`
- `public/images/stacks/boot/talks/light-phone.registration.json`
- `public/images/stacks/boot/weightlifting/dark-desktop.registration.json`
- `public/images/stacks/boot/weightlifting/dark-phone.registration.json`
- `public/images/stacks/boot/weightlifting/light-desktop.registration.json`
- `public/images/stacks/boot/weightlifting/light-phone.registration.json`
- `scripts/generate/room-artwork-inputs/manifest.json`
- `scripts/prototypes/plant-leaf-wind-benchmark.ts`
- `scripts/prototypes/plant-leaf-wind-headless.mjs`
- `scripts/prototypes/plant-leaf-wind-lab.mjs`
- `scripts/prototypes/plant-leaf-wind-lab.ts`
- `src/app/components/route-transition-prototype/Gate.tsx`
- `src/app/components/stacks/dom/SceneDiagnostics.tsx`
- `src/app/components/stacks/illustration/artwork/catalog.json`
- `src/app/components/stacks/scene/ModelProp.tsx`
- `src/app/components/stacks/scene/PlantWindDriver.test.tsx`
- `src/app/components/stacks/scene/PlantWindDriver.tsx`
- `src/app/components/stacks/scene/Scene.tsx`
- `src/app/components/stacks/scene/plantWind.test.ts`
- `src/app/components/stacks/scene/plantWind.ts`
- `src/app/components/stacks/scene/plantWindDiagnostics.ts`
- `src/app/components/stacks/scene/sceneDiagnosticsRegistry.ts`
- `src/app/components/stacks/scene/units/ShelfSucculent.tsx`
- `src/app/components/stacks/scene/units/UnitAbout.tsx`
- `src/app/components/stacks/scene/units/UnitBlog.tsx`
- `src/app/components/stacks/scene/units/UnitProjects.tsx`
- `src/app/components/stacks/scene/units/UnitSystems.tsx`
- `src/app/components/stacks/scene/units/UnitTalks.tsx`
