# Mobile quality recovery implementation log

Date started: 2026-08-20

Related spec: [Mobile adaptive-quality recovery](./2026-08-20-mobile-quality-recovery-spec.md)

## Current gate

Gate 1, production observability, Gate 2, corrected decline/lifecycle policy,
the texture/geometry residency gate, and the constant nearby-light shader-shape
device gate are complete. Full visual residency and the bounded, stable
nearby-light shape are production defaults. Both retain live diagnostic
rollbacks. The post-interaction physics regression is fixed by bounding the
thin-body anti-tunnelling step; the release gate is complete.

## Work checklist

- [x] Map reducer, snapshot, hooks, diagnostics, and persistence seams.
- [x] Add red tests for the transition journal.
- [x] Add red tests for compact policy presentation.
- [x] Implement a bounded journal with no extra per-frame measurement.
- [x] Publish the journal through the cheap read-only diagnostics path.
- [x] Replace misleading compact renderer counts with policy evidence.
- [x] Provide a downloadable log payload for device runs.
- [x] Run focused and broad regression checks.
- [x] Record device test instructions and log retrieval steps.
- [x] Decode and classify the first iPhone transition journal.
- [x] Add red tests for the confirmed Gate 2 controller defects.
- [x] Implement the Gate 2 correctness fixes.
- [x] Repeat the production device experiment before tuning recovery.
- [x] Isolate traversal stalls from steady-state rendering cost.
- [x] Validate full unit texture/geometry residency on the iPhone.
- [x] Run the all-light shader comparison and classify its multi-second stall.
- [x] Add a reversible constant nearby-light shader-shape experiment.
- [x] Accept that experiment from a fixed-profile iPhone device trace.
- [x] Bound the thin-body physics step and retain anti-tunnelling coverage.

## Working hypotheses

1. Repeated travel borrowing reaches the resolution floor before repayment.
2. A GPU clock survives a document hide and triggers a downgrade on resume.
3. Noisy sample windows reset the unhelpful-cut budget and permit a walk to the
   floor.
4. Persistence restores the resulting floor before fresh evidence can challenge
   it.

The journal must distinguish these paths. This gate does not select one as the
cause.

## Constraints

- Preserve unrelated work in the dirty tree.
- Do not use interactive browser automation.
- `?hud=1` must keep Auto active and must not mount full instrumentation.
- Disabled diagnostics must add no per-frame work.
- No adaptive-quality threshold or axis decision changes in this gate.

## Existing worktree overlap

The user has active changes in `ChromeLayer.tsx`,
`ChromeLayer.diagnostics.test.ts`, `SceneDiagnostics.tsx`, and
`SceneDiagnostics.module.css`. Any necessary edits in those files must be
minimal and preserve the free-roam and coordination diagnostics work already
present. The quality reducer, compact HUD presenter, and canvas were clean at
the start of this gate.

## Decisions and judgment calls

### 2026-08-20: Journal before policy changes

The phone screenshots prove a persistent low-resolution outcome, but the
production build currently loses the reason for each axis change. This gate
adds bounded observability first so the next behavior change is based on the
same device and interaction sequence.

### 2026-08-20: TDD seams

Reducer tests will own transition capture and capacity. Presentation tests will
own compact labels. Existing diagnostics contract tests will verify that HUD
mode remains cheap. This avoids a browser-dependent feedback loop.

### 2026-08-20: Observe around the reducer core

The existing reducer became an internal policy core. Its exported wrapper
compares the old and new axis triples and appends records only when a value
changed. This central seam covers early returns and multi-axis force or restore
events without adding log calls to every policy branch. The original next state
is returned unchanged when no axis moved.

### 2026-08-20: Store the complete decision window

Sample-driven records retain the target, sample count, frame p50 and p95,
dropped ratio, CPU p50 and p95, GPU p95 when available, and the classified
constraint. The extra `gpuMs` field distinguishes measured GPU pressure from
Safari's inferred GPU pressure. Travel, restore, and force records use null
metrics because no sample caused them.

### 2026-08-20: Preserve first-mount restore behavior

First-mount learning previously bypassed the reducer. It now passes through a
restore event so the initial axis changes are visible, then restores the prior
initializer's effects-retry value. This avoids silently changing effects policy
inside an observability-only gate.

### 2026-08-20: Download after measurement

The compact HUD remains the measurement surface. At the end of a run, opening
the full console and choosing `Download quality log` exports the retained
decisions plus current controller clocks, plan, device, viewport, renderer, and
query-flag names. Opening the console stops later samples from affecting Auto,
so it is an end-of-run action. Safari remote inspection can instead call
`window.__stacks.qualityLog()` without opening the console.

### 2026-08-20: Validation label waits for its owner

The compact row shows resolution step, constraint, frame p50, CPU p50, and the
latest transition. Persistence validation is intentionally absent in this gate
because the reviewed plan requires one pure eligibility predicate shared by
storage and diagnostics. Displaying a provisional approximation would create
the two-owner bug the spec rejects.

### 2026-08-20: The still-session floor was sample-driven

The first iPhone journal contains eight axis transitions. Six resolution cuts
occurred while the page was still, all with reason `sample-pressure`, from step
6 to step 0 between 27.185 and 36.505 seconds after navigation. There was no
`travel-borrow`, `travel-repay`, restore, or force transition.

