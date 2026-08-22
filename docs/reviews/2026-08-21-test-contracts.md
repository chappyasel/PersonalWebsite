# Test contracts, tranche 1

Task `test-contracts`. Branch `site-test-contracts`. 2026-08-21.

## Objective and scope

Replace a first tranche of source-text tests with behavior contracts, and
leave a deterministic inventory of what is left.

In scope: the StacksCanvas, Effects, SceneDiagnostics, PlacardLayer, and
CameraRig test clusters, wherever a stable in-process interface can carry the
behavior. Extract pure policy only where it concentrates real rules.

Out of scope, and left alone: the boot-state and diagnostics-registry tasks'
production code; shader-source assertions; Playwright e2e specs.

## Vocabulary

Using the codebase-design terms as defined. A **module** is anything with an
interface and an implementation. Its **interface** is everything a caller must
know, not just the type signature. A **seam** is where that interface lives. An
**adapter** is a concrete thing filling a slot at a seam. The point of this
work is that the interface is the test surface: a test that reads a module's
source text is not crossing its seam at all, so it breaks on a rename and
passes on a behavior change.

## Baseline evidence

Commit `3055138`, clean worktree, `yarn install --frozen-lockfile` first
(the worktree ships without `node_modules`).

`yarn test`: **6 failed, 189 passed (195 files); 6 failed, 1531 passed (1537
tests)**.

1. `scene/aboutBootSilhouettes.test.ts` — silhouette hash mismatch for
   `authored:TJMedallionBody`: expected
   `99f03816559f8dba17594dd54318c97ddb4f3b466026d8924b14ecd2177c35b2`,
   received
   `0474b7333b1bee03d98da1aeae1224f0114b29c616de3cb44810710adebc40de`.
2. `scene/canvasCompositing.test.ts` — expected StacksCanvas source to contain
   `gl={{ antialias: true }}`; the file said `gl={{ antialias: true, stencil:
   true }}`.
3. `scene/freeRoamControls.presentation.test.ts` — "hides the mobile sheet on
   entry and lets H toggle it".
4. `scene/musingsPaperPhysics.test.ts` — settled Y position
   `-0.2747187582970882`, expected greater than `-0.01`.
5. `scene/scenePerformance.presentation.test.ts` — expected Effects source to
   contain `focusRange={golfFocused ? 16.5 : 2.2}`; the file computed the same
   number from `SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE`.
6. `scene/units/aboutReadingStack.test.ts` — `poses[0].base[0]` was `0.745`,
   expected close to `0.71`.

Failures 2, 3 and 5 are the same failure mode three times over: the behavior
was correct and the string had moved. That is the case for this task.

Source-reading baseline, from `node scripts/test-source-reads.mjs` run against
a checkout of `3055138`: **54** test files read a file, **46** of them read
source text, **1078** assertions are made against source text, **7** compare a
generated artifact.

## Implementation summary

### Effects (the biggest single win)

`Effects.contract.test.tsx` renders the real `Effects` component with
`renderToStaticMarkup` and asserts the composer chain it produces: which
passes mount, in what order, and with which props. `@react-three/fiber` and
`@react-three/postprocessing` are replaced with recording adapters, since
those are the two dependencies that cannot run in Node. Everything else is the
real module: plans come from `resolveSceneQualityPlan`, the grade from the
colour-grade controller, Cinematic+ from `sceneQualityController`, the sun
from `registerCinematicSun`.

24 tests now cover pass order, composer configuration, plan-driven bloom and
ambient occlusion, per-theme bloom and vignette values, ACES tone mapping,
grade seeding, RCAS gating and placement, god-rays gating across four
conditions, depth-of-field gating, the three `?no…` comparison switches, and
the pixel-ratio corrector's resize behavior. None of them read a file.

Production change: `shelfDepthOfField.ts` gained
`resolveShelfDepthOfFieldTuning` (whether depth of field mounts, and at what
tuning) and `applyShelfDepthOfFieldTuning` (the imperative writes onto a
mounted effect). Both were inline in `Effects.tsx`. The module already owned
the focus band and the falloff range, so this concentrates every shelf
depth-of-field rule in one place; its test drives a real `DepthOfFieldEffect`.

### CameraRig and free roam

Two new modules, both pure:

