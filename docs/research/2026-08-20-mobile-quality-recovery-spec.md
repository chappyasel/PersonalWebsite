# Mobile adaptive-quality recovery

Date: 2026-08-20

Status: Active — observability and corrected decline policy implemented;
runtime telemetry hitch fixed; render-capacity isolation pending

Scope: Homepage scene quality controller, persistence, and compact diagnostics

## Decision

Keep automatic mobile quality adaptation. Make every decision traceable, bind
performance evidence to active foreground time, and let a validated low
resolution test sharper settings safely.

Implementation has three gates:

1. Ship a bounded production transition journal without changing policy.
2. Fix confirmed lifecycle and travel accounting bugs, then repeat the phone
   run to identify the path that reaches the floor.
3. Remove observer-induced scene work, isolate the remaining render-capacity
   limit, then add one-step recovery only if a higher-resolution state has
   measured headroom.

The field result supports this work, but it does not support attributing the
floor to one reducer branch or choosing a permanent 5% recovery threshold yet.

## Field evidence

A production build was served to an iPhone through the compact `?hud=1`
monitor. Full diagnostics were not mounted.

| Moment                                     | FPS |     p95 | Dropped |  DPR |       Pixels | Effects                  |
| ------------------------------------------ | --: | ------: | ------: | ---: | -----------: | ------------------------ |
| Settled for one minute, no interaction     |  59 | 26.0 ms |      6% | 1.25 | 0.4 / 3.1 MP | B5, no AO, DoF q.45/b.72 |
| Full traverse, then settled for 40 seconds |  60 | 19.0 ms |      3% | 0.60 | 0.1 / 3.1 MP | B4, no AO, no DoF        |

Leaving Safari to share the first screenshot was followed by a rapid decline to
DPR 0.60. Returning to the settled page later did not recover resolution.

Two deterministic reducer probes confirmed separate policy defects:

1. A GPU-pressure clock set at `t=1000` survived a hidden sample at `t=60000`.
   The first visible sample at `t=60250` lowered resolution immediately because
   the hidden interval counted toward controller dwell.
2. A floor state fed `p95=19`, `p50=16.7`, `dropped=3%`, and `cpuP50=4` for five
   simulated minutes remained at resolution step 0. The window is below every
   pressure threshold and above the strict 2% headroom threshold, so it remains
   `unknown` forever.

The first result is a correctness bug. The second is a recovery dead zone.
Neither result proves which branch produced the field session's decline.

The Gate 1 journal later resolved that ambiguity. Six `sample-pressure`
resolution cuts moved step 6 to step 0 between 27.185 and 36.505 seconds while
the page was still. Every verdict was inferred GPU: frame p50 was 20 to 26 ms,
frame p95 was 38 to 50 ms, CPU p50 was 6 ms, and CPU p95 was 11 to 13 ms.
Effects then moved lean to minimal. No visibility or travel event changed
resolution; the later traverse moved content reduced to minimal through the
bounded travel budget.

The compact renderer counts are also misleading. `1 calls / 1 tri` describes
the last fullscreen composer pass after Three resets its counters. It does not
describe the complete scene. Texture and program counts are retained-resource
counts and do not identify per-frame cost by themselves.

The corrected-policy run held Auto at resolution step 6 with no transitions,
including across visibility and travel boundaries. Forced Efficient then fell
to the same 35–36 FPS at nearly the same actual DPR. An 8.826-second trace of
that state showed a 25 ms median and a 250 ms periodic hitch with stable scene
load. The sampler had been broadcasting diagnostics telemetry through the
scene-control store and React Canvas state four times per second; that boundary
is now fixed. The steady interval between those hitches remains over budget at
roughly 310 calls and 681,000 triangles, so resolution recovery is not the next
safe change.

## Existing behavior

The relevant implementation lives in:

- [`quality.ts`](../../src/app/components/stacks/scene/quality.ts), which
  summarizes frame windows and classifies CPU, GPU, headroom, or no verdict;