WebKit exposed no GPU timer, so every GPU verdict was inferred. The six cut
windows had median frame intervals from 20 to 26 ms, p95 values from 38 to 50
ms, dropped-frame ratios from 10.1% to 53.4%, and median main-thread costs of 6
ms. This is real sustained frame pressure, but the log cannot prove the GPU is
the resource causing it.

The cuts followed the 1.5-second resolution dwell almost exactly. A small
median improvement after a cut reopened the current decline logic, allowing
another cut while the overall result remained outside the frame budget. This
confirms the need to keep the ineffective-cut budget monotonic and to make the
GPU-run requirement explicit. It does not justify removing the 0.60 floor:
sustained validated pressure must still be allowed to reach it.

Effects moved from lean to minimal at 40.686 seconds under the same inferred
GPU pressure. Much later, the traverse produced only one content transition,
reduced to minimal with reason `travel-budget` at 543.266 seconds. Exiting and
returning to Safari did not itself change an axis in this run.

At capture time the page remained at step 0 with a 17 ms median, 46 ms p95, and
7.8% dropped frames. The screenshots also contain later 3% to 6% dropped-frame
windows after the phone recovered, but the current controller has no
resolution-only candidate path outside strict headroom. The recovery dead zone
is therefore reproduced separately from the decline path.

The downloaded file arrived as a Safari WebArchive whose main resource is the
JSON blob rendered inside a `pre` element. No transition data was lost. A later
gate should prefer the Web Share file API on iOS so the export arrives as JSON
without this wrapper.

### 2026-08-20: The two planned decline guards were not sufficient

Claude Code independently replayed the field windows through the corrected
reducer. Sustained-GPU timing and a monotonic ineffective-cut counter still
reached step 0: every lower step looked locally better than its immediate
predecessor, so the counter never filled.

The inferred-GPU decline now retains the window that opened the whole descent
and compares later results with that anchor. A deterministic closed-loop test
using the observed per-step response stops after the existing two-cut budget
instead of walking to the floor. Measured GPU timers remain authoritative and
can still use the full ladder.

### 2026-08-20: Mixed CPU tails are not GPU proof

All six field cuts had a 6 ms median main-thread cost but an 11 to 13 ms p95
main-thread cost. Without a GPU timer, the old classifier used only the median
to declare the GPU clear of responsibility for a 38 to 50 ms frame tail. The
inferred-GPU branch now returns no verdict when the same window's CPU p95 is
already over the existing CPU-pressure line. A real GPU timer still outranks
that guard.

This is intentionally conservative. `unknown` preserves image quality while
the next device run determines whether content, browser scheduling, or GPU work
outside the timer-less inference owns the tail.

### 2026-08-20: Complete windows before policy

The extracted sampler now owns visibility resets and drops the first two
lagging CPU samples after resume. It records the elapsed span represented by a
window; production windows shorter than 90% of the two-second target cannot
move policy. After an axis changes, the reducer also waits until a complete
rolling window has replaced the pre-change frames before judging the result.

### 2026-08-20: Persistence requires validation

One pure status function owns persistence scheduling and the compact HUD's
`V` marker. It blocks storage before boot, during foreground validation,
travel, travel debt, instrumentation, freeze, an unfinished comparison, or an
unvalidated axis triple. A later improved decline or strict-headroom window
can validate the current triple. Hide, resume, travel, force, restore, boot,
and every new axis transition invalidate earlier evidence.

Automatic triples are now stored with `profile: null`; they are no longer
mislabelled Showcase. The storage version stays at v9 for this corrected-policy
experiment. It will change when recovery semantics land, at which point older
version keys must be pruned by parsed integer rather than prefix.

### 2026-08-20: Claude review calls

Accepted review findings:

- anchor the full inferred-GPU descent rather than each adjacent cut;
- require a complete post-change window;
- reject inferred GPU verdicts with a CPU-bound tail;
- reject short production windows;
- require fresh validation before persistence;
- store no preset label for an automatic axis triple;
- add a bounded lifecycle journal alongside axis transitions.

Deferred until the corrected phone run:

- recovery envelope and sustain constants; the proposed 20.8 ms p95 line may
  be too strict for this phone's normal scheduling tail;
- storage version bump and safe pruning;
- Web Share export for iOS;
- richer per-transition comparison context and a larger journal.

Not adopted:

- Disabling resolution changes on all WebKit devices would remove automatic
  resolution adaptation rather than repair it. The existing optional lock is
  still not wired in production; keep this explicit ambiguity for review.
- Requiring a CPU verdict before honoring the travel budget would discard the
  direct evidence from the multi-second traverse freezes. Travel remains its
  own evidence source and content remains its bounded after-the-fact lever.

### 2026-08-20: Corrected-policy phone run separated policy from capacity

The corrected Auto run held resolution step 6 for the entire 281-second
session and recorded no axis transitions. It survived a 10.4-second hidden
interval, two traverses, and a later settled window without changing DPR,
effects, or content. The visibility lifecycle reset and the conservative mixed
CPU-tail guard therefore behaved as designed.

The final Auto window was still slow: 26 ms median, 52 ms p95, 61.4% dropped,
6 ms median main-thread submission and 12 ms p95 submission. The controller
correctly called that mixed window `unknown`; it no longer spent resolution on
evidence that could not identify pixels as the scarce resource.

