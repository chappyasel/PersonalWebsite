# Diagnostics registry work ledger

- Task: `diagnostics-registry`
- Date: 2026-08-21
- Branch: `site-diagnostics-registry`
- Base: `3055138`

## Objective and scope

Make Scene Diagnostics the single declarative inventory for live scene debug,
optional-rendering, and performance controls. The registry must own stable IDs,
presentation metadata, value domains, defaults, session behavior, reload inputs,
and production-cost contracts while existing controllers remain narrow state
adapters.

In scope: inventorying current controls and reload switches; generating the
existing panel sections and bulk actions; adding live controls for optional
render paths that only had query switches; deleting displaced lists and
metadata; guarding off paths; adding tests; running static, unit, lint, and type
checks; and committing the result.

Out of scope: redesigning Scene Diagnostics, changing production quality
resolution, interactive browser testing, browser automation, pushing, or
merging.

## Baseline evidence

### Facts

- `git status --short` returned no entries before edits.
- `SceneDiagnostics.tsx` authored each checkbox, select, range, label, allowed
  value, and controller update inline.
- `diagnosticsOverlayControls.ts` separately duplicated six insect-overlay keys,
  two physics-overlay keys, their aggregate state, and all-on/all-off patches.
- `scenePerformance.ts` held 17 writable performance settings plus a second
  `allScenePerformanceSettings()` list that duplicated every setting and the
  two bulk presets.
- Existing live panel controls covered three camera values, four meadow values,
  one insect behavior value, four physics runtime values, four quality values,
  17 performance values, one inspection scope, and eight overlays.
- Five optional render paths had reload-time switches but no live control:
  composer (`nopostfx`), side tilt shift (`notiltshift`), color grade
  (`nograde`), meadow (`nomeadow`), and authored photo details (`hdPhotos=0`).
- Depth of field already had a live skip control and `nodof`; persistent meadow
  deformation already had a live control and `grassDeformation=off`.
- The experimental persistent-deformation default was off. Cinematic+ was a
  diagnostics-only manual value and was not selected by default.
- Free-roam enablement was the exception to the reload-reset rule: development
  restored it from `localStorage`, despite its controller default being off.
- Fresh Superset worktrees omit ignored `next-env.d.ts`. Without Next type
  generation, static image imports can report false TS2307 and lint errors.
  `SKIP_ENV_VALIDATION=1 yarn next typegen` generates the declarations without a
  build, and `git check-ignore -v next-env.d.ts` identifies `.gitignore:21` as
  its owner.
- The sibling baseline branch at commit `5504078` adds `yarn typegen`,
  `yarn typecheck`, and `yarn verify`; it also fixes the four main-branch unit
  failures and one lint warning encountered below. That commit is intentionally
  not duplicated here.

### Hypotheses considered

- A descriptor registry could retain the existing controllers as hidden state
  adapters without leaving the panel's old switch lists authoritative. This was
  confirmed by generating all writable controls and bulk operations from the
  registry and deleting the old lists.
- Reload switches could seed the same live values before the scene allocates
  resources. This was confirmed for scene-performance values at module load and
  for meadow deformation through a pre-connect seed test.

## Control inventory after consolidation

The registry contains 50 descriptors in 13 sections:

- Simulate / Camera: authored depth, free roam, and free-roam fog.
- Simulate / Meadow wind: base strength, live gust, animation speed, and
  persistent deformation.
- Simulate / Insect behavior: pause automatic landings.
- Simulate / Physics runtime: simulation, visibility resets, held-collision
  probes, and generated statics.
- Render / Quality, Resolution, and Automatic adaptation: mode, resolution step,
  resolution ceiling, and freeze.
- Render / Optional rendering: composer, side tilt shift, color grade, meadow,
  and authored high-resolution photo details.
- Render / Optimizations: settled-prop suspension, Coordination singularity,
  travel-aware prewarm, full visual prewarm, stable light shape, nearby lights,
  and simplified far grass.
- Render / Compositing: practical glow, placard material, effective DPR rungs,
  adaptive sharpening, AO/bloom/DoF skips, and two DoF tuning ranges.
- Render / Scheduling: unit virtualization, remembered travel declines, meadow
  tile balancing, and settled-hover suspension.
- Inspect: scope plus six insect and two physics overlays.

Runtime metrics, trace controls, reset buttons, force actions, and hover
telemetry remain actions or observations rather than registry values.

## Implementation summary