- `freeRoamMotion.ts` — key mapping, opposed-key cancellation, the Shift
  precision multiplier, camera-relative translation with world-vertical Q/E,
  diagonal normalisation, the long-frame clamp, pointer-to-look with the pitch
  clamp, frame-rate independent look damping, and the pose-write interval.
- `freeRoamShortcut.ts` — what F should do right now, as an intent. Seven
  guards plus the Shift+F entry rule and the pointer-lock rule.

`freeRoamDiagnostics.ts` gained two things: `freeRoamFogVisible`, which
replaces two opposite spellings of the same rule in `SceneEnvironment.tsx` and
`Meadow.tsx`, and `connectFreeRoamPreference`, which owns the restore-then-
subscribe-then-persist ordering that was spread across a ChromeLayer effect.

`freeRoamControls.presentation.test.ts` (24 source-text assertions) is gone.
`freeRoamControls.test.ts` has 38 behavior tests in its place.

### StacksCanvas

`sceneBackdrop.ts` gained `SCENE_CANVAS_CONTEXT`. The canvas context
attributes and the backdrop are two halves of one decision — the backdrop only
works as fallback pixels while the context keeps alpha — so they now live
together, and `StacksCanvas.tsx` imports the constant instead of spelling it
inline. `canvasCompositing.test.ts` no longer reads a file.

### SceneDiagnostics

`qualityReadout.ts` formats the panel's Rendering card. It concentrates five
rules that were inline JSX: the Cinematic+/forced/auto precedence, the
never-collapse-to-Waiting rule, rendered-step-not-axis-step, the pinned label,
and the DPR/megapixel/axis line. It also ties the step scale to
`SCENE_RESOLUTION_MAX_STEP` instead of a literal `11`.
`SceneDiagnostics.resolution.test.ts` is gone; `qualityReadout.test.ts` has 10
behavior tests.

### PlacardLayer

`placardSurface.ts` holds the paper-mode stylesheet, previously inline in a
3,000-line component, plus a small reader that turns flat CSS into rules.
`placardSurface.test.ts` asks what each selector actually declares rather than
matching formatted text, so it survives reformatting: no backdrop filter on
any paper surface, an opaque fill with no alpha channel, a dark fill darker
than the light one, two grain angles that differ, and every rule scoped to the
mode attribute.

### Inventory

`scripts/test-source-reads.mjs` (also `yarn check:test-source-reads`) walks
`src`, `scripts`, and `tests`, resolves which source files each test reads
through three binding forms, counts assertions made against them, and groups
tests into batches by the source file they lean on hardest. Output is fully
sorted, so two runs over one tree are byte-identical.
`docs/reviews/test-source-reading-inventory.md` is its output plus a
recommended order and the reasoning for each batch.

## Shortcuts taken

- **The Effects contract test mocks the scene store's read hook.** React asks
  an external store for its *server* snapshot during `renderToStaticMarkup`,
  and zustand answers that from a closure over the initial state that nothing
  outside the store can reach — `setState` has no effect on a rendered tree,
  and I confirmed that by trying. The mock reads the same state shape
  directly. What it costs: the test does not prove `Effects` subscribes rather
  than reads once.
- **Depth-of-field tuning VALUES are not observable through the render.** The
  live values are applied in a layout effect, and server rendering runs no
  effects. The gating (mounts or not) is asserted through the render; the
  values are asserted against `resolveShelfDepthOfFieldTuning` and
  `applyShelfDepthOfFieldTuning` directly.
- **One StacksCanvas wiring assertion was moved, not eliminated.** That the
  shell paints `sceneBackdropFor(dark)` and passes `SCENE_CANVAS_CONTEXT` to
  `<Canvas>` has no in-process interface: the component cannot render in Node.
  Rather than drop the coverage, the assertion moved into
  `scenePerformance.presentation.test.ts`, which the inventory already names
  as a later batch, and is labelled there as a wiring fact.
- **`ChromeLayer.diagnostics.test.ts` was only touched where it broke.** It is
  202 assertions of panel copy and belongs to the SceneDiagnostics batch,
  which overlaps the diagnostics-registry task. Two assertions that moved into
  `qualityReadout.ts` were replaced by one pointing at the new module.

Nothing else. No test was replaced with a snapshot, an existence check, or a
smoke test.

## Issues found and not fixed