A forced Efficient run then reached the same roughly 35 FPS at DPR 1.50 that
Auto reached at DPR 1.44. Efficient also removed dust, simplified the sky and
far grass, reduced petals, and used reduced content. This rules out framebuffer
resolution as the primary limit and makes the pending resolution-recovery gate
premature: there is no measured 60 Hz capacity to recover into yet.

### 2026-08-20: The performance trace exposed a 250 ms telemetry hitch

The Efficient trace captured 8.826 seconds after the page had already settled
into the slow state: 319 stationary frames, 36.18 FPS, 25 ms median, 50 ms p95,
and 46.7% dropped. It contained no travel, no physics time, no quality
transition, and no program or texture-count change. WebKit advertised neither
the `longtask` nor `long-animation-frame` performance entry type, so the empty
arrays for those signals are non-evidence rather than proof that JavaScript did
not stall. Two 177–188 ms PostHog fetches overlapped the capture but did not
explain a slowdown that filled the entire trace.

Renderer load was steady at 306–337 calls, 681,004–681,884 triangles, 51
textures, and 81 programs. Every frame at or above 40 ms carried 327–337 calls;
those frames recurred roughly every 250 ms. That is the quality sampler's exact
publication interval.

The sampler was doing two things that telemetry must not do:

- `setLiveMetrics` put every fresh metrics object into `StacksCanvas` React
  state, waking the Canvas subtree four times per second;
- `publishRuntime` replaced the same external snapshot consumed by every
  meadow, model, effects, and environment control subscriber, waking them a
  second time for diagnostics-only data.

The fix separates runtime telemetry from the cold scene-control channel,
stores sampled metrics in a ref, keeps the closed diagnostics drawer
unsubscribed from runtime updates, and preserves reducer identity when an
`unknown` sample changes no evidence clock. Axis changes still render normally.
Three red tests cover the subscription boundary, ref-backed metrics path, and
identity-preserving unknown verdict.

This explains the periodic 46–58 ms hitch but not the 21–30 ms baseline between
hitches. That remaining interval coincides with roughly 310 draw calls and
681,000 triangles at only 0.56 MP. The next controlled phone run must compare
the fixed Efficient scene with `nomeadow`; only then is it justified to spend
visual content rather than chase another controller threshold.

### 2026-08-20: Fixed-build A/B ruled out the meadow and exposed lazy GPU initialization

The fixed Efficient idle trace
`c0d27bb4-b29d-4647-8999-e4991d4a06e0.webarchive` captured 19.784 seconds,
1,178 stationary frames, 59.59 FPS, 17 ms median, 19 ms p95, 0.68% dropped,
and a 54 ms maximum. It recorded no long task, long animation frame, React
commit, or periodic 250 ms renderer-count pattern. This confirms the telemetry
fan-out fix rather than merely showing one favorable HUD instant.

The `nomeadow` traversal trace
`ac24bf30-c9f4-4729-a23c-791b9133d6ad.webarchive` separated steady capacity
from movement stalls. Settled frames held 60.05 FPS at 17 ms p95. Travel fell
to 37.95 FPS at 77 ms p95 with a 556 ms maximum. Removing the meadow therefore
does not remove the navigation freeze.

The decisive signal was resource initialization during travel. Across the
trace, renderer programs rose from 61 to 194, textures from 50 to 127, and
initialized geometries from 102 to 463. Frames with a program increase
averaged 11.28 FPS with 233 ms p95; frames with no program, texture, or geometry
increase averaged 58.17 FPS with 18 ms p95. The proximity LOD was mounting
role-sized visual children only when a shelf became near, and the existing
shader prewarm ran before those Suspense children existed. Safari paid shader
creation, texture upload, and geometry initialization inside the traverse.

The fix makes the already-right-sized unit visuals resident before interaction
and performs one 1×1 offscreen draw after the default asset manager is quiet.
That draw uploads the complete mounted graph without a scene-sized render
target, restores exact root visibility, frustum, shadow, and renderer-target
state, and marks its sample window as instrumented so Auto cannot learn from
it. `Preload all shelf visuals` is a live Scene Diagnostics switch; disabling
it restores the old proximity path for an exact A/B.

The memory judgment is deliberate. The role-sized photo set is about 3.69 MP,
18.7 MiB mipmapped, and 686.8 KiB transferred, not the retired 20.43 MP /
103.7 MiB full-resolution set. Keeping those previews resident trades bounded
memory for eliminating repeated allocation and compilation in the user's
latency-critical gesture.

### 2026-08-20: Median-aware inferred-GPU validation stops ineffective blur

The quality log
`0590bc94-1947-4a53-94f9-916ad2457bc8.webarchive` recorded two distinct
pressure episodes. The later one moved from R4 to R0 while median frame
interval stayed at 24–26 ms: p95 eased from 40 to 34 ms, but the browser
remained near 35–40 FPS. The controller accepted the p95 change as proof that
pixels were the bottleneck even though spending four resolution steps did not
restore presentation cadence.

A deterministic reducer replay now locks this sequence. For inferred GPU
pressure with a continuously late median, a DPR cut must either improve p50 by
10% or restore p50 to the accepted cadence. Tail-only improvement no longer
reopens the ladder. The captured sequence stops at R2 after the two-cut
inference budget rather than falling to R0. Measured GPU timing retains the
full ladder, and a real inferred pixel bottleneck can continue when median
cadence materially improves. All 103 quality-axis tests pass.