- Added `sceneDiagnosticsRegistry.ts` as the metadata and update seam. Its public
  interface exposes descriptors, generated sections, snapshots, validated
  updates, group operations, optimization presets, and one-time reload-input
  initialization. Store/controller details remain private.
- Store subscriptions are lazy: normal production rendering pays no registry
  invalidation work, and the registry detaches when the last Diagnostics
  observer leaves.
- Each descriptor carries a stable ID, panel/group/subgroup, label/help, value
  kind, allowed values, default, whole-control and value-level experimental
  status, live/effective read behavior, session-only/read-only update behavior,
  reload reset semantics, optional reload input, optional performance-setting
  ownership, and optional active-cost/off-path metadata.
- Generated the existing Simulate, Render, and Inspect controls from generic
  checkbox, range, select, segmented-control, section, and subgroup renderers.
  The panel shell, tabs, status displays, actions, and CSS were not redesigned.
- Moved overlay quick-toggle membership and optimization preset membership into
  descriptors. Deleted `diagnosticsOverlayControls.ts`, its tests,
  `allScenePerformanceSettings()`, the controller `replace()` method, and the
  photo-query helper.
- Added five default-on scene-performance values for previously query-only
  optional paths. Their defaults preserve the shipped scene. Consumers now read
  those live values and branch before composer/pass/meadow/detail work.
- Centralized `nopostfx`, `nodof`, `notiltshift`, `nograde`, `nomeadow`,
  `hdPhotos=0`, and `grassDeformation=off` parsing. The registry reads them once
  at browser module initialization; later live changes win for that mount.
- Removed the displaced `grassDeformationOff` quality-plan argument. The query
  switch now seeds the live meadow controller, while production quality still
  resolves deformation from its unchanged default and quality tiers.
- Added a pending meadow seed so `grassDeformation=off` reaches the renderer even
  when the registry initializes before Meadow connects.
- Removed persisted free-roam enablement. Its optional saved camera pose remains,
  but the live override now starts off on every reload.
- Gated high-resolution detail selection as well as loading. Turning the live
  control off immediately returns to preview sampling; starting off avoids the
  detail load and allocation.
- Added registry integrity, default, complete performance-setting coverage,
  generated UI coverage, reload-input, experimental-status, cost metadata, and
  real zero-work deformation tests. Updated presentation contracts to inspect
  the registry instead of deleted inline metadata.

## Shortcuts taken

### Facts

- The worktree had no dependency install. Instead of a second install, an
  ignored `node_modules` symlink reuses the package-and-lockfile-identical install in
  `../site-green-baseline`.
- Initial type generation used ignored `.env` and `.env.local` symlinks to the
  main worktree after Next's env validation rejected a bare run. The final and
  documented command uses `SKIP_ENV_VALIDATION=1` and does not depend on those
  symlinks.
- No instrumented browser/WebGL test was added for Cinematic+ allocation.
  Browser automation was prohibited; existing source-contract tests prove its
  sun, shadow rig, and God Rays only mount behind the default-off Cinematic+
  condition. Persistent deformation has a renderer-level no-render/no-clear/no-
  texture-allocation unit test.
- The full unit and lint commands are recorded with inherited main-branch
  failures below. Task-focused tests and task-file lint run independently at
  zero failures/warnings. The fixes already exist in sibling commit `5504078`
  and were not copied into this task commit.
- No other implementation shortcuts were taken.

## Issues discovered but not fixed

### Facts

- On base `3055138`, four unrelated unit contracts fail: thin-paper physics,
  the About reading-stack literal, the About silhouette hash, and a brittle
  canvas `gl` literal. Sibling commit `5504078` fixes them and has a green result
  of 195 files / 1,537 tests.
- Full lint on this base reports one unrelated unused `LIFT_LAMBDA` import in
  `reactionArchetype.test.ts`. Sibling commit `5504078` removes it.
- The baseline worktree did not automatically select Node 24 in one non-login
  shell invocation; prefixing its Node 24 bin directory produced the green
  baseline test result. This task worktree selected Node 24.19.0 normally.

### Hypotheses

- None. Each item above was reproduced and has a known fix on the sibling
  baseline branch.

## Ambiguities

- "Performance settings" could include read-only FPS, frame-time, and renderer
  metrics. The registry includes writable and effective control values only;
  metrics remain observations because they have no allowed update domain.