- [`qualityAxes.ts`](../../src/app/components/stacks/scene/qualityAxes.ts),
  which owns the independent resolution, effects, and content axes;
- [`StacksCanvas.tsx`](../../src/app/components/stacks/StacksCanvas.tsx), which
  collects samples, dispatches controller events, and schedules persistence;
- [`qualityLearning.ts`](../../src/app/components/stacks/scene/qualityLearning.ts),
  which stores and restores the axis triple;
- [`SceneDiagnostics.tsx`](../../src/app/components/stacks/dom/SceneDiagnostics.tsx)
  and [`devHudPresentation.ts`](../../src/app/components/stacks/dom/devHudPresentation.ts),
  which expose the compact monitor and full console.

Current policy details that matter here:

- sampling uses a rolling two-second window;
- inferred GPU pressure requires late frames and cheap median main-thread work;
- once resolution's 1.5 second change dwell has elapsed, one GPU-classified
  window can lower it; resolution has no separate sustained-run check;
- strict headroom requires fewer than 2% dropped frames;
- resolution recovery waits at least 20 seconds after a failed higher step;
- hidden samples are ignored while classification timestamps remain intact;
- travel can borrow resolution repeatedly, and a later GPU window can discard
  the record of that debt;
- an unchanged axis triple can be written to local storage after ten seconds,
  including before the reducer has consumed a valid sample.

At least three paths can reach DPR 0.60: a stale pre-hide GPU clock, repeated
travel borrowing, and sample-driven resolution cuts. The current production
HUD does not record which path fired. Full tracing cannot answer the question
because mounting the performance probe marks samples as instrumented and stops
Auto from consuming them.

## Required behavior

### 1. Production transition journal

Add observability before changing policy. Keep the last 16 axis transitions in
memory as records equivalent to:

```ts
type SceneQualityAxisValues =
  | {
      axis: "resolution";
      fromValue: number;
      toValue: number;
    }
  | {
      axis: "effects";
      fromValue: SceneEffectsTier;
      toValue: SceneEffectsTier;
    }
  | {
      axis: "content";
      fromValue: SceneContentTier;
      toValue: SceneContentTier;
    };

type SceneQualityTransition = SceneQualityAxisValues & {
  at: number;
  direction: "up" | "down";
  reason:
    | "sample-pressure"
    | "travel-borrow"
    | "travel-repay"
    | "travel-budget"
    | "deferred"
    | "strict-headroom"
    | "recovery-probe"
    | "recovery-accept"
    | "recovery-revert"
    | "restore"
    | "force";
  metrics: {
    targetFrameMs: number;
    sampleCount: number;
    p50: number | null;
    p95: number;
    droppedFrameRatio: number;
    cpuP50: number | null;
    cpuMs: number;
    gpuMs: number | null;
    constraint: SceneFrameConstraint;
  } | null;
};
```

Append only when an axis changes. Publish the journal on `qualitySnapshot` and
`window.__stacks.state()` under `?hud=1`. This is bounded state with no extra
per-frame measurement.

The compact HUD should replace its invalid renderer-load row with one policy
row containing resolution step, current constraint, median frame interval,
median CPU cost, and the most recent transition reason. Add validation status
when the single persistence-eligibility predicate lands in gate 3; gate 1 must
not invent a second approximation merely for display. The complete journal
belongs in the full diagnostics panel and `window.__stacks.state()`.

Keep the four existing frame constraints. `resolution-recovery` is a separate
eligibility flag, not a fifth constraint.

Do not report calls or triangles until a cheap HUD-only frame counter has been
proved to cover the complete render frame. Retained texture and program counts
may remain in full diagnostics with explicit labels.

### 2. Foreground-only evidence

Add explicit `visibility-hidden` and `visibility-visible` reducer events. They
must come only from `document.visibilitychange`. A sample's current `visible`
field also represents frozen and instrumented states, so rename it to `usable`
or otherwise keep it separate from document lifecycle state.

When the document becomes hidden:

- clear the rolling frame sampler;
- clear CPU, GPU, and headroom runs;
- cancel any incomplete before-and-after comparison;
- preserve the last accepted axis triple;
- block persistence until fresh foreground validation completes.