The policy storage key moves from v9 to v10. A v9 entry may contain a floor
learned from this ineffective staircase, so restoring it would carry the bug
across reload even after the reducer was corrected.

### 2026-08-20: External review tightened scheduling and persistence

Claude Code reviewed the implementation and tests without editing the
worktree. It found two consequential edge cases. First, every healthy sample
replaced an otherwise identical validation record with a new timestamp. That
caused a React publication every sampling interval and continuously moved the
ten-second persistence deadline forward. A reducer-plus-persistence regression
test now proves that the first acceptable validation remains stable and reaches
its original deadline.

Second, the complete offscreen upload was keyed to the entire shader variant.
An automatic theme, effects, or profile change could therefore repeat the
synchronous full-graph draw after boot. The expensive path is now keyed only to
the resource-residency mode (`all-units` or `near-units`); later shader changes
use `compile()` alone. Cleanup after a thrown draw and this resource-variant
gate both have deterministic tests.

The review also questioned persisting a steady state whose samples remain
under pressure. That suggestion was not adopted: the learning contract stores
an axis triple only after headroom or a measured improvement validates it.
Persisting an unvalidated low state would convert a still-failing experiment
into the next visit's starting point. The decision remains explicit here for
device-test review.

### 2026-08-21: Device A/B validates texture residency but not complete GPU warm-up

The intended Efficient A/B did not stay manual. `Reset scene to first visit`
removes render-setting query parameters, so both captures ran in Auto. The on
capture used DPR 1.934 and rendered 933,582 physical pixels. The off capture
used DPR 1.247 and rendered 388,057 pixels. The raw FPS and p95 summaries are
therefore not a controlled comparison. Future fixed-profile runs must reset
first, reopen the supplied URL, and avoid a second reset.

The resource counts still isolate what the switch changed. With `Preload all
shelf visuals` on, the trace began with 128 textures and added one texture
during travel. With it off, the trace began with 105 and recorded 42 positive
texture allocations. The user reported only a small boot delay, no large
freezes, and a quick return to 50 to 60 FPS. The worst travel frame fell from
556 ms in the earlier no-meadow trace to 198 ms in the on run.

The warm-up is not complete. Positive program changes remained almost equal,
113 with residency on and 116 with it off. Positive geometry changes were 103
and 156. Frames that added a resource in the on run averaged 61.65 ms and
reached 120 ms p95. Active-neighborhood light visibility changes as the unit
changes and is the leading cause of the remaining shader variants. The next
controlled trace will use the existing `Active neighborhood lights` switch to
test that prediction before a multi-light shader warm-up is designed.

### 2026-08-21: The screenshot response improved cadence, but causality remains unknown

The Auto log records a pressure run beginning at 27.858 seconds. Median frame
interval improved from 40 ms at R10 to 32, 26, 24, and 19 ms as the controller
moved to R5. It later reached R4, recovered through R6, and ended at R5 with a
17 ms median and 19 ms p95 after the final traversals. The v10 rule therefore
did not stop after two cuts because median cadence materially improved. That
is the intended distinction from the earlier R4 to R0 run whose median stayed
at 24 to 26 ms.

The log cannot prove that DPR caused the improvement. A screenshot-menu
cadence throttle that recovered over the same 13 seconds would create the same
transition history. It also cannot show whether focus changed or renderer
resources grew during that episode because the performance trace began at 203
seconds.

Quality log schema v2 closes that evidence gap under `hud=1`. It retains 1,024
sample windows, about four minutes at the current four-Hz sampler rate, with
the axis triple, constraint, focus, visibility, movement, and renderer program,
texture, and geometry counts. A separate 64-event list records focus, blur,
visibility, page show or hide, freeze, and resume. Normal production visits do
not allocate this history.

### 2026-08-21: The fixed-profile screenshot export used an old support bundle

`stacks-quality-2026-08-21T07-22-36-257Z.json` is schema v1 even though the
served source had advanced to schema v2. The file has no `evidence` object,
focus state, or browser lifecycle events. Safari therefore reused an older
generated page or chunk, and this run cannot settle whether the screenshot
sheet blurred, hid, or froze the page. The next URL includes a unique ignored
query value to force a fresh document and must report `version: 2` before its
evidence is interpreted.

The older journal is still useful. `quality=efficient` fixed the profile, not
the resolution axis. The controller moved R11→R7 during the largest slowdown:
p50 fell from 26 to 21 ms while p95 fell from 48 to 27 ms, then strict headroom
returned it to R11. It later oscillated between R11 and R10 three times, with
roughly 20 seconds of healthy evidence between retries. Calling this a
fixed-DPR experiment was incorrect. A truly fixed interruption run must also
enable `Freeze Auto adaptation` before closing Scene Diagnostics.

### 2026-08-21: The all-light trace proves cold shader creation causes the remaining stalls

`stacks-performance-2026-08-21T07-24-49.646Z.json` ran fixed Efficient with
all real lights exposed. Settled frames remained healthy at 56.79 FPS, 17 ms
median, 22 ms p95, and 0.79% dropped. Travel, by contrast, reached 2,099 ms
p95 and a 3,588 ms maximum. The first trip lasted 17.668 seconds; the return,
after most programs existed, lasted 5.468 seconds.

