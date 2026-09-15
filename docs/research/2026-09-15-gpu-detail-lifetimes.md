# Full-quality composer resource lifetimes

## Finding

Changing a shelf updated the postprocessing composer's React children. The
installed `@react-three/postprocessing` 3.0.5 wrapper responded by removing every
child pass and constructing the merged passes again. Removing the last depth
reader made `postprocessing` dispose the shared depth targets. Adding the same
effects immediately recreated them and initialized the effects again.

The removed merged passes also retained their shader material and effect-change
listeners. Unique shader-program counts hid this retention because multiple
materials can reference the same compiled program.

A separate ownership error affected the photo mask. Its `sceneDepth` property
borrows the composer's depth texture. The base `Pass.dispose()` method scans
texture properties and disposed that borrowed texture when the mask left the
chain.

## Change

The pinned package patch compares the ordered Effect/Pass objects behind the
React children. Prop updates that keep those objects preserve the graph and its
shared depth. Actual graph changes release the generated merged-pass materials
and listeners. React continues to own the individual effects and custom passes.
Composer replacement detaches those children before disposing its own buffers.

`PhotoMaskPass` clears its borrowed depth reference before disposal. Disabling
Color grade in Scene Diagnostics now skips constructing the mask altogether.
The grade follows replacement mask textures when the camera changes.

Shaders, pass order, lighting, shadow settings, resolution, mesh density, LOD,
culling and production defaults are unchanged. The ordinary Showcase path has
no real-time sun shadow map; that remains part of the existing Cinematic+ mode.
The change introduces no optional rendering path or new control.

## Scope decisions

| Area                              | Finding and decision                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Postprocessing and render targets | Repeated child updates rebuilt the same graph and retained merged materials. Fixed ownership and reuse before tuning pass quality.                                                            |
| DPR and resolution                | `ComposerPixelRatio` already synchronizes composer targets after renderer DPR changes. Kept its policy and all resolution limits.                                                             |
| Shader compilation                | `sceneGpuPrewarm` compiles visible color-space variants and uses a disposable 1 by 1 target to upload mounted resources. Unique program counts alone miss the merged-material reference leak. |
| Lighting and shadows              | Kept authored lights, the existing unit-light policy and Cinematic+ shadow settings. Removing these would change the tested workload.                                                         |
| LOD, culling and mesh allocation  | Kept existing unit activity and content tiers. Meadow internals and IllustratedRoom were excluded by lane ownership. No geometry-density or visibility reduction is part of the gain.         |
| Optional grade                    | The existing live Color grade checkbox now avoids constructing the mask when off. No new optional path was introduced.                                                                        |

## Reproduction and evidence

The focused lifetime tests exercise both the public package entry
(`@react-three/postprocessing`, resolving to `dist/index.js` in 3.0.5) and the
installed composer source with real postprocessing objects. Both run through
R3F's context with a test store and renderer surface; no composer, pass, effect,
or disposal method is mocked. They cover unchanged child props, merged-pass
retirement, and composer replacement. The photo-mask test supplies a real
borrowed DepthTexture and verifies that removal leaves it alive. These tests
run in the ordinary Vitest suite included by `pnpm verify`, without a browser
or a macOS requirement.

The Grade contract also invokes its recorded frame callback after the real mask
is disposed. It checks late depth arrival, replacement with a new texture, and
preservation of that binding when disposal clears the mask's borrowed reference.
The callback now ignores a null reference. This is a binding safeguard, not a
claim that React renders a disposed mask today. It neither extends the
composer-owned texture's lifetime nor makes the mask's disposed target safe to
render. Camera changes and the existing Color grade gate still govern the
mask/grade lifetime; live browser lifecycle and visual parity remain separate
coverage requirements.

```sh
pnpm exec vitest run src/app/components/stacks/scene/effectComposerLifecycle.test.tsx src/app/components/stacks/scene/PhotoMaskPass.test.ts src/app/components/stacks/scene/Effects.contract.test.tsx
export COORD=/Users/chappyasel/Desktop/Agents/research/personal-website-performance-overnight
python3 "$COORD/benchmark_lock.py" --author gpu-detail-codex -- bash -c '
  python3 "$COORD/tools/preflight.py" --author gpu-detail-codex --tag allocation-before --json /tmp/allocation-before.json
  PLAYWRIGHT_BASE_URL=http://localhost:3117 pnpm exec playwright test tests/e2e/stacks-gpu-resource-lifetime.spec.ts --workers=1 --repeat-each=2
  status=$?
  python3 "$COORD/tools/preflight.py" --author gpu-detail-codex --tag allocation-after --json /tmp/allocation-after.json
  exit "$status"
'
```