When the document becomes visible:

- clear the sampler again and invalidate the lagging CPU-cost accumulator;
- discard the first two combined frame/CPU samples after resume unless the CPU
  accumulator can be reset explicitly;
- reset evidence clocks to the resume time;
- if boot has not completed, set `bootGuardExpiresAt` to
  `now + QUALITY_BOOT_GUARD_MS`; hidden time cannot retire the boot guard;
- leave absolute retry deadlines unchanged, since elapsed real time satisfies
  a cooldown rather than extending it;
- require `QUALITY_TRAVEL_VALIDATION_MS` of visible foreground wall time before a
  sample may move an axis or validate persistence.

Treat `pageshow` with `persisted: true` as a resume. A page loaded while hidden
must wait for the same foreground validation. A `sample` with `usable: false`
does not create lifecycle events, advance evidence, or validate persistence.

`foregroundReadyAt: null` means blocked. On ordinary visible initialization,
set it to `now + QUALITY_TRAVEL_VALIDATION_MS`. On hidden initialization, leave
it null until `visibility-visible` or persisted `pageshow` sets the deadline.
The deadline measures elapsed wall time while the document stays visible.
Unusable samples cannot act or validate, but they do not require a second time
accumulator. Hiding clears the deadline.

Extract the rolling sampler from the React Three Fiber component into a small
pure module so clearing, trimming, summarizing, and the discarded resume frame
can be tested without mounting the canvas.

Add a true sustain check to resolution pressure. A GPU verdict may lower
resolution only when `sustainedFor(gpuSince, now)` reaches the resolution dwell
period. Time since the last resolution change is still a reallocation guard;
it is not evidence of continuous GPU pressure.

### 3. Travel accounting

Make travel events idempotent and preserve borrowed-resolution debt:

- `travel-start` while already travelling is a no-op;
- one travel episode records one pre-travel step and borrows at most once;
- a GPU verdict during repayment pauses the debt instead of deleting it;
- usable, settled, non-GPU windows resume repayment one step at a time;
- a new recovery probe cannot start or accrue sustain while travel debt exists;
- clearing the final debt step resets `resolutionRecoverySince`, so a probe
  needs fresh evidence at the fully repaid step.

The existing two-cut give-up budget must also remain bounded through noisy
windows. Do not reset `unhelpfulResolutionSteps` from one improving comparison.
Reset it when resolution rises, or when restore, force, or initialization
establishes a new baseline. This makes the budget monotonic across a downward
walk and prevents noisy improvement windows from reopening it indefinitely.

The field replay showed that monotonic counting alone is insufficient. Retain
the window that opens an inferred-GPU descent and judge later cuts against that
anchor, not only against the immediately preceding step. Otherwise small local
gains form an unlimited staircase even when the full descent never fixes the
tail. Clear the anchor with the same explicit baseline-setting events that
reset the counter. Measured GPU timing remains authoritative and may use the
full resolution ladder.

The transition journal must distinguish travel borrowing, travel repayment,
and sample-pressure cuts so the phone run can verify these rules.

### 4. One transition under evaluation

Generalize the current pending baseline instead of introducing an independent
`resolutionProbe` state:

```ts
type PendingQualityTransition = SceneQualityAxisValues & {
  direction: "up" | "down";
  reason: "pressure-check" | "recovery-probe";
  baseline: SceneQualityMetrics;
  startedAt: number;
  expiresAt: number;
};
```

Only one transition may be under evaluation. The same record owns decline
validation and an eventual upward recovery probe.

Pressure, travel start or end, force, restore, visibility hide, and unusable
sampling all have explicit interruption behavior. An interrupted upward probe
returns to `fromValue`, clears the pending record, and applies the existing
resolution cooldown. Force and restore then apply their requested value. An
interrupted decline comparison clears its baseline without undoing the accepted
lower setting.

Use the existing `resolutionRetryAt` for every resolution cooldown. A failed
probe sets it to `max(resolutionRetryAt, now + probeCooldown)`. Do not create a
second retry clock.