- Cinematic+ is one experimental value inside a broader quality-mode control.
  The model therefore distinguishes `experimental` controls from
  `experimentalValues` instead of marking every quality mode experimental.
- Keyboard shortcuts are alternate inputs to registered values, not separate
  controls. F/Shift+F continue to operate the registered free-roam controller;
  H remains panel chrome.

## Judgement calls and rationale

- Existing controllers remain state adapters behind the registry. Replacing
  their renderer-facing subscriptions would widen the change and mix UI
  metadata with frame-loop ownership; keeping them private to registry update
  adapters gives the module a small interface without duplicating lists.
- Registry initialization occurs at browser module evaluation, before the first
  canvas render. This preserves reload-only query semantics and lets an off seed
  prevent construction rather than removing work after one frame.
- Optional render switches live in `ScenePerformanceSettings` because consumers
  already subscribe to it. New defaults are all `true`, matching the prior
  absence of their rollback queries; no quality profile, tier, DPR policy, or
  learned policy default changed.
- Experimental deformation remains false and Cinematic+ remains unselected.
  Their descriptor cost metadata names the active value and promises zero
  targets, samples, and frame work on the off path.
- Persisted free-roam enablement was removed despite being pre-existing because
  it directly contradicted the explicit reload-reset requirement. Pose memory
  was retained because it does not enable a debug path or do render work.
- The panel gained semantic registry sections for optional rendering,
  optimizations, compositing, and scheduling inside the existing Rendering
  experiments disclosure. No CSS or panel navigation was changed.

## Files changed

- `docs/reviews/2026-08-21-diagnostics-registry.md`: task ledger.
- `src/app/components/stacks/scene/sceneDiagnosticsRegistry.ts`: new deep
  registry module.
- `src/app/components/stacks/scene/sceneDiagnosticsRegistry.test.ts`: registry
  integrity, coverage, reload, default, and off-path tests.
- `src/app/components/stacks/dom/SceneDiagnostics.tsx`: registry-generated
  controls and bulk actions.
- `src/app/components/stacks/StacksCanvas.tsx`: registry initialization import
  and live composer control.
- `src/app/components/stacks/scene/Effects.tsx`: live DoF, tilt-shift, and grade
  controls.
- `src/app/components/stacks/scene/SceneEnvironment.tsx`: live meadow control.
- `src/app/components/stacks/scene/LitImage.tsx`: live detail-load and sampling
  control.
- `src/app/components/stacks/scene/scenePerformance.ts`: optional-render defaults
  and removal of displaced bulk APIs.
- `src/app/components/stacks/scene/meadowDiagnostics.ts`: pre-connect reload
  seed.
- `src/app/components/stacks/dom/ChromeLayer.tsx` and
  `src/app/components/stacks/scene/freeRoamDiagnostics.ts`: reload-reset free
  roam enablement.
- `src/app/components/stacks/scene/quality.ts`: removed the displaced grass
  query argument and renamed the generic tilt-shift disable input.
- `src/app/components/stacks/scene/photoTextures.ts`: removed duplicated query
  parsing.
- `src/app/components/stacks/scene/sceneFirstVisitReset.ts`: complete registry
  query-key cleanup.
- Deleted `src/app/components/stacks/scene/diagnosticsOverlayControls.ts` and
  `src/app/components/stacks/scene/diagnosticsOverlayControls.test.ts`.
- Updated contracts in
  `src/app/components/stacks/dom/ChromeLayer.diagnostics.test.ts`,
  `src/app/components/stacks/scene/PhysicsDiagnosticsOverlay.presentation.test.ts`,
  `src/app/components/stacks/scene/coordinationGlobe.presentation.test.ts`,
  `src/app/components/stacks/scene/freeRoamControls.presentation.test.ts`,
  `src/app/components/stacks/scene/freeRoamDiagnostics.test.ts`,
  `src/app/components/stacks/scene/meadowDeformation.presentation.test.ts`,
  `src/app/components/stacks/scene/meadowDiagnostics.test.ts`,
  `src/app/components/stacks/scene/photoTextures.test.ts`,
  `src/app/components/stacks/scene/quality.test.ts`,
  `src/app/components/stacks/scene/sceneColorGrade.presentation.test.ts`,
  `src/app/components/stacks/scene/scenePerformance.presentation.test.ts`, and
  `src/app/components/stacks/scene/scenePerformance.test.ts`.

`next-env.d.ts`, `.env`, `.env.local`, and `node_modules` remain ignored and are
not part of the change.