- **Three baseline failures remain, all outside this task's scope.** Verbatim,
  after the change:
  - `scene/aboutBootSilhouettes.test.ts` — `authored:TJMedallionBody needs
    silhouette regeneration: expected
    '0474b7333b1bee03d98da1aeae1224f0114b29c616de3cb44810710adebc40de' to be
    '99f03816559f8dba17594dd54318c97ddb4f3b466026d8924b14ecd2177c35b2'`. This
    is a generated-artifact hash check doing its job: a source GLB changed and
    the silhouette was not regenerated. Fix with
    `yarn generate:about-boot`, not by editing the test.
  - `scene/musingsPaperPhysics.test.ts` — `expected -0.2747187582970882 to be
    greater than -0.01`. A paper sheet is falling through or off the shelf.
  - `scene/units/aboutReadingStack.test.ts` — `expected 0.745 to be close to
    0.71`. An authored book pose moved 3.5cm.
- **`reactionArchetype.test.ts:3` has an unused `LIFT_LAMBDA` import.**
  Pre-existing; `git diff HEAD` shows the file untouched. The only lint
  warning in the tree.
- **`next-env.d.ts` is gitignored and absent in a fresh worktree.** Without it
  `tsc --noEmit` reports errors on static image imports. Generate it with
  `SKIP_ENV_VALIDATION=1 npx next typegen` before any type check in a clean
  checkout. `next typegen` alone fails on env validation, and the file must
  not be committed. Reported by the coordinator; recorded here and left for
  whoever owns the verification command.
- **`shelfDepthOfField.ts` had a pre-existing Prettier violation** (a three-
  line expression wrap). Running Prettier over my own edits fixed it too, so
  three lines of that diff are unrelated reformatting.

## Ambiguities

- **How far to take PlacardLayer.** The cluster's real policy,
  `effectivePlacardGlassMode`, was already a tested pure function; what
  remained was a stylesheet. I read "wherever a stable in-process interface
  can express the behavior" as covering a stylesheet the module *exports*,
  since CSS text is that module's output rather than its implementation. If
  the intent was a rendered-DOM assertion instead, that needs jsdom, which
  this repo does not have.
- **Whether "generated-artifact hash checks" covers the audio pack.**
  `sceneAudioAssets.test.ts` reads audio bytes for container magic numbers and
  a size budget. Same category in spirit, so it was left alone; the inventory
  says so explicitly because the script cannot classify it automatically.

## Judgement calls

- **Recording adapters over a pure pass-list.** The alternative for Effects
  was extracting a pure `resolveEffectChain()` returning an ordered pass
  descriptor list, with `Effects.tsx` mapping over it. That is a deeper
  module, but it restructures the JSX of the scene's postprocessing chain, and
  browser verification is off the table for this task. Recording adapters get
  the same assertions — order included — at near-zero production risk. The
  pure-chain refactor stays available later.
- **`ComposerPixelRatio` was not extracted.** Its contract is observable
  through the render: the mocked composer context is provided by the mocked
  `EffectComposer`, so a corrector mounted outside the composer would see a
  null composer and never resize. Testing it needed no new module.
- **`freeRoamShortcut` takes a flat event shape, not a `KeyboardEvent`.**
  `isEditableShortcutTarget` needs `instanceof HTMLElement`, which does not
  exist in Node. Leaving that check in ChromeLayer and passing its result in
  keeps the module pure and the nine shortcut rules in one place.
- **`dampFreeRoamLook` does not clamp its own step.** `freeRoamTranslation`
  does, because a long frame there teleports the camera through a wall. An
  exponential approach cannot overshoot, so clamping the look step only makes
  the view lag behind a mouse the user already moved. CameraRig passes the
  same clamped `dt` to both, so behavior is unchanged.
- **`Meadow.tsx`'s fog effect now depends on the snapshot object.** The
  controller freezes each snapshot and returns the same one when nothing
  moved, so depending on the object is exactly as narrow as depending on its
  two fields, and it cannot drift out of step with `freeRoamFogVisible`.
- **The prototype was thrown away.** A scratch
  `scene/__proto.test.tsx` established that `renderToStaticMarkup` can drive
  `Effects` with mocked rendering libraries and that `postprocessing`'s
  `Effect` subclasses construct in Node without a WebGL context. It was
  deleted the moment those two facts were established, before
  `Effects.contract.test.tsx` was written.

## Files changed

New:

