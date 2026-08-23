# Test contracts, tranche 1

Task `test-contracts`. Branch `site-test-contracts`. 2026-08-21.

Amended the same day after review. What the amendment changed is in
"Amendment after review" near the end; the sections above it describe the
final state, not the first draft.

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
`Meadow.tsx`, and `connectFreeRoamEntryObserver`, which owns the false-to-true
entry edge used to dismiss the mobile sheet. The combined branch deliberately
does not persist the debug enablement toggle; debug overrides reset on reload.

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
mode attribute. The flat-CSS reader those questions go through lives in the
test file. Production ships the stylesheet and never parses it back, so a
parser exported from the module would have been interface nobody calls.

Each of those checks fails closed. An empty or unparsed stylesheet yields no
rules, and a test that iterates zero rules passes without asserting anything,
so the reader's output is asserted non-empty before it is read, and the two
fills are asserted to exist before they are compared. Reducing over an empty
parse gives `-Infinity`, which would have let a deleted dark-mode rule pass.

### Inventory

`scripts/test-source-reads.mjs` (also `yarn report:test-source-reads`) walks
`src`, `scripts`, and `tests`, resolves which source files each test reads
through three binding forms, counts assertions made against them, and groups
tests into batches by the source file they lean on hardest. Output is fully
sorted, so two runs over one tree are byte-identical.
`docs/reviews/test-source-reading-inventory.md` is its output plus a
recommended order and the reasoning for each batch.

It is a report, not a check: it always exits zero and knows nothing about a
budget or a previous run. Its counts are a heuristic LOWER BOUND. Pattern
matching cannot see a source string that crosses a file boundary or reaches
`expect()` through a form the patterns do not spell, so two files are corrected
by hand in the inventory and named in the output under "needs a hand check".
The script never over-counts, so the true figure is the printed one or higher.
The command is named `report:` rather than `check:` for that reason.

## Shortcuts taken

- **The Effects contract test mocks the scene store's read hook.** React asks
  an external store for its _server_ snapshot during `renderToStaticMarkup`,
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
  201 assertions of panel copy and belongs to the SceneDiagnostics batch,
  which overlaps the diagnostics-registry task. Two assertions that moved into
  `qualityReadout.ts` were replaced by one pointing at the new module.

- **An earlier attempt at this amendment was interrupted mid-edit and its
  work was inspected rather than trusted.** The session before this one was
  writing files through shell heredocs and stopped part-way, leaving a dirty
  worktree with no commit and no note of what was finished. Everything in it
  was re-read against the tests and the type checker before being kept, and
  one file was thrown away entirely (see "Amendment after review"). Nothing
  was carried forward on the strength of it having already been written. The
  cost is that the amendment's history is one commit with no intermediate
  steps, so a bisect inside it is not possible.

- **`policyWiring.test.ts` reads source text on purpose.** It is the one place
  the tranche adds source reads instead of removing them: 41 assertions that
  `ChromeLayer` and `CameraRig` CALL the extracted policies. Neither component
  can be reached in process, so the alternative was extractions that could be
  silently unwired while every behavior test still passed. What it costs is
  41 assertions that a rename at a call site will break. The file says to
  delete itself once a DOM or r3f harness exists.

Nothing else. No test was replaced with a snapshot, an existence check, or a
smoke test.

## Issues found and not fixed

- **This isolated branch inherited three baseline failures.** The combined
  review branch resolves them through the green-baseline work:
  - `scene/aboutBootSilhouettes.test.ts` — `authored:TJMedallionBody needs
silhouette regeneration: expected
'0474b7333b1bee03d98da1aeae1224f0114b29c616de3cb44810710adebc40de' to be
'99f03816559f8dba17594dd54318c97ddb4f3b466026d8924b14ecd2177c35b2'`. This
    was a false contract. The generator duplicated medallion geometry and
    hashed the unrelated `AuthoredProps.tsx` file. Do not regenerate it on the
    isolated test branch; integrate green-baseline's shared-geometry fix.
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
  can express the behavior" as covering a stylesheet the module _exports_,
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
- `src/app/components/stacks/policyWiring.test.ts`

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
- `package.json` (adds `report:test-source-reads`)

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

| command                                 | outcome                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `yarn test` (baseline, commit 3055138)  | 6 failed, 189 passed (195 files)                                                                                                                  |
| `yarn test` (final)                     | 3 failed, 194 passed (197 files); 3 failed, 1632 passed (1635 tests)                                                                              |
| `npx tsc --noEmit`                      | clean, no output                                                                                                                                  |
| `yarn lint`                             | 0 errors, 1 warning (pre-existing, `reactionArchetype.test.ts:3`)                                                                                 |
| `npx prettier --check` on changed files | clean                                                                                                                                             |
| `node scripts/test-source-reads.mjs`    | Isolated branch: 51 files read a file, 43 read source text, 1052 source-text assertions, 7 artifact checks. Combined branch: 52, 44, 1058, and 7. |

The three remaining failures are the same three as before this tranche, listed
under "Issues found and not fixed". Every test this task wrote or rewrote
passes. The 41 assertions `policyWiring.test.ts` adds to the report are
deliberate and explained in the inventory under "Source reads kept on
purpose"; without them the tranche's report figure is 1011.