## Automated checks

### Passing

- `SKIP_ENV_VALIDATION=1 yarn next typegen`: passed; route types generated in
  0.52 seconds. `next-env.d.ts` remains ignored.
- `yarn tsc --noEmit --pretty false`: passed after type generation in 3.98
  seconds on an intermediate run and 9.94 seconds on the final parallel run.
- Task-file ESLint with `--max-warnings 0`: passed with no warnings in 8.11
  seconds on the final run.
- Broad task-focused unit run: 17 files and 240 tests passed.
- Quality/meadow/registry/Cinematic+ focused run: 5 files, 117 tests passed.
- Earlier focused registry/consumer run: 7 files, 91 tests passed.
- Changed-file Prettier check: passed; every matched file uses Prettier style.
- `git diff --check`: passed.
- Displaced-switch search for direct query reads, the old overlay module,
  `allScenePerformanceSettings`, the old photo helper, and
  `grassDeformationOff`: no matches (`rg` exit 1).
- Sibling green-baseline verification with Node 24: `yarn test --reporter=dot`
  passed 195 files and 1,537 tests at commit `5504078`.

### Failing or constrained

- First full `yarn test` after implementation: 11 failures. Six were stale
  presentation assertions moved to the registry and were corrected. The other
  five included one stale free-roam assertion that sibling baseline work also
  corrected and four unrelated base failures.
- Focused rerun of the five inherited suites after the stale free-roam contract
  correction: 4 failures / 19 passes across 5 files. The four failures are the
  known base issues listed above.
- Full `yarn lint`: exited 0 with nine warnings before task warning cleanup.
  Eight were in task files and were corrected. The final run exited 0 with the
  one remaining base warning: `reactionArchetype.test.ts`'s unused
  `LIFT_LAMBDA`.
- Final full `yarn test --reporter=dot`: 191 files and 1,536 tests passed; four
  files/tests failed on the inherited issues listed above. Total: 195 files and
  1,540 tests.

## Manual review steps

- Compared the original inline panel controls, performance setting keys, overlay
  lists, query consumers, defaults, and controller setters against the 50
  registered descriptors.
- Read each render consumer to confirm the live branch occurs before component
  mount, detail load, pass sampling, or deformation tick work.
- Confirmed persistent deformation disposes its targets when set to off and its
  off tick returns before renderer calls.
- Searched production source for displaced query parsing, overlay helpers,
  `allScenePerformanceSettings`, and `grassDeformationOff`; no live consumer or
  duplicate helper remains.
- Reviewed generated panel source and existing CSS contracts. No interactive or
  browser review was performed, as required.

## Potential regressions and edge cases

- A future performance setting without a descriptor will fail the exact
  performance-key coverage test.
- A future descriptor with a duplicate ID, an out-of-domain default, an
  experimental active default, or no generated section will fail registry
  tests.
- Reload inputs apply once. Client-side query-string mutation without a reload
  intentionally does nothing; live panel updates remain available.
- Turning high-resolution photos off after a detail has loaded stops its
  sampling but retains the shared cached texture for a later live re-enable.
  Starting with the control/query off performs no detail fetch or allocation.
- Turning meadow or the composer off unmounts the optional subtree. React state
  below that subtree resets when it is re-enabled, matching the existing query
  rollback behavior.
- Bulk optimization changes now include the five optional-render settings:
  "optimized" disables those costs and "unoptimized" restores them. Defaults
  are unchanged until a user presses a bulk action.
- Registry store subscriptions exist only while Diagnostics has an observer and
  remain bounded to one listener per underlying controller.

## Rollback notes

Revert the task commit to restore the inline panel, the separate overlay helper,
direct query reads, persisted free-roam enablement, and the former consumer
paths. No database, schema, generated artifact, or persistent production setting
requires rollback. `next-env.d.ts` can be deleted safely because it is generated
and ignored.

## Recommended next steps

- Integrate sibling baseline commit `5504078` before evaluating the combined
  branch with its `yarn verify` entry point; resolve the expected overlaps in
  free-roam and scene-performance presentation tests in favor of the registry
  assertions here.
- Run the combined branch's `yarn verify`. Its known OG freshness check remains
  a separate baseline concern documented by that task.
- If persistent deformation is ever approved default-on, keep its descriptor
  experimental flag/default and query seed in the same review so the registry
  tests force an explicit policy decision.