The browser regression counts actual WebGL framebuffer allocations across a
second trip from About (unit 0) to Talks (unit 6) and back. Its quality and framebuffer assertions
prevent a lower-quality path from satisfying the resource assertion.

The same tests fail against the original composer and photo-mask source: four
failures covering graph identity, material retirement, direct-pass ownership and
borrowed depth. With the patch, all 50 focused tests pass. Claude cold review of the working tree found no blocking ownership or appearance
issue. It preceded the commit and did not record an immutable content hash. The
auditor subsequently reviewed commit `1efd70bb` and found no blocker in Effects,
PhotoMask ownership, or the allocation regression; that pass did not re-derive
the package patch internals. The same Claude session then reviewed the full
committed diff with no blocker, including every source/dist hunk. Its binding
SHA256 is `cdaf4e0dd16daf97047c3940cadcd154d1573d939951d4cec8698cc2bd486df6`
for `git show --format=fuller 1efd70bb`; it was independently recomputed after
review. The review receipt distinguishes these scopes.

The original production bundle (`88f46c1f`, build ID
`oHkTRseonI69byVJZP4DS`) passes the basic test and fails the no-meadow and full
cases with **84 new framebuffer objects per warmed round trip** in each. The
DPR 2, 2880 by 1800 buffer and full-postprocessing assertions pass before the
allocation assertion. The run used the exclusive slot and preflight at both
ends. Its timing is excluded because the host was contended.

The patched production bundle (product commit `1efd70bb`, build ID
`eTHphNe6e5tTxtw2X68gh`) passes all six cases: two each of basic, no-meadow and
full. Every measured round trip creates zero framebuffers or textures, deletes
zero textures, and links four programs. Those shared scene-program links remain;
the fix does not eliminate every compilation. All cases retain DPR 2 and the
2880 by 1800 buffer, and report no page errors.

An archived-baseline repeat failed while its temporary server was being repaired.
Those failures occurred before resource assertions and are excluded. A later
repeat served the page and chunks but timed out before scene readiness, also
producing no resource artifacts. Its strict artifact gate failed, and the remaining
cases were stopped. Neither failed repeat supports an allocation or timing claim.
The original valid console red and the six persisted candidate green artifacts
remain the retained proof in `gpu-detail-evidence/allocation-red-green.json`.

The archive was also missing the original `next.config.js`. Restoring its exact
configuration resolved readiness: both original and candidate reached the scene
with no page/console errors or failed requests. The final allocation repeat now
has six valid original artifacts: basic 0/0, no-meadow 84/84, and full 81/81 new
framebuffers. The six candidate artifacts remain zero throughout. The earlier
original full run observed 84; treat these as measured counts, not a universal
84-allocation constant. All twelve artifacts preserve DPR, buffer size and the
required postprocessing policy.

## Extended cold/warm resource result

Both builds completed basic, no-meadow and full profiles, each with a cold load
and warm reload followed by six round trips. All 168 phase validations passed,
including the actual quality-transition journal, and every cell had no page
errors. This instrumented matrix has different phase boundaries from the
allocation regression; its observed original allocation range is 81–87 per trip.

| Profile   | Original FBOs per trip, cold / warm | Patched FBOs per trip | Original program references, first to sixth return, cold / warm | Patched references, every return, cold / warm |
| --------- | ----------------------------------- | --------------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Basic     | 0 / 0                               | 0                     | 2471 to 2471 / 2470 to 2470                                     | 2469 / 2469                                   |
| No-meadow | 81–87 / 84–87                       | 0                     | 2685 to 3380 / 2700 to 3415                                     | 2498 / 2498                                   |
| Full      | 81–84 / 81                          | 0                     | 2788 to 3478 / 2783 to 3458                                     | 2596 / 2596                                   |

The postprocessed profiles accumulate 675–715 program references from their
first to sixth return in the original build and zero in the patch. These are
Three.js program reference counts, not unique shader programs or retained heap
bytes. Steady trips still link four scene programs in both builds. First-trip
asset uploads remain; subsequent patched trips allocate zero textures, while
original postprocessed trips allocate 162–174 textures.

The inventories match between builds at return: basic 178 textures / 777
geometries / 95 unique programs, no-meadow 216 / 779 / 108, full 219 / 790 / 128.
All phases retain DPR 2 and a 2880 by 1800 drawing buffer. No rendering detail was
removed to obtain the resource result.