- `scripts/test-source-reads.mjs`
- `docs/reviews/test-source-reading-inventory.md`
- `docs/reviews/2026-08-21-test-contracts.md` (this file)
- `src/app/components/stacks/scene/freeRoamMotion.ts`
- `src/app/components/stacks/scene/freeRoamShortcut.ts`
- `src/app/components/stacks/scene/freeRoamControls.test.ts`
- `src/app/components/stacks/scene/Effects.contract.test.tsx`
- `src/app/components/stacks/dom/qualityReadout.ts`
- `src/app/components/stacks/dom/qualityReadout.test.ts`
- `src/app/components/stacks/dom/placardSurface.ts`
- `src/app/components/stacks/dom/placardSurface.test.ts`

Deleted:

- `src/app/components/stacks/scene/composerPixelRatio.contract.test.ts`
- `src/app/components/stacks/scene/freeRoamControls.presentation.test.ts`
- `src/app/components/stacks/dom/SceneDiagnostics.resolution.test.ts`

Modified, production:

- `src/app/components/stacks/StacksCanvas.tsx`
- `src/app/components/stacks/scene/Effects.tsx`
- `src/app/components/stacks/scene/CameraRig.tsx`
- `src/app/components/stacks/scene/Meadow.tsx`
- `src/app/components/stacks/scene/SceneEnvironment.tsx`
- `src/app/components/stacks/scene/sceneBackdrop.ts`
- `src/app/components/stacks/scene/shelfDepthOfField.ts`
- `src/app/components/stacks/scene/freeRoamDiagnostics.ts`
- `src/app/components/stacks/dom/ChromeLayer.tsx`
- `src/app/components/stacks/dom/SceneDiagnostics.tsx`
- `src/app/components/stacks/dom/PlacardLayer.tsx`
- `package.json` (adds `check:test-source-reads`)

Modified, tests:

- `src/app/components/stacks/scene/canvasCompositing.test.ts`
- `src/app/components/stacks/scene/shelfDepthOfField.test.ts`
- `src/app/components/stacks/scene/scenePerformance.presentation.test.ts`
- `src/app/components/stacks/scene/sceneColorGrade.presentation.test.ts`
- `src/app/components/stacks/scene/sceneCinematicPlus.presentation.test.ts`
- `src/app/components/stacks/dom/ChromeLayer.diagnostics.test.ts`

## Automated checks

Run from the worktree after `yarn install --frozen-lockfile` and
`SKIP_ENV_VALIDATION=1 npx next typegen`.

| command | outcome |
| --- | --- |
| `yarn test` (baseline, commit 3055138) | 6 failed, 189 passed (195 files) |
| `yarn test` (final) | 3 failed, 193 passed (196 files); 3 failed, 1614 passed (1617 tests) |
| `npx tsc --noEmit` | clean, no output |
| `yarn lint` | 0 errors, 1 warning (pre-existing, `reactionArchetype.test.ts:3`) |
| `npx prettier --check` on changed files | clean |
| `node scripts/test-source-reads.mjs` | 50 files read a file, 42 read source text, 1011 source-text assertions, 7 artifact checks |

Per-file assertion movement, measured by running the same inventory script
against both trees:

| file | before | after |
| --- | --- | --- |
| `dom/SceneDiagnostics.resolution.test.ts` | 3 | deleted |
| `scene/canvasCompositing.test.ts` | 5 | 0 |
| `scene/composerPixelRatio.contract.test.ts` | not attributable | deleted |
| `scene/freeRoamControls.presentation.test.ts` | 24 | deleted |
| `scene/sceneCinematicPlus.presentation.test.ts` | 19 | 18 |
| `scene/sceneColorGrade.presentation.test.ts` | 20 | 13 |
| `scene/scenePerformance.presentation.test.ts` | 191 | 165 |

Net: 4 fewer files reading a file, 67 fewer source-text assertions, 93 new
behavior tests (24 Effects, 38 free roam, 10 quality readout, 11 placard
surface, 10 shelf depth of field).

Not run: `yarn build` (slow, and the repo asks that it stay unrequested),
`yarn test:performance` (Playwright, and browser tooling is off-limits here).

## Manual review steps

Someone reviewing this should:

1. Read `Effects.contract.test.tsx`'s mocks first. Everything downstream
   depends on them being faithful; the two mocked packages are the render
   library and the pass library, and nothing else is mocked apart from the
   store hook.