### 5. Recoverable low resolution

Keep strict `headroom` behavior unchanged for content, effects, and its current
resolution path. Add a resolution-only recovery candidate after the journal
and correctness fixes identify the field path.

Split recovery into a metric predicate and a state eligibility predicate. The
initial `hasResolutionRecoveryPacing(metrics)` envelope to test is:

- a complete, settled foreground window;
- no CPU or GPU pressure verdict;
- median frame interval no higher than the sustained-pressure line;
- p95 no higher than 1.25 times the 60 Hz budget;
- dropped-frame ratio below 5%;
- `cpuP50 < QUALITY_HEADROOM_CPU_MS`.

This envelope remains provisional. The first log contains settled 19, 22, and
23 ms p95 windows, so the 1.25-times-budget tail line accepts only one of them.
The corrected-policy run must decide whether recovery should instead use p50
and dropped ratio for pacing with a looser catastrophic-tail guard, and whether
candidate sustain should tolerate a bounded fraction of noisy windows rather
than require every 250 ms summary to qualify.

`isResolutionRecoveryEligible(state, gates)` additionally requires:

- no pending transition, travel debt, debug instrumentation, freeze, manual
  quality override, resolution ceiling, or harness pin.

The pacing predicate must mirror the existing `p50 == null` compatibility
behavior. Strict-headroom metrics must always satisfy the recovery pacing
predicate. Eligibility gates remain independent and need separate tests.

The 5% drop line and candidate sustain period are experiment inputs. The 5%
line admits the observed 3% floor and excludes the observed 6% window at DPR
1.25. It does not say whether the next resolution step is affordable, and it
does not address the 1.25 DPR complaint directly. Select final values from the
per-step phone data and ordinary stillness durations recorded in phase 1.

After uninterrupted candidate evidence reaches the selected sustain period,
raise resolution by one step and evaluate it through the shared pending
transition:

1. retain the lower step and its metrics;
2. collect one complete usable foreground window at the higher step;
3. accept only when the new window remains inside the absolute envelope and is
   not materially worse than the baseline;
4. use the existing `QUALITY_AXIS_P95_IMPROVEMENT_RATIO` and
   `QUALITY_AXIS_DROP_IMPROVEMENT` vocabulary for relative regression;
5. otherwise return to the exact lower step and set `resolutionRetryAt`;
6. require a new sustain period before testing another step.

Measure drawing-buffer reallocations on the phone before choosing probe
cadence. The final policy needs a tested maximum number of resolution changes
per minute and should converge from above and below without oscillating.

This new candidate branch changes only resolution. It does not reorder the
existing strict-headroom recovery of content and effects. Any broader recovery
order change belongs in ADR 0019 after the device experiment.

### 6. Validated persistence

Put the complete persistence rule in one exported pure predicate consumed by
both the storage effect and diagnostics. It receives reducer state, runtime
gates, and `now`.

Persistence is eligible only when:

- the document is visible and samples are usable;
- the reducer is booted;
- boot, resume, and post-travel validation have completed;
- the scene has remained settled for ten foreground seconds;
- the controller is not travelling, frozen, instrumented, or manually pinned;
- no transition is pending;
- the current state was accepted after a measured decline, an accepted upward
  probe, or fresh pacing inside the recovery envelope.

Version the storage format so older learned floors do not carry into this
policy. Store the axis triple and save time. Keep validation metrics and reason
in the runtime journal instead of creating a second stored policy record.
After a successful write, prune keys whose parsed integer between
`stacks-quality:v` and the next colon is lower than the current version. Prefix
matching alone is unsafe because `v1` also prefixes `v10`.

In Auto, store `profile: null` or derive the nearest real preset. Do not label
every learned automatic triple as Showcase. Track `restoredFromStorage` as an
explicit runtime flag for the HUD. Set it in both the first-mount initializer
and the reducer's later restore event.

A restored triple is a starting point. It is not validated until the fresh
foreground gate passes, and a restored low resolution must become probe-
eligible once the recovery predicate is satisfied.