Programs rose from 89 to 262. Each of the six multi-second first-pass gaps
added 9 to 23 programs. Textures stayed at 121 until the last stop and geometry
was nearly flat through most of the first pass. The trace recorded no long
task, long animation frame, React commit, or relevant resource request. This
confirms cold shader compilation and rejects texture upload, React work,
network activity, and sustained fill pressure as explanations for the
five-second user-visible freeze.

The comparison also exposed a diagnostic invalidation defect. Changing
`Limit real lights to nearby shelves` after boot changed Three.js's program
key, but the prewarmer's variant did not include that setting. The ten-second
wait therefore warmed nothing. Light mode now participates in the shader
variant, and later refreshes compile all mounted materials without repeating
the 1×1 texture/geometry upload.

### 2026-08-21: Prefer a constant bounded light shape over compiling every neighborhood

The first implementation attempt compiled every mounted material against each
distinct nearby-light count. Its red tests established variant coverage and
state restoration, but the trace made the cost unacceptable: each new light
shape can create about a scene's worth of programs, so preparing all shapes
could move hundreds of compilations into boot and turn a small delay into tens
of seconds.

The retained experiment keeps the nearby-light visual policy and one shader
shape instead. Every real shelf, desk-lamp, and floor-lamp light carries its
owning unit index. When `Stabilize nearby-light shader count` is enabled, a
layout effect counts the mounted point and spot lights and exposes only enough
zero-intensity padding lights to match the largest three-unit neighborhood.
The current inventory peaks at nine point lights and three spot lights. At the
first stop the padding is five points and two spots; at the largest
neighborhood it is zero. Three.js therefore sees the same bounded light counts
while real illumination remains unchanged.

The experiment initially remained default-off pending the device trace. Its
off path mounts no padding lights, allocates no render target, samples no
texture, and performs no frame work. Its live control resets to the production
default on reload. The implementation derives the inventory from mounted
tagged lights rather than a copied table and retains the existing all-light
switch as a separate comparison.

### 2026-08-21: Device trace accepts the stable light shape

The fixed Efficient iPhone run in
`stacks-performance-2026-08-21T07-51-50.035Z.json` accepted the candidate. The
round trip felt responsive and completed in 5.57 seconds. Travel p95 was 66 ms
and the maximum frame was 212 ms. The all-light diagnostic control had reached
2,099 ms p95 and a 3,588 ms maximum, with a 17.668-second first trip. The
multi-second shader-compilation freeze is gone.

Settled frames retained a 17 ms median, 26 ms p95, and 42 ms maximum. The user
reported no perceptible boot slowdown. Program count fell from 137 to 124 near
travel start as resources were released, then added only four programs during
the rest of the round trip; those changes coincided with 40 ms and 17 ms
frames, not a stall. The 212 ms tail frame did not coincide with program or
resource growth. Textures added eight entries late in the run, but their
associated frames stayed mostly between 16 and 19 ms, so they are not the
remaining traversal bottleneck.

This evidence satisfies the acceptance gate: traversal has no multi-second
frame, settled cadence is materially unchanged, and boot has no perceptible
regression. `stableNeighborhoodLightShape` now defaults on. The diagnostics
switch and zero-work off path remain available for rollback and future A/Bs.

### 2026-08-21: Release hold exposes a production physics telemetry blind spot

The user reported that physics appeared to reduce performance materially while
the release was being staged. The accepted shader trace contains
`physicsMs: 0` on every frame, but that value cannot clear physics: the
production diagnostics gate discarded timing updates before the trace sampled
them. The same gate also made the production `Step free-body simulation`
control inert. The trace remains valid for frame cadence, program growth, and
the resolved multi-second shader stall; it does not classify post-interaction
physics cost.

A red test now requires production to accept only the existing runtime-control
patch while continuing to reject module state, events, helpers, contacts, and
other verbose diagnostics. Per-frame physics timing has a separate mutable
read path that wakes no subscriber. The performance trace reads that path, so
it can measure the complete physics tick without adding React work to the
captured frame. Development keeps the existing half-second diagnostics
publication.

The focused physics-diagnostics and performance-trace suites pass 11 tests.
Repository-wide `yarn tsc --noEmit` and targeted ESLint pass. No physics
default, collision rule, sleep threshold, or quality policy changed in the
telemetry seam.

### 2026-08-21: Bound the thin-body solver fallback

Source inspection then identified a direct feedback loop. Any simulated prop
with an extent at or below 3 cm and speed at or above 1 m/s changed the entire
Cannon world from a 60 Hz fixed step to 240 Hz with as many as eight substeps
per rendered frame. A 60 FPS frame could therefore require roughly four world
solves. Once that cost lowered frame rate, the larger render delta requested
still more catch-up solves and could hold the scene near 35 FPS.

The anti-tunnelling path now uses a 120 Hz fixed step with at most two substeps
per rendered frame. Ordinary motion remains at 60 Hz with the same two-step
cap. This keeps a late frame from multiplying physics work, while a dedicated
integration test confirms that a 2 cm prop released downward at 4 m/s still
does not cross the shelf. The original fast-release collision test also
remains green.