Chromium exposed ANGLE Metal on Apple M5 Max and the asynchronous GPU timer
extension. GPU query samples were captured, but their durations are excluded.
Both clean timing attempts stopped before launching a browser because preflight
reported contention. All four preflights bracketing the GPU/resource matrices
also reported contention. There is **no accepted p50/p95/p99/max, missed-frame,
long-frame, cold/warm startup-time, or GPU-time comparison** from this session.

Unforced `performance.memory` readings were coarse and constant within each
cell: original basic 157 MB, no-meadow 139 MB, full 167 MB; candidate basic
167 MB, no-meadow/full 139 MB. These samples cannot establish retained-memory
slope or bytes saved. They do not contradict the asset lane's separate post-GC
heap-growth finding. Program-reference growth is the useful lifetime evidence
here; broader retained-memory investigation remains a handoff.

Compact results and raw-file digests are in
`gpu-detail-evidence/cold-warm-resources.json`. The PR remains a draft with timing
and precise retained-memory evidence explicitly unavailable.

## Timing protocol

```sh
BASE=http://localhost:3117 python3 "$COORD/benchmark_lock.py" --author gpu-detail-codex -- node scripts/stacks-gpu-detail-benchmark.mjs --out /tmp/gpu-detail.json --preflight "$COORD/tools/preflight.py" --require-quiet
BASE=http://localhost:3117 python3 "$COORD/benchmark_lock.py" --author gpu-detail-codex -- node scripts/stacks-gpu-detail-benchmark.mjs --out /tmp/gpu-detail-gpu.json --preflight "$COORD/tools/preflight.py" --gpu --cycles 6 --seconds 2 --repeats 1
```

The auditor accepted this runner's G10/G11/G12 methodology at SHA256
`1f53a8d6326625d37ac6eabce0698d294054a8568d82ee4401ea0b71335bd8bb`.
That receipt accepts the method, not any timing result. Keep method changes in a
separate commit from the deterministic allocation regression.

Every browser run and build uses the overnight coordination lock. Quotable
frame timing additionally requires the shared preflight to report quiet before
and after the capture. Earlier captures, including the first locked baseline,
are provisional because the auditor found foreign browser GPU activity. They
are excluded from speedup claims.

The runner and production allocation test use Chromium with the Metal backend on
macOS. The matrix forces Showcase at 1440 by 900 CSS pixels and DPR 2. Basic removes
meadow and postprocessing; no-meadow removes only meadow; full retains both.
Each cold profile gets a fresh browser process, user profile and disk cache, then a warm-cache reload. OS and driver caches remain uncontrolled. The second
repeat reverses profile order. Both builds use the same harness instrumentation.
These headless measurements target an 8.333 ms budget and do not establish
physical-display presentation at 120 Hz.

Clean runs record raw RAF timestamps and intervals, p50, p95, p99, maximum,
frames above 50/100 ms and missed slots against measured idle compositor cadence.
A `missed120` count exists only when the idle median demonstrates approximately
120 Hz. Headless 60 Hz cadence cannot establish a 120 Hz missed-frame result. Each phase records focus, visibility, coarse quality samples and the quality
controller's serialized transition journal before and after. The sampler's separate
`measurement.transitions` field is unused because it has no producer. Travel windows end at the destination after the moving flag clears; settled
windows begin after that boundary. Boundary polling is every 200 ms, so travel
windows can include up to 200 ms of settled time. The separate GL-instrumented run omits frame
time summaries and records allocation,
program-link and draw commands, compiled-program references, and asynchronous
GPU timer queries when the driver exposes them. The exploratory baseline used
ANGLE Metal on Apple M5 Max and exposed the timer extension. Its query times
remain provisional; they are not a GPU speedup claim. GPU query results from another
phase or a disjoint interval are discarded. Heap samples are unforced-GC trend
evidence, not a retained-memory measurement.

## Validation and integration

- Frozen-lockfile install, lint and typecheck: pass.
- Focused ownership regressions: original source 4 failures / 11 passes; patched
  composer, mask and Effects contracts 50 passes.
- Repository suite: 563 files / 4,749 tests pass; 3 files / 24 tests skipped.
- Clean standard production build and both postbuild boundaries: pass.
- Production resource regression: original basic passes, no-meadow and full fail
  on 81–84 allocations; patched three profiles repeated twice all pass.
- Claude working-tree ownership review: no blockers. Production-distribution
  coverage is supplied by the browser red/green regression. Its suggestion to
  clear the retired graph reference is included. The auditor's exact-commit
  Effects/mask review also found no blocker; additional live toggle/camera
  browser coverage and a null-depth guard were raised as P2 follow-ups.