## State and event shape

Exact names may change during implementation. The reducer needs state
equivalent to:

```ts
type SceneQualityAxisState = {
  foregroundReadyAt: number | null;
  resolutionRecoverySince: number | null;
  resolutionRetryAt: number | null;
  pendingTransition: PendingQualityTransition | null;
  validation: {
    at: number;
    reason: "improved-decline" | "accepted-probe" | "acceptable-pacing";
    metrics: SceneQualityMetrics;
  } | null;
  transitions: SceneQualityTransition[];
  restoredFromStorage: boolean;
  // existing fields remain
};
```

Add reducer events equivalent to:

```ts
type SceneQualityAxisEvent =
  | { type: "visibility-hidden"; now: number }
  | { type: "visibility-visible"; now: number }
  | ExistingEvents;
```

Browser events become reducer events in the canvas. Visibility policy and
transition interruption live in the reducer. The canvas owns raw frame
collection and passes runtime gates to the persistence predicate. Keep the
current instrumented status as a durable canvas/runtime gate rather than
discarding it with each sample. The persistence timer must cancel and restart
when document visibility, `foregroundReadyAt`, frozen state, instrumented state,
or any other eligibility input changes.

## Invariants

- Hidden wall time changes no quality axis.
- The first complete foreground window after resume is evidence; the first two
  combined samples are discarded unless the lagging CPU accumulator is reset.
- One GPU-classified window cannot lower resolution without a sustained run.
- An inferred-GPU descent cannot renew its two-cut budget through adjacent
  local improvements that fail against the descent anchor.
- A CPU-bound or unknown window never lowers resolution.
- Duplicate travel-start events cannot borrow additional resolution.
- Travel debt survives pressure and remains repayable.
- One transition at most is under evaluation.
- Every interrupted upward probe returns to its exact accepted lower step.
- A 3% dropped-frame ratio alone cannot pin resolution to the floor forever.
- Recovery probes never raise content or effects.
- Debug instrumentation changes neither production policy nor learned state.
- Manual pins and forced profiles keep their existing precedence.
- DPR 0.60 remains reachable under sustained, validated GPU pressure.
- Resolution changes per minute remain below the measured reallocation limit.
- Optional diagnostics add no per-frame work while disabled.

## Tests

Add focused regression coverage before changing reducer policy.

### Transition journal

- Every axis mutation records one reason, direction, typed value pair, and
  metric set.
- The journal retains only the latest 16 entries.
- Journal publication does not request full instrumentation.
- Travel, sample pressure, restore, force, probe acceptance, and probe rollback
  have distinct reasons.

### Visibility and sampling

- GPU, CPU, and headroom runs accrued before hiding cannot act after resume.
- A short hide clears the rolling frame window.
- A short hide discards the post-resume delta and its one-frame-lagged CPU cost.
- Retry deadlines are not shifted forward by hidden duration.
- Evidence clocks restart at resume.
- An unfinished boot guard restarts for a full boot-guard interval on resume.
- A pending decline comparison is discarded across suspension.
- An upward probe is reverted across suspension.
- A persisted bfcache resume follows the same validation gate.
- Frozen or instrumented samples do not masquerade as visibility events.

### Resolution pressure and travel

- Resolution requires a sustained GPU run in addition to change dwell.
- Duplicate travel-start is idempotent.
- One travel episode borrows at most once.
- A GPU verdict pauses travel debt without deleting it.
- Settled non-GPU evidence repays held debt.
- The two-cut give-up budget stays bounded under alternating noisy windows and
  resets only on an upward or explicit baseline-setting transition.

### Resolution recovery

- The captured `19 ms p95 / 3% dropped / cheap CPU` window becomes a candidate
  under the provisional envelope.
- The captured 6% dropped window does not qualify under that envelope.
- Strict-headroom metrics satisfy the recovery pacing predicate, including
  `p50 == null`, regardless of separate state gates.