Per-file assertion movement, measured by running the same inventory script
against both trees:

| file                                            | before           | after   |
| ----------------------------------------------- | ---------------- | ------- |
| `dom/SceneDiagnostics.resolution.test.ts`       | 3                | deleted |
| `scene/canvasCompositing.test.ts`               | 5                | 0       |
| `scene/composerPixelRatio.contract.test.ts`     | not attributable | deleted |
| `scene/freeRoamControls.presentation.test.ts`   | 24               | deleted |
| `scene/sceneCinematicPlus.presentation.test.ts` | 19               | 18      |
| `scene/sceneColorGrade.presentation.test.ts`    | 20               | 13      |
| `scene/scenePerformance.presentation.test.ts`   | 191              | 165     |

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
4. Load the scene in a browser and press F, then Shift+F, then F again, then
   toggle free-roam fog from the diagnostics panel. The mobile sheet should be
   dismissed on each entry and left alone while the fog toggle moves. The
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

## Amendment after review

Six findings, all about tests that could pass while the code was wrong.

**Tests that compared a constant to itself.** `freeRoamControls.test.ts`
imported `FREE_ROAM_SPEED`, `FREE_ROAM_MAX_PITCH` and five more, then asserted
that the functions applying them produced those same values. Change the
constant and the test follows it. The seven tuning constants in
`freeRoamMotion.ts` and `GOLF_DEPTH_OF_FIELD_FALLOFF_RANGE` in
`shelfDepthOfField.ts` are now module-private, and their tests write the
authored numbers out: four metres per second, 0.0018 radians per pixel, a
fifty-millisecond step clamp, 16.5 metres of golf falloff. `freeRoamAxes` and
`freeRoamSpeedMultiplier` stopped being exported at the same time. Nothing
outside the module called them, and testing them separately let the movement
tests pass without ever moving a camera. Every movement assertion now goes
through `freeRoamTranslation` and checks a world-space vector.

**A test that asserted two constants were different.** `Effects.contract.test.tsx`
proved `GOLF_DEPTH_OF_FIELD_FALLOFF_RANGE > SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE`,
which is arithmetic, not a contract about the render. It now asserts what the
render can actually show: the pass mounts, and its world-space target is the
active shelf. What the widened range IS belongs to `shelfDepthOfField.test.ts`,
and the file's header now states plainly which chain covers the live tuning.

**A CSS parser exported from production for a test's benefit.**
`readCssRules` was in `placardSurface.ts`, where nothing called it: production
ships the stylesheet and never parses it back. It moved into the test file.

**Placard assertions that passed on an empty parse.** Iterating zero rules
asserts nothing, and `Math.max()` over an empty list is `-Infinity`, so a
deleted dark-mode rule would have compared as darker than the light one. The
rule list is now asserted non-empty, every rule is asserted to have selectors,
and both fills are asserted to parse as three opaque channels before they are
compared.

**Free roam announced an entry on every publication, not on entry.**
`connectFreeRoamEntryObserver` called `onEnabled` whenever the controller
published while enabled, and it publishes for fog changes and pose changes
too. The caller dismisses the mobile sheet, which closes an open panel and
steps browser history back with it, so the repeat calls were not free. It now
tracks the previous state and fires on the false-to-true edge only. An already
enabled controller counts as the first entry. Tests cover the entry, repeat,
re-entry, and disconnect cases.

**Nothing proved the extractions were wired in.** Added
`policyWiring.test.ts`, described above and in the inventory.

### Thrown away in the amendment

An AST rewrite of `scripts/test-source-reads.mjs`. It replaced the regex passes
with a taint analysis over the TypeScript AST, following a binding from a
`readFileSync` through helpers and destructuring to the `expect()` that
consumes it, and it did resolve the two files the regex version cannot
attribute. It also ran a fixed-point pass over every test file in the tree and
did not finish inside two minutes, against a report whose whole value is being
cheap enough to rerun after every batch. Reverted to the committed version,
which answers in 0.07 seconds. The counts it prints are documented as a lower
bound instead, the npm script is `report:` rather than `check:`, and the six
assertions it cannot see are corrected by hand in the inventory.

## Rollback notes

Two commits on `site-test-contracts`: the tranche, then the amendment.
Reverting both restores the baseline exactly, including its six failures.
Reverting only the amendment leaves the tranche as first written, which puts
the tautological tests back; revert both or neither.

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
  201-assertion SceneDiagnostics batch is the next one worth doing and belongs
  with that task, not against it.
- **Boot-state task.** `ChromeLayer.tsx`'s development effect changed shape:
  free-roam entry handling moved into `connectFreeRoamEntryObserver`. The
  combined branch keeps debug enablement reload-reset while retaining pose
  persistence. `StacksCanvas.tsx` changed only the `gl` prop and one import.

## Recommended next steps

1. Integrate the green-baseline shared medallion geometry and its two authored
   geometry corrections. Do not regenerate the false silhouette contract in
   isolation.
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