The focused physics, production diagnostics, and performance-trace suites pass
51 tests. The change deliberately accepts temporary physics slow motion if a
device is already below 60 FPS instead of spending additional solver work to
catch up and worsening presentation latency.

## Shortcuts taken

- The release changes diagnostics, quality policy, resource warm-up, light
  visibility, and physics cadence without changing the authored OG camera or
  scene composition. The existing homepage OG image was retained and its
  deterministic source manifest was refreshed against the exact release
  commit instead of recapturing an identical image.
- The normal `yarn build` path includes a repository-wide typecheck currently
  blocked by unrelated active work. A Next compile-plus-generate build was used
  to verify production bundling without changing those files.
- The journal retains 16 axis changes. This matches the reviewed spec and keeps
  memory bounded, but a highly unstable session can overwrite its earliest
  decisions. The device run must note if the log reaches all 16 slots.
- Gate 2 does not add resolution recovery. That is a deliberate experiment
  boundary, not a claim that the floor dead zone is fixed.
- The iOS export still uses a Blob download. Safari wraps it in a WebArchive,
  which is recoverable but inconvenient.
- The warm-up uses a 1×1 WebGL render target rather than a new loader or asset
  format. It removes first-use GPU work with a small, reversible change, but it
  does not reduce the scene's steady draw-call or triangle cost. The complete
  draw runs once per resource-residency mode, not on ordinary quality or theme
  changes.
- No `blur` or `focus` quality policy was added. Schema v2 measures those
  events first, because pausing or resetting adaptation on an unconfirmed
  lifecycle event could hide real pressure.
- The constant-light-shape path reserves 16 point and 8 spot padding objects,
  above the current required 5 and 2. It disables padding if a future authored
  inventory exceeds either bound instead of presenting a partially stable
  shape.
- The light-shape path was held default-off until the fixed Efficient device
  trace measured both traversal and settled cost. It is now enabled by default;
  the live switch preserves the original variable-shape control.

## Issues and ambiguities

- The WebKit resolution lock exists in reducer events and tests but has no
  production producer. This gate preserves live resolution adaptation while
  the phone experiment measures reallocation behavior.
- The recovery proposal's p95 candidate line admits the earlier 19 ms window
  but rejects the later 22 and 23 ms settled windows. Final recovery should use
  the corrected-policy log rather than treating one screenshot as a constant.
- `yarn vitest run` also imports Playwright specs under Vitest and produces ten
  runner-mismatch failures. The intended `yarn test` command excludes those
  specs and has five unrelated active-worktree failures: stale About landmark
  dimensions, a stale About silhouette hash, a free-roam source assertion, a
  moved recent-reading pose, and a DoF source assertion that still expects the
  literal `2.2` after the user's code moved it to a named constant.
- The compact HUD has four narrow rows. The misleading calls and triangles row
  was removed rather than widening the control.
- A full console opened during a measurement invalidates the rest of that run.
  Reload before collecting another run.
- Safari exposes no GPU timer in these captures. Stable low submission cost,
  unchanged idle resources, and resolution insensitivity identify a separate
  render-or-presentation cadence episode, but still do not distinguish a
  WebKit compositor limit from another non-JavaScript browser constraint. The
  `nomeadow` A/B has ruled out the meadow as the traversal-freeze cause.
- The trace began 62.953 seconds after navigation, after the observed 60-to-35
  FPS transition. It proves the steady-state cadence and the 250 ms hitch, not
  which event first moved the device into the slow state.
- The compact HUD itself publishes DOM state every 500 ms. Its closed full
  console no longer subscribes to 250 ms runtime telemetry, but a final clean
  production measurement without `hud` is still required after diagnosis.

## Test evidence

### Red phase

Command:

```bash
yarn vitest run \
  src/app/components/stacks/scene/qualityAxes.test.ts \
  src/app/components/stacks/scene/qualityLog.test.ts \
  src/app/components/stacks/dom/devHudPresentation.test.ts \
  src/app/components/stacks/dom/ChromeLayer.diagnostics.test.ts
```

Result: 78 existing tests passed and nine intended checks failed. The failures
were five missing reducer-journal behaviors, two missing HUD policy-row
behaviors, the missing `qualityLog` module, and the missing diagnostics download
action. This is the fast deterministic feedback loop for the gate.

### Green phase

- Focused quality and diagnostics suite: 262 tests passed across 10 files in the
  final run.
- An initial full unit and presentation run passed 1,325 tests across 175 files.
  After concurrent unrelated worktree changes, the final rerun reports two
  failures: an About silhouette source hash needs regeneration, and the
  free-roam presentation contract no longer finds a direct
  `setStacksSheetDismissed(` call in `PlacardLayer.tsx`.
- Targeted ESLint for every changed TypeScript file: passed.
- Production Next compile: passed.
- Production static generation: 356 pages generated successfully.
- Production server smoke request to `/?hud=1`: HTTP 200.
- `yarn tsc --noEmit`: blocked only by the unrelated `ModelProp.tsx` error
  listed above.
- Full `yarn lint`: blocked only by the unrelated dirty-file errors and
  warnings listed above.

### Gate 2 red phase

The first reducer run produced six intended failures: immediate resolution
pressure, duplicate travel borrowing, discarded travel debt, stale foreground
evidence, stale boot-guard time, and the locally resetting ineffective-cut
budget. The sampler and persistence suites initially failed because their pure
modules did not exist.