- A probe accepts only when it passes both absolute and relative checks.
- A failed probe returns to the lower step and extends `resolutionRetryAt`.
- Pressure, travel, force, restore, hide, and unusable samples cannot leave a
  probe pending.
- Manual pins, ceilings, freezes, and instrumentation block probing.
- A successful probe can continue upward after fresh sustain.

### Closed-loop controller

Add a small simulator whose `metricsForStep(step)` responds to controller
changes. For a device with a comfortable step `k`, assert that the controller:

- converges to `k` from above and below;
- remains near `k` for five simulated minutes;
- does not walk to an envelope boundary through small accepted regressions;
- stays within the selected resolution-change budget per minute.

### Persistence

- Persistence is refused before boot and while hidden, frozen, instrumented,
  travelling, manually pinned, or awaiting a transition.
- Hiding cancels a scheduled write; showing cannot reuse its elapsed timer.
- A state reached immediately after resume is not persisted.
- A validated low step may persist.
- A restored low step becomes probe-eligible after fresh foreground evidence.
- Stored entries from the previous policy version are ignored and later
  pruned by parsed version without matching the current key accidentally.
- Initializer and event-based restores both set `restoredFromStorage`.
- The persistence effect and HUD consume the same pure eligibility result.

### Diagnostics

- Compact rows show step, constraint, medians, validation, and latest reason.
- Cheap HUD mode does not claim incomplete call or triangle counts.
- `?hud=1` does not request full instrumentation.
- Full debug windows remain excluded from adaptation.

Run at minimum:

```bash
yarn vitest run \
  src/app/components/stacks/scene/quality.test.ts \
  src/app/components/stacks/scene/qualityAxes.test.ts \
  src/app/components/stacks/scene/qualityLearning.test.ts \
  src/app/components/stacks/scene/scenePerformance.presentation.test.ts \
  src/app/components/stacks/dom/devHudPresentation.test.ts
```

## Device experiment

Use a local production build and the compact HUD. Full diagnostics stop Auto
from consuming samples, so run each measurement with the console closed. If D
is pressed, finish only by reading the captured journal, then reload before the
next measurement.

### Baseline policy run

1. Ship only the journal and compact policy row.
2. Reset learned scene state and load `/?hud=1`.
3. Remain still for one minute and capture the HUD.
4. Leave Safari for at least 30 seconds, return, and capture any transitions.
5. Traverse from the first unit to the last, then remain still for two minutes.
6. At the end, read the retained transition journal and identify every path
   that changed resolution.
7. Record p50, p95, dropped ratio, and cpuP50 by resolution step, plus the
   length of settled foreground stretches.

Repeat from a reset state with:

- `/?hud=1&nopostfx=1`, to isolate composer and fill-rate pressure;
- `/?hud=1&quality=efficient`, to separate controller choice from the device's
  ability to hold a pinned tier.

Record one resolution reallocation on video and note whether the WebKit drawing
buffer still flashes. This sets the maximum acceptable transition cadence.

### Corrected policy run

After the visibility, sustain, and travel fixes:

1. Repeat the baseline sequence on the same phone.
2. Verify that an app switch causes no immediate axis change.
3. Verify that one travel episode borrows once and any debt remains visible
   until repaid.
4. Compare transition paths and per-step metrics with the baseline run.
5. Select the recovery drop threshold, sustain time, retry time, and change
   budget from these results.

### Recovery acceptance run

After enabling the candidate branch:

1. Start above the device's comfortable step and verify downward convergence.
2. Start below it and verify upward convergence.
3. Traverse normally, then leave the page settled long enough to reach a
   stable step rather than merely attempt one probe.
4. Repeat travel after recovery to catch oscillation.
5. Background and resume during a probe; verify exact rollback and later retry.
6. Confirm that accepted quality survives reload only after fresh validation.

## Rollout

1. Land the transition journal and compact policy row with no controller change.
2. Run the baseline device experiment and identify the actual downgrade paths.
3. Land foreground lifecycle, resolution sustain, travel accounting, unified
   transition state, and persistence gating with regression tests.