The separate prerequisite `d39361f0` copies frame lane's `ba478117` CDP trace
boundary cast and explanatory comment. Apply only one copy when integrating the
lanes. It fixes an existing typecheck error and is not a runtime dependency.

## Limits and handoff

The source and browser evidence, logs, review receipt and original/patched scene
bundles are archived under
`/Users/chappyasel/Desktop/Agents/research/personal-website-performance-overnight/artifacts/gpu-detail-codex`.
Bundle hashes are recorded in `scene-bundle-receipt.json`. Compact allocation and
resource-trend summaries live beside this report in `gpu-detail-evidence/`.

The package patch includes source and distributed JavaScript because production
imports the bundle. Follow the upgrade requirements below before changing its
version.
Effect convolution attributes are constructor-set in the current scene. The
identity guard assumes those attributes remain fixed for each effect object;
revisit the guard if a future effect changes its grouping attributes live.

The public-entry regression verifies the distributed composer lifecycle without
WebGL. The production-browser allocation test is still required to verify actual
GPU allocations; neither test establishes pixel parity.

## Exact-version patch upgrade requirements

The patch key in `pnpm-workspace.yaml` is
`@react-three/postprocessing@3.0.5`; the file is
`patches/@react-three__postprocessing@3.0.5.patch`. The reviewed dependency set
also pins `postprocessing` to 6.39.4 and `three` to 0.185.1. A different wrapper
version does not inherit this patch. An unapplied-patch install error must be
resolved by reviewing the new version, not by dropping the patch key or
disabling pnpm's patch checks to get an install through.

For a wrapper upgrade:

1. Inspect the new package's `exports` and composer implementation. Check whether
   upstream now preserves unchanged ordered child objects, releases generated
   materials/listeners, and detaches React-owned children before composer
   disposal. If it does, remove this patch and its workspace entry together,
   regenerate the lockfile, and verify the unpatched upstream behavior.
2. Otherwise use `pnpm patch @react-three/postprocessing@<new-version>` and
   `pnpm patch-commit <edit-directory>` to create a newly reviewed patch. Update
   both source and the actual exported JavaScript; do not rename the old patch
   or assume a source-only change reaches production. Review generated output
   and package-entry changes explicitly. Never edit an installed package in the
   shared pnpm store.
3. Recheck `EffectPass.setEffects`, listener removal, base `Pass.dispose`,
   shared-depth ownership, and React cleanup behavior when either rendering
   dependency changes. The current patch relies on those contracts, not just
   the wrapper version. Effect grouping attributes must remain fixed for each
   retained Effect object.
4. Run a frozen-lockfile install in each consuming worktree after updating its
   branch. Run both public-entry and source lifecycle cases, the mask and Grade
   contracts, full `pnpm verify`, and a clean production build. Prove that the
   public-entry cases reject the original lifecycle fault using an affected
   unpatched version or a deliberate mutation in a private test copy, without
   mutating the shared store.
5. Repeat the production allocation regression for basic, no-meadow, and full
   profiles with unchanged quality and DPR. Include grade toggles and camera
   replacement in any live lifecycle review. Serialize these checks and builds
   through the coordination wrapper while lanes share the machine. Quiet
   preflight at both ends is required for timing claims; successful allocation
   tests or a stable control do not waive it.

The first normal `pnpm build` stopped in the private Dad-content fetch; the
worktree lacked its cached content and fetch credential. A clean direct Next
build passed, then the search boundary check correctly rejected its absent
private index. The repository documents `content/dad` as an ignored symlink to
the main checkout's cached content. Adding that local symlink lets the normal
prebuild generate the private index without fetching or displaying credentials.
The clean standard `SKIP_ENV_VALIDATION=1 pnpm build` subsequently passed under
the shared lock: prebuild, Next compilation and type validation, 605 generated
pages, and both the search and weight-log postbuild boundaries. The environment
flag skips deployment-secret validation for this local build.
Frozen-lockfile install, lint, typecheck and the full suite have passed: 563 test
files and 4,749 tests, with 3 files and 24 tests skipped.

No Field Note was added. Quality-bar test 1 rules it out: this repairs existing
rendering and adds no visitor discovery.

The resource ownership rules agree with the [Three.js disposal guide](https://threejs.org/manual/en/how-to-dispose-of-objects.html)
and the [postprocessing EffectPass lifecycle](https://pmndrs.github.io/postprocessing/public/docs/file/src/passes/EffectPass.js.html).