Independent red tests then reproduced four findings from the device log and
Claude review:

- the per-step iPhone response still walked to step 0;
- a comparison could accept a mixed pre/post-change window;
- a CPU-bound p95 tail was classified as inferred GPU pressure;
- a 250 ms production window could move an axis.

Each test failed against the immediately preceding implementation before its
fix landed.

### Gate 2 green phase

- Focused quality, sampling, persistence, learning, log, compact HUD, and
  diagnostics suites: 244 tests passed across eight files.
- Reducer suite after the lifecycle journal and validation additions: 100
  tests passed.
- Targeted ESLint across every touched TypeScript file: passed with no warning.
- `yarn tsc --noEmit`: passed repository-wide.
- `yarn test`: reached only the five unrelated failures listed above; the
  remaining unit and presentation tests passed.
- The normal `yarn build` preflight is blocked by an unrelated stale homepage
  OG fingerprint. Running the underlying `yarn next build` compiled, typechecked,
  and generated all 356 static pages.
- The production server returns HTTP 200 from both localhost and the LAN URL.

### Telemetry-hitch red and green phase

Three focused tests failed before the change:

- publishing runtime metrics notified the scene-control subscriber;
- sampled metrics were stored with `setLiveMetrics` in the Canvas owner;
- an unchanged mixed-tail `unknown` sample returned a new reducer object.

After separating the stores, moving live metrics to a ref, gating the runtime
subscription on the full drawer being open, and preserving clock-state
identity:

- the focused quality suite passed 254 tests across ten files;
- the three new regression checks passed;
- targeted ESLint passed;
- `yarn tsc --noEmit` passed;
- `yarn next build` compiled, typechecked, and generated 356 pages;
- both fixed-test URLs returned HTTP 200 on the LAN server.

The full unit run has four failures, all in pre-existing dirty-worktree
contracts outside this change: About boot-landmark dimensions, the Canvas
stencil/alpha source assertion, the free-roam sheet-toggle source assertion,
and the DoF literal source assertion. The remaining tests, including all new
quality checks, passed.

### Traversal warm-up and inferred-GPU validation red and green phase

The warm-up tests first failed because complete unit residency, the offscreen
GPU initializer, its diagnostics switch, and loading-manager synchronization
did not exist. A separate reducer replay reached R0 on the captured
25/26/24/24 ms median sequence, proving the policy bug before its fix. Storage
tests then failed against the intended v10 boundary.

After implementation:

- 271 focused quality, persistence, diagnostics, unit-activity, residency, and
  GPU-warm-up tests passed across 12 files, plus the targeted scene-performance
  integration assertion;
- all 104 quality-axis tests passed, including the captured cadence replay and
  stable-validation regression;
- all 105 quality-policy and learning tests passed with the v10 boundary;
- the new scene-performance integration assertion passed;
- targeted Prettier and ESLint passed for every touched TypeScript file;
- `yarn tsc --noEmit` passed repository-wide;
- `yarn test` reached four unrelated dirty-worktree contract failures: canvas
  alpha source text, free-roam sheet-toggle source text, DoF named-constant
  source text, and the moved About reading pose. All other tests passed;
- `yarn next build` compiled, typechecked, and generated all 356 pages;
- the rebuilt production server returned HTTP 200 through localhost and
  `10.0.0.249:3001`, and its emitted chunks contain both the v10 storage key
  and the live prewarm control.

### Quality evidence schema v2 red and green phase

The focused red command exercised the production support artifact rather than
a stand-in. It failed because the evidence module did not exist, schema v1
dropped the supplied evidence, and the Canvas had no sample or browser-event
recording calls.

After implementation:

- four focused schema, bounded-copy, lifecycle, and Canvas integration tests
  passed;
- the broader quality and diagnostics suite passed 273 tests across 13 files;
- targeted ESLint and repository-wide `yarn tsc --noEmit` passed;
- the full non-browser suite reached only four unrelated dirty-worktree
  failures: canvas alpha source text, free-roam sheet-toggle source text, the
  DoF named-constant source text, and the moved About reading pose;
- `yarn next build` compiled, typechecked, and generated all 356 pages;
- the rebuilt LAN server returned HTTP 200 and its emitted chunk contains the
  schema-v2 lifecycle strings.

### Constant light-shape red and green phase

The initial red suite failed because program-only invalidation, unit ownership
tags, and a live shader-shape control did not exist. The naive multi-variant
implementation made those tests pass, but review against the device trace
rejected its boot-time cost before it became the retained design. The final
tests instead cover runtime light inventory, maximum-neighborhood arithmetic,
padding at the first, middle, and last stops, fixed-capacity headroom,
program-only refreshes, control reversibility, and ownership tags on all three
real-light families.

After implementation:

- 19 focused GPU warm-up, light-shape, and settings tests pass;
- the focused integration contract for residency and shader controls passes;
- the broader quality and performance suite passes 314 tests; its only failure
  is the unrelated dirty-worktree DoF literal source contract;
- targeted Prettier and ESLint pass after the new light inventory was typed as
  `unknown` at the `userData` boundary;
- repository-wide `yarn tsc --noEmit` passes;
- the full non-browser suite reaches the same four unrelated dirty-worktree
  failures already recorded above and no new failure;
- `yarn next build` compiles, typechecks, and generates all 356 pages.