4. Run the corrected-policy experiment on the same device.
5. Choose recovery constants from the two runs and document the evidence.
6. Land one-step resolution probing and the closed-loop simulator.
7. Run the recovery acceptance sequence and tune only centralized constants.
8. Update ADR 0019 with the accepted envelope, cadence, and recovery order.

Each behavior-changing phase should be independently revertible.

## Non-goals

- Rewriting the three-axis controller.
- Promising native DPR 3 during travel.
- Treating every touch device as weak.
- Optimizing shaders, textures, wildlife, physics, or placard glass in this
  change.
- Using full debug measurements as production evidence.
- Adding browser automation without explicit approval.

Retained-resource growth during the traverse deserves a separate performance
investigation after the controller reports trustworthy foreground metrics.
Keeping that investigation separate preserves a clear result for the policy
fix.

## Post-experiment amendment: traversal resource warm-up

The corrected-policy experiment preserved that separation and then supplied
the missing evidence. With the meadow removed, settled rendering held 60 FPS
while travel still reached 77 ms p95 and 556 ms maximum. Renderer counts rose
during the same travel from 61 to 194 programs, 50 to 127 textures, and 102 to
463 initialized geometries. Stable-resource frames returned to 18 ms p95.

That result authorizes a separate, reversible implementation gate after the
controller work: mount the role-sized unit visuals before interaction, perform
a 1×1 offscreen GPU warm-up after asset completion, exclude the warm-up window
from adaptation, and retain the old proximity path behind a live Scene
Diagnostics control. This amendment does not change the steady scene's visual
policy or add higher-resolution assets.

The same experiment also refines the inferred-GPU acceptance rule. When p50 is
continuously late, a resolution cut is helpful only if it materially improves
p50 or restores accepted cadence; p95-only improvement cannot reopen the
resolution ladder. Policy storage advances to v10 so a v9 floor learned under
the former rule is not restored.

## Post-validation amendment: interruption evidence

The first corrected-policy phone run showed median cadence recovering while
Auto lowered DPR after the screenshot menu closed. Transition-only evidence
cannot tell whether DPR caused that recovery or WebKit independently released
a temporary presentation throttle.

Under `hud=1`, the support log must retain at least four minutes of sampled
quality windows plus bounded focus and page-lifecycle events. Each sample must
include the current axes, classification, cadence metrics, whether Auto could
use it, movement state, and renderer program, texture, and geometry counts.
This history is diagnostic only. It must not publish React state, affect the
quality reducer, or allocate during an ordinary production visit.

## Post-validation amendment: bounded light-shape experiment

The all-light iPhone trace isolates the remaining first-travel freeze to cold
shader creation. Six multi-second frames each coincided with program growth,
while textures, geometry, React commits, long tasks, and relevant requests
remained stable. Settled rendering stayed near 60 FPS after the programs
existed.

Do not precompile the complete scene against every nearby-light neighborhood.
That multiplies roughly a scene's worth of material programs by every distinct
point/spot count and can turn the boot gate into a many-second compiler stall.
Instead, test one constant, bounded program shape: retain real lights only for
the active unit and its immediate neighbors, then expose zero-intensity padding
lights only for the missing point and spot slots up to the largest possible
nearby neighborhood. The visual result must remain unchanged.

The experiment must have a live Scene Diagnostics switch, reset on reload, and
remain default-off until an iPhone device trace measures the steady-cost trade.
Its off path must mount no padding lights and perform no per-frame work.
Acceptance requires no material travel-time program growth or multi-second
frame, no material settled-frame regression, and an acceptable one-time
compile delay after the switch is enabled. The all-light mode remains a
diagnostic control, not the candidate production policy.

The fixed Efficient device trace on 2026-08-21 accepted the candidate. Travel
p95 fell from 2,099 ms in the all-light diagnostic control to 66 ms, and the
maximum frame fell from 3,588 ms to 212 ms. Settled median remained 17 ms,
settled p95 was 26 ms, and boot had no perceptible regression. The stable,
bounded light shape is therefore the production default; its live off switch
remains the rollback and variable-shape comparison.