2. Diff `Effects.tsx`, `CameraRig.tsx`, and `SceneDiagnostics.tsx` against
   `3055138` and check every extraction is value-for-value identical. They
   are meant to be, and `git diff` is small enough to read in full.
3. Confirm `freeRoamFogVisible` matches both call sites it replaced.
   `SceneEnvironment` said `!enabled || fogEnabled`; `Meadow` said
   `enabled && !fogEnabled ? 0 : 1`. Those are the same predicate written two
   ways, which is why it moved.
4. Load the scene in a browser and press F, then Shift+F, then F again. The
   free-roam refactor is the only change with no browser verification, and
   browser tooling was off-limits for this task.
5. Toggle the placard glass mode in Scene Diagnostics and confirm paper still
   reads as paper. The stylesheet moved file but not a character.

## Potential regressions and edge cases

- **The paper stylesheet is now interpolated, not literal.** If
  `PLACARD_PAPER_SURFACE_CSS` ever fails to import, the style block silently
  loses those rules rather than failing loudly. The test that every rule is
  mode-scoped guards the content; nothing guards the interpolation except the
  one wiring assertion in `scenePerformance.presentation.test.ts`.
- **`freeRoamTranslation` uses module-scoped scratch vectors.** Safe today:
  the function is synchronous and called once a frame from one place. It would
  break if two cameras ever roamed at once.
- **`SCENE_CANVAS_CONTEXT` is a shared frozen-by-convention object.** r3f
  treats `gl` props as constructor arguments and does not mutate them, and the
  stable identity is mildly better than a fresh literal each render. If a
  future r3f version does mutate it, every canvas would share the mutation.
- **The Effects contract test writes `globalThis.window`** for the three
  `?no…` switches and restores it in a `finally`. If a future test in that
  file throws outside the harness, a stub window could leak into later tests
  in the same file.
- **`qualityRenderingReadout` now prints `/${SCENE_RESOLUTION_MAX_STEP}`.** If
  that constant ever stops being 11, the panel text changes with it, which is
  the intent, but it is a visible string change nobody explicitly asked for.

## Rollback notes

Everything is one commit on `site-test-contracts`. `git revert` restores the
baseline exactly, including its six failures.

Partial rollback by cluster, if that is ever wanted:

- Effects: revert `Effects.tsx` and `shelfDepthOfField.ts`, delete
  `Effects.contract.test.tsx`, restore
  `composerPixelRatio.contract.test.ts` from `3055138`.
- Free roam: revert `CameraRig.tsx`, `ChromeLayer.tsx`, `Meadow.tsx`,
  `SceneEnvironment.tsx`, `freeRoamDiagnostics.ts`; delete
  `freeRoamMotion.ts`, `freeRoamShortcut.ts`, `freeRoamControls.test.ts`;
  restore `freeRoamControls.presentation.test.ts`.
- Each other cluster is a single new module plus its test plus one call site.

No migration, no generated artifact, no schema touched. Nothing to undo
outside the repo.

## Overlap to coordinate

- **Diagnostics registry task.** `SceneDiagnostics.tsx` gained one import and
  lost an inline formatting block from `DiagnosticsOverview`.
  `ChromeLayer.diagnostics.test.ts` lost two assertions and gained one. The
  202-assertion SceneDiagnostics batch is the next one worth doing and belongs
  with that task, not against it.
- **Boot-state task.** `ChromeLayer.tsx`'s development effect changed shape:
  the free-roam preference restore and persist moved into
  `connectFreeRoamPreference`. The diagnostics-loader state machine below it
  is untouched. `StacksCanvas.tsx` changed only the `gl` prop and one import.

## Recommended next steps

1. Regenerate the About boot silhouettes and fix the two authored-geometry
   failures. All three are real signals about content, not about tests.
2. Take the TouchInteractionLayer batch (70 assertions). It has the cleanest
   pure interface of anything left and no rendering dependency, so it is the
   best second tranche.
3. Decide whether to add jsdom. Roughly 300 of the remaining assertions are
   about DOM panels, and a real client render would close SceneDiagnostics and
   PlacardLayer together instead of one policy extraction at a time.
4. Convert the shader batches by exporting shader strings as module constants
   and asserting against those. Cheap, mechanical, and it removes two files
   from the list without inventing an interface the GPU does not have.
5. Settle where `SKIP_ENV_VALIDATION=1 npx next typegen` belongs so a clean
   checkout can type check without anyone rediscovering it.