After the device trace accepted the path and the production default changed,
the 19 focused settings, light-shape, and GPU warm-up tests passed again.
Targeted ESLint and repository-wide `yarn tsc --noEmit` passed. The production
build compiled, typechecked, and generated all 356 pages, and the rebuilt local
and LAN URLs returned HTTP 200. The combined presentation run reached only the
already-recorded DoF assertion that expects a literal `2.2` instead of the
current named falloff constant.

## Device test procedure

Use the production URL supplied in the handoff while the phone and computer
are on the same network. Run the phone first, then the simulator.

This completed procedure contained one instruction error. Resetting to first
visit also removes `quality=efficient`, so the A and B captures below ran in
Auto. The corrected procedure is recorded after the results.

### A. Default warm-up and traversal

1. Load `?hud=1&nopostfx=1&quality=efficient`, choose `Reset scene to first
visit`, and let the reload finish. Do not open the full diagnostics drawer.
2. Wait 30 seconds. The HUD should show Efficient at or recovering toward
   R11/11 with roughly 60 FPS.
3. Start a performance trace from the compact diagnostics action, traverse
   first→last→first twice, stop the trace, and download it.
4. Capture the HUD after 30 seconds settled. The trace should no longer show
   programs, textures, and geometries climbing shelf by shelf, and travel
   should have no 100–500 ms first-use frames.

### B. Proximity-path comparison

1. Reload the same URL, open Scene Diagnostics, disable `Preload all shelf
visuals`, and close the drawer. Wait at least five seconds so distant visual
   children release.
2. Start a trace and repeat first→last→first once. Download the trace. This is
   expected to reproduce resource-count growth and is the control, not the
   desired shipping result.
3. Reload afterward. Debug overrides reset on reload.

### C. Safari interruption and resolution policy

1. Load `?hud=1&nopostfx=1`, reset to first visit, and remain still for 60
   seconds.
2. Open and close the iOS screenshot preview/share menu once, then leave the
   page untouched for two minutes. Capture the HUD at the worst point and after
   recovery.
3. Download the quality log. If median cadence stays slow while resolution is
   falling, inferred-GPU pressure may spend at most two ineffective steps; it
   must not repeat the former R4→R0 staircase.

Send both traversal traces, the quality log, and the screenshots. They are
self-contained WebArchives; no remote inspector is required. If remote
inspection is convenient, these reads do not open the instrumenting drawer:

```js
window.__stacks.state().quality.transitions;
window.__stacks.qualityLog();
window.__stacks.qualityLog("download");
```

## Next device test procedure

Reset once before either test. After that reload finishes, reopen the supplied
fixed-profile URL and do not press reset again.

### D. Fixed-DPR screenshot interruption

1. Load `?hud=1&nopostfx=1&quality=efficient` after the reset and wait 30
   seconds. Confirm the HUD says `Efficient/Manual`.
2. Open and close the screenshot preview once, then leave the page untouched
   for 90 seconds.
3. Download the quality log. Schema v2 should include the cadence before,
   during, and after the interruption plus any focus or page-lifecycle event.

### E. Real-light shader comparison

1. Reload the same fixed Efficient URL. Keep `Preload all shelf visuals` on.
2. Open Scene Diagnostics and disable `Limit real lights to nearby shelves`.
   Close the console and wait ten seconds for the all-light shader variant to
   compile.
3. Start a performance trace, traverse first to last to first once, and
   download it. Stable program counts would confirm that changing light
   neighborhoods causes the remaining program compilation. Lower steady FPS
   would quantify why leaving all real lights active is not the shipping fix.

### F. Constant nearby-light shader shape (completed acceptance run)

1. Load the cache-busted fixed Efficient URL from the final handoff. Confirm
   the HUD says `Efficient/Manual`, then open Scene Diagnostics.
2. Keep `Preload all shelf visuals` and `Limit real lights to nearby shelves`
   enabled. Enable `Stabilize nearby-light shader count`, close the drawer, and
   wait ten seconds for the max-neighborhood program shape to compile.
3. Start a trace, traverse first→last→first once, stop, and download it. Program
   count should remain stable during travel, with no multi-second frame.
4. For a later control run, reload, disable the switch, close the drawer, and
   repeat the trace. Reloading again restores the production default.

### G. Truly fixed screenshot interruption

1. Load the cache-busted fixed Efficient URL and confirm the next quality log
   preview or download reports schema version 2.
2. Open Scene Diagnostics, enable `Freeze Auto adaptation`, and close it. Wait
   30 seconds, open and close the screenshot preview once, then wait 90 seconds.
3. Download the quality log. The DPR must remain fixed; focus, visibility,
   lifecycle, cadence, and renderer counts will identify whether WebKit or the
   scene caused the slowdown.

## Next steps

The release gate is complete. Optional follow-up work is:

1. Capture a post-interaction trace with the corrected production physics
   timing if a future device still reports sustained degradation.
2. Classify the screenshot-preview cadence change as a focus/lifecycle pause,
   renderer initialization, or WebKit presentation behavior. It is separate
   from the resolved traversal freeze.
3. Keep full visual residency enabled unless a phone reports a Safari reload,
   WebGL context loss, or unacceptable boot delay.
4. Recheck the fixed light capacity if future scene work adds enough point or
   spot lights to exceed the guarded inventory bound.
