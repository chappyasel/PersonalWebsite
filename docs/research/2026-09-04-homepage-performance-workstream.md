# Homepage 3D performance workstream

Status: active  
Owner: Chappy  
Started: 2026-09-04

## Purpose

Keep the authored 3D homepage ambitious without letting boot time, sustained
frame cost, or speculative performance fixes become invisible. This is the
running index for incidents, evidence, decisions, experiments, and shipped
changes. Detailed investigations can remain in their own documents and link
back here.

The working rule is simple: identify the blocked boot gate or constrained
frame resource before changing production quality. A slow boot and a slow room
may share a cause, but they are separate measurements.

## Current incident

### 2026-09-04: M2 MacBook Air

Report from a visitor:

- The boot screen appeared promptly but remained for more than 10 seconds.
- The revealed 3D scene was very laggy.
- Device was an M2 MacBook Air. The support report identified a 2x DPR and a
  nominal 4G connection. Browser thermal state remains unknown.

This corrects the original shorthand of "slow initial load." The known problem
is time inside World Boot, not time to first HTML or time to first boot-screen
paint.

Status: one affected production run reached PostHog. First paint occurred at
972 ms, the first WebGL frame at 1,878 ms, meadow readiness at 3,498 ms, and
reveal at 9,035 ms. An asset batch reopened at 3,096 ms and did not complete
until 7,411 ms. The trace also recorded six long tasks totaling 5,720 ms; its
largest task lasted 3,141 ms. The first report therefore supports both late
asset work and main-thread stalls during boot.

The browser emitted `pagehide` 2,286 ms after reveal, so the first runtime
report contains startup plus only a short post-reveal window. It was complete
for transport, but it cannot establish sustained frame cost. A second affected
run must remain visible for the full 15-second runtime window.

### 2026-09-05: iPhone survival state after app switching

An ordinary iPhone visit ran well, lost the meadow after switching away and
back, then remained in survival after frame rate recovered. The downloaded
quality log recorded 128 samples as `visible: true`, `focused: false`, and
`usable: true`. Auto made four resolution decisions before the first focus
event at 39.114 seconds. A later blur at 158.473 seconds was followed by a
focus at 161.807 seconds without a visibility transition; the first resumed
sample included a 109 ms tail before returning to normal pacing.

The cause is the foreground contract, not evidence that the phone needs a
permanent no-meadow mode. Mobile Safari can leave `document.hidden` false
while the page is unfocused, so visibility alone admitted suspended and
resume-contaminated frames. The prior survival policy then made that mistake
one-way for the visit and eligible for a 24-hour lease.

## Support capture

Send an affected visitor this URL:

```text
https://www.chappyasel.com/?perf-report=1
```

The query switch is explicit and default-off. It creates
`homepage_performance_diagnostic` events in PostHog:

| `report_kind`        | When it is sent                                                                                                                   | What it answers                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `diagnostic_start`   | As soon as the opted-in boot generation is observed                                                                               | Whether the reporter armed at all, plus the initial browser and navigation context                  |
| `boot_checkpoint`    | Boot remains unresolved at 10 or 30 seconds, or the visitor leaves before a terminal outcome                                      | Which real reveal gate is closed and whether the blocker changed while the visitor waited           |
| `boot_complete`      | The world reveals, fails, or is declared ineligible                                                                               | How long each gate took and how boot ended                                                          |
| `runtime_checkpoint` | Five visible-and-focused seconds after reveal, or when the document enters the back-forward cache                                 | Preserves an early runtime sample without ending the full capture                                   |
| `runtime`            | 15 visible-and-focused seconds after reveal, on boot failure, on final page hide, or at the 45-foreground-second capture deadline | Frame distribution, spikes, renderer edges, quality evidence, long-task totals, and resource totals |

Filter PostHog for `homepage_performance_diagnostic`. Events from one visit
share `diagnostic_run_id`; each payload also has a deterministic
`diagnostic_report_id` and the deployed `diagnostic_build_id`. Schema 4 keeps
the main verdict queryable without unpacking JSON: `diagnostic_hint`,
`dominant_constraint`, `effective_fps`, `frame_p95_ms`,
`dropped_frame_ratio`, `survival_active`, the boot milestone times, active
test profile, foreground post-reveal duration, page-hide cache status, payload
size, and truncation status are top-level properties.

If PostHog access is unavailable, press backtick to open Scene Diagnostics and
use **Download diagnostic**. That file contains the same compact boot and
runtime payloads. A redacted, twelve-event rolling backup survives reloads for
24 hours so an analytics failure or accidental reload does not destroy the
only artifact. **Download full trace** remains available separately when raw
frame and resource detail is needed.

Privacy and measurement constraints:

- Query values, resource names, resource URLs, and raw frame records are not
  uploaded.
- The five slowest resources retain only duration, transfer size, and initiator
  type, which distinguishes one blocking fetch from many small requests without
  disclosing a path.
- Query keys are retained so a report states which test switches were active.
- Runtime capture counts visible-and-focused post-reveal time. Hiding the tab
  or blurring its window pauses the 15-second clock. A persisted `pagehide`
  sends a checkpoint and resumes the remaining window on `pageshow`; a final
  page exit sends the partial evidence through the existing keepalive path.
- The runtime report is compact and bounded. It uploads aggregates, at most 16
  spike summaries, and at most 24 recent quality samples and lifecycle events.
  The shared envelope removes verbose resolved-quality history and enforces a
  36 KB report ceiling. Oversized reports shed arrays before they shed
  summaries, and say when that happened.
- The URL enables lightweight frame and browser observers, so every runtime
  report remains marked `instrumented: true`. Schema 4 keeps Auto quality live
  and omits the matrix-cost and static-world probes used by the full debug
  harness. Auto may adapt during the support visit, but diagnostic visits do
  not persist that learned profile. Synchronous prewarm work still marks its
  own frame as instrumented. Validate any fix with an ordinary production run.
- Normal visits do not load the reporter chunk or mount its scene probes.
- Diagnostic events first use a size-limited, same-origin endpoint that
  forwards only schema-4 allowlisted payloads to PostHog's public capture API.
  A successful final runtime response produces the HUD's `Uploaded` state;
  acknowledgements for boot and checkpoint events do not end the countdown.
  The ordinary browser SDK is the live-page fallback and retains the honest
  `Queued` state because it cannot prove that PostHog stored its beacon. Both
  paths capture anonymously. Missing analytics configuration fails closed and
  does not affect homepage delivery.

## Reproduction profiles

A support report says what a device saw. It does not say which of the
scene's costs the device could not afford. The named profiles below put the
scene under one hypothesis at a time so a run on a development machine, or a
second run on the affected machine, isolates that cost. Each is a bundle of
switches the scene already had (a forced preset, a render-scale ceiling, an
Auto freeze, a few performance settings). Nothing in a profile is new
capability, and no profile changes production quality policy: a visit
without `perf-profile` is an ordinary visit.

Profile visits never read or write the learned quality profile. The run starts
from the device estimate so two runs compare, and a deliberately hobbled run
must not teach the owner's next ordinary visit anything. The compact HUD
appears on every profile visit with a `TEST · <NAME>` badge, so the active
profile, preset, and scale remain visible. Pair a profile with
`?perf-report=1` to upload the same compact boot and runtime reports. Boot
reports carry `browser.test_profile` and
`browser.query_keys`; runtime reports carry `trace.session.testProfile`.

Exact URLs, local and production:

```text
http://localhost:3000/?perf-profile=constrained
http://localhost:3000/?perf-profile=unknown-device
http://localhost:3000/?perf-profile=floor
http://localhost:3000/?perf-profile=low-dpr
http://localhost:3000/?perf-profile=no-composer
http://localhost:3000/?perf-profile=light-boot
http://localhost:3000/?perf-profile=no-meadow
http://localhost:3000/?perf-profile=retina-stress

https://www.chappyasel.com/?perf-profile=constrained&perf-report=1
https://www.chappyasel.com/?perf-profile=floor&perf-report=1
```

| Profile          | Question it answers                                                                  | What changes                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `constrained`    | The control. Does the complaint survive with every scalable cost lowered at once?    | Safety forced, render scale pinned at 1x, composer off, all-unit prewarm off, full-resolution photos off, meadow off. Run this first. |
| `unknown-device` | What does Auto choose here with nothing learned to restore?                          | Auto from the device estimate. Nothing else.                                                                                          |
| `floor`          | Does the complaint survive at Safety, the cheapest preset Auto can choose?           | Safety forced. The composer stays mounted; Safety's own direct-render fallback is an Auto decision and does not fire in forced mode.  |
| `low-dpr`        | Is the frame fill-rate bound?                                                        | Auto's starting axes, frozen, with the render scale pinned at 1x.                                                                     |
| `no-composer`    | How much of the frame is the finishing composer?                                     | Auto's starting axes, frozen, rendered directly with no post-processing.                                                              |
| `light-boot`     | Is boot time spent in all-unit prewarm or full-resolution photos?                    | `prewarmAllUnitVisuals` and `highResolutionPhotos` off. Auto adapts as normal.                                                        |
| `no-meadow`      | Is the meadow instance build the boot gate?                                          | `meadow` off, which also releases the meadow boot gate. One variable; everything else is production.                                  |
| `retina-stress`  | Does a fast machine reproduce the lag once it fills a high-density display's pixels? | Showcase forced at a 3x ceiling, bounded by the 20 MP allocation limit. This is the Auto range's top cost, not a preset Auto picks.   |

Precedence: an explicit `?quality=` wins over the profile's preset, and an
explicit switch such as `nopostfx` merges on top of the profile's settings.
`?perf-profile=light-boot&nopostfx` is the profile plus that switch. An
unknown profile name is ignored rather than mapped to a default, so a typo
cannot quietly change what a report measured.

The Scene Diagnostics console (backtick) has a Test profile control at the top
of the Render panel. It shows the active profile, its question, and the exact
changes, and switches profiles live: quality mode, scale ceiling, Auto freeze,
and the composer switch apply at once, and the previous profile's settings
return to their defaults first. Boot residency, photo residency, and the
learned-quality suspension only take effect on reload, which is what the
Reload button in that section does. The reload keeps every other query switch.
Reset scene to first visit strips `perf-profile` along with the other
overrides.

What a profile cannot emulate:

- GPU throughput, memory bandwidth, and driver behavior. A 3x ceiling raises
  the pixel count, not the cost per pixel on an integrated GPU.
- Thermal state. The M2 report may be a throttled machine; nothing in-page
  can throttle a healthy one.
- Cold caches and cold shader compilation. Use a fresh browser profile or an
  incognito window with the cache disabled; the profile leaves storage alone.
- Safari. Every profile is a Chrome-side reproduction of a workload; a
  Safari-specific WebGL cost needs the affected browser.
- Main-thread speed and network conditions. Those come from Chrome DevTools,
  below.

### Chrome CPU and network matrix

Run this in Chrome with DevTools open. CPU throttling lives in the
Performance panel's capture settings; network throttling and Disable cache
live in the Network panel. Close other tabs, plug the laptop in, and give the
machine a minute at idle before the cold row. Record each cell with the
experiment template further down.

| Row | CPU         | Network     | Cache    | URL                                           | What the cell tells you                                                            |
| --- | ----------- | ----------- | -------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| A   | No throttle | No throttle | Enabled  | `/?perf-report=1`                             | The development machine's baseline for every other row                             |
| B   | No throttle | No throttle | Disabled | `/?perf-report=1`                             | Cold-cache boot on a fast machine; the boot gate timeline to compare against       |
| C   | 4x slowdown | No throttle | Disabled | `/?perf-report=1&perf-profile=constrained`    | The control: every scalable cost lowered at once. Lag here is not one of them      |
| D   | 4x slowdown | No throttle | Disabled | `/?perf-report=1`                             | Main-thread-bound boot: parse, meadow construction, shader compilation             |
| E   | 6x slowdown | No throttle | Disabled | `/?perf-report=1&perf-profile=light-boot`     | Whether prewarm and photo residency are the main-thread cost row D found           |
| F   | 6x slowdown | No throttle | Disabled | `/?perf-report=1&perf-profile=no-meadow`      | Whether the meadow instance build is the gate row D found; compare `meadow_ready`  |
| G   | 4x slowdown | Fast 4G     | Disabled | `/?perf-report=1`                             | Whether the asset gate, not compute, holds the 10-second checkpoint                |
| H   | 4x slowdown | Slow 4G     | Disabled | `/?perf-report=1`                             | The 10-second boot checkpoint under a slow link; expect `blocking_gate: assets`    |
| I   | No throttle | No throttle | Enabled  | `/?perf-report=1&perf-profile=retina-stress`  | Fill-rate pressure on a fast GPU; compare settled p95 and DPR against row A        |
| J   | No throttle | No throttle | Enabled  | `/?perf-report=1&perf-profile=low-dpr`        | Fill-rate isolation: if row I lagged and this does not, resolution is the lever    |
| K   | No throttle | No throttle | Enabled  | `/?perf-report=1&perf-profile=no-composer`    | Composer isolation: the difference from row A is the finishing chain's cost        |
| L   | 4x slowdown | No throttle | Enabled  | `/?perf-report=1&perf-profile=floor`          | Whether a slow main thread still lags at the production floor                      |
| M   | 4x slowdown | No throttle | Enabled  | `/?perf-report=1&perf-profile=unknown-device` | What Auto chooses and how fast it settles on a slower machine with nothing learned |

Row C is the control and runs before the rest. If it still boots slowly or
lags with Safety, 1x, no composer, no prewarm, no full-resolution photos, and
no meadow, then none of those scalable costs is the cause, and the profile
rows that vary them one at a time will not find it. It does not rule out
what the control leaves in place: the unit models and textures, asset
download, shader compilation, GPU upload, physics, or the browser itself.
Rows D through H answer the boot half of the M2 report. Rows I through M
answer the laggy-room half. Read each runtime report's `constraint` before
drawing a conclusion: a low frame rate with low main-thread cost points at the
GPU or presentation, and CPU throttling cannot reproduce that. If rows I and J
disagree and row L still lags, the lever is resolution and effects, which is
the P2 evidence the work queue asks for. If rows D and E disagree, boot
residency is the lever, which is the P1 evidence. If rows D and F disagree,
the meadow build is the gate, and the boot report's `meadow_ready` milestone
should show the gap directly.

Chrome's CPU throttle multiplies main-thread time only. It leaves the GPU,
compositor, and network workers alone, so a throttled run that boots slowly
but renders smoothly is evidence about the boot, not the room.

## Boot gates

World Boot reveals only after these facts are true:

1. The WebGL chunk has reported an asset-loading state.
2. The asset manager is complete and has remained quiet for its settle window.
3. The renderer has painted a frame.
4. The meadow has built its instance buffers.
5. The opening vignette has completed or reached its bounded ceiling.

The diagnostic timeline records state-machine transitions, not the boot
screen's rotating sentences. The relevant design decisions are
[ADR 0021](../../src/app/components/stacks/docs/adr/0021-model-the-world-boot-as-a-state-machine.md)
and
[ADR 0022](../../src/app/components/stacks/docs/adr/0022-report-the-gate-and-never-let-it-be-outranked.md).

## Baseline before this workstream

Local production-build inspection on 2026-09-04 found:

- Initial route JavaScript: about 372.8 KB gzip.
- Immediate `StacksCanvas` chunk group: about 567.9 KB gzip.
- Effects added about 24 KB of unique gzip JavaScript.
- Rough JavaScript total before scene assets: about 965 KB gzip. This is a
  bundle accounting estimate, not an exact network waterfall.
- Server homepage HTML: 826,486 bytes raw, 121.7 KB gzip, 72.5 KB Brotli.
- The HTML estimate included 648 `div` elements, 434 anchors, and 21 images.
- The existing route budget guarded the initial static route but did not cover
  the lazy 3D group, scene assets, boot-gate durations, or frame cost.

The latest accepted physical-device trace is from the August iPhone work. It
predates substantial scene growth and is useful as historical evidence only.
See [the mobile quality implementation log](2026-08-20-mobile-quality-recovery-implementation-log.md).

## Completed work

### Before 2026-09-04

- Replaced distributed boot decisions with one tested state machine.
- Made the boot copy report the first real unresolved gate.
- Bounded the cosmetic vignette gate and froze boot clocks while the document
  is hidden.
- Added an adaptive quality controller with separate content, effects, and
  resolution axes.
- Added a bounded quality journal and a detailed scene performance trace.
- Removed the diagnostic telemetry fanout that caused periodic 250 ms hitches.
- Added shader and physics prewarming, stable neighborhood-light shape, and
  resident-unit activity controls. Each was validated in the August mobile
  investigation, not on the reported M2 machine.

### 2026-09-04

- Added `?perf-report=1` automatic PostHog capture.
- Added an immediate start report, 10- and 30-second boot checkpoints, and a
  latest-state page-exit checkpoint so a stuck gate can report before it
  resolves and show whether the blocker changed while the visitor waited.
- Added a compact runtime report with no resource names or raw frames.
- Added a five-second runtime checkpoint and a foreground-time capture clock.
  Hidden or unfocused pages pause the clock; back-forward-cache exits preserve
  a checkpoint and resume after restoration. Final exits record the browser's
  `persisted` verdict and the recent visibility and focus lifecycle.
- Changed the HUD to count down `KEEP OPEN 15s` after reveal and to show
  `PAUSED` while the document is hidden or unfocused. `Uploaded` now means the
  final runtime report received relay acknowledgement, not that an earlier boot
  event did.
- Moved the capture and test-profile states into the HUD instead of placing
  them over the scene beneath it. The complete instrument keeps its translucent
  glass while adding a state tint: cyan while recording, amber while paused or
  on fallback, and green after capture or upload. A brighter label, border,
  glow, and blurred backdrop keep the status legible against both light and
  dark skies without hiding the scene.
- Kept the diagnostic reporter on demand and the probes default-off. The lazy
  Scene Diagnostics panel shares that reporter module for its download action.
- Made the compact HUD visible for `?perf-report=1`. It reports the automatic
  capture as armed, recording, captured, or queued. `Queued` means the report
  reached the PostHog SDK for an immediate beacon; it does not claim server
  acknowledgement. Missing analytics configuration leaves the honest
  `Captured` state visible. The same quiet status reports recording and ready
  states for manually started performance traces.
- Opening the diagnostics drawer does not stop an automatic report. Manual
  traces retain the existing stop-and-review shortcut behavior.
- Added a downloadable diagnostic bundle containing the exact compact boot and
  runtime payloads. Its redacted twelve-event rolling backup survives reloads
  for 24 hours.
- Deepened the reporter behind one event-building interface. Boot and runtime
  now share schema 4, deployment identity, deterministic report identity,
  bottleneck classification, top-level PostHog metrics, privacy compaction,
  and a 36 KB transport ceiling instead of reproducing those rules in two
  callers.
- Added a same-origin diagnostic relay with origin, schema, property, and
  48 KB request validation. It forwards an anonymous event to PostHog and
  returns an acknowledgement the HUD can distinguish from the SDK fallback.
  Normal analytics remain on their existing client path.
- Split support capture from the heavier debug harness. Support capture keeps
  Auto quality decisions live and omits the matrix-cost and static-world
  probes; full diagnostics retains the instrumented-frame exclusion.
- Re-arm both boot and runtime capture when the boot machine starts a new
  generation, keeping the report ID and timers aligned after an in-page retry.
- Added eight named `?perf-profile=` reproduction profiles (constrained,
  unknown-device, floor, low-dpr, no-composer, light-boot, no-meadow,
  retina-stress). `constrained` is the combined low-cost control and runs
  first; it rules out only the scalable costs it lowers. Each composes
  existing switches, is default-off, shows the compact HUD, ignores and never
  saves learned quality, and is named in the report session as
  `testProfile`. The Scene Diagnostics Render panel switches them live and
  reloads under one. See Reproduction profiles above.
- Repaired the meadow-off presentation without restoring terrain cost. The
  skyline now dissolves into the horizon from above when no terrain is
  mounted, instead of exposing its below-grade city mass in dark mode. The
  golf cup liner and rim are also omitted when their supporting surface is
  absent. Ordinary meadow-on visits retain the previous skyline blend and
  complete cup geometry.
- Preserved a complete golf success when the meadow is absent. The solver
  still captures the real shot, drops the ball through the cup, awards the
  semantic success, and resets it. Presentation opacity now follows that
  physical drop to zero because no terrain or cup liner remains to occlude
  the ball. Turf puffs and the reduced-motion cup ring are also omitted when
  their supporting surface is absent.
- Added an automatic survival rung for severe sustained pressure after the
  useful ordinary axes are exhausted. CPU pressure must first reach minimal
  content; GPU pressure must exhaust resolution and effects. The severe run
  then has to continue for 10 seconds while settled before Auto acts.
- Survival fades the meadow over 800 ms while the skyline's no-meadow blend
  eases in, then unmounts the meadow, butterflies, petals, and wildlife. The
  initial policy kept this one-way for the visit; the 2026-09-05 follow-up
  below replaces that rule with one evidence-gated recovery attempt.
- A validated survival result carries into ordinary Auto visits for 24 hours.
  Its original expiry never renews from a restored no-meadow visit, so a
  frequent visitor still gets a fresh meadow probe after the lease ends.
  Named profiles, traces, harness pins, manual resolution controls, and meadow
  overrides cannot teach this state. The existing live Meadow control remains
  the explicit comparison and recovery switch.
- Added `SURVIVAL` to the compact HUD and the Render panel readout. Quality
  evidence, transition journals, downloadable logs, and support reports carry
  the survival axis with the other adaptive state.
- Support-only profile explanations and URL parsing are split away from the
  ordinary homepage graph. In the latest integrated production build, the
  homepage is 375.1 KB gzip against a 372.8 KB baseline: 2.3 KB of growth,
  within its 3 KB tolerance without moving the baseline.
- A local production browser pass exposed an invalid meadow flower fragment
  shader: its fade path read `uOpacity` without declaring the uniform. Added
  the missing declaration and a source-level regression assertion. This was a
  correctness bug found during validation; the existing M2 trace does not
  establish that it caused the reported 10-second boot.
- Re-ran the complete support flow against the corrected production build.
  The HUD moved through `Armed`, `Recording`, the full `Keep open 15s`
  countdown, `Captured`, and `Uploaded`. The start, boot-complete,
  five-second checkpoint, and 15-visible-second final requests each received
  `202` from the same-origin relay, which only acknowledges after PostHog's
  capture endpoint accepts the event. The recorded final window contained
  15,019 ms of post-reveal evidence.
- Production compilation, route budgets, search-boundary checks, lint, type
  checking, and all 2,926 unit tests passed. A true background-tab pause was
  not browser-tested: Superset panes remain visible, and the external Chrome
  extension was not connected. The foreground-time clock and pause/resume
  scheduling remain covered by deterministic unit tests.

### 2026-09-05

- Tightened quality evidence from "visible" to "visible and focused." Window
  blur, page hide, freeze, and per-frame focus checks now suspend and clear the
  rolling sampler; foreground resume discards the two frames whose CPU timing
  can straddle the boundary. Persistence uses the same focus gate.
- Invalidated quality storage learned by the old policy. Axis entries advance
  from version 10 to 11, and the renderer-independent survival lease advances
  from version 1 to 2, so an old false survival result cannot suppress the
  meadow after deployment.
- Replaced visit-long survival with one guarded recovery probe. After 15
  seconds of uninterrupted foreground headroom, Auto fades the meadow back in
  over 1.2 seconds. If pressure returns and survival retires it again, no
  second recovery is attempted during that mount. A successful recovery clears
  only the survival lease and preserves useful learned resolution, effects,
  and content axes.
- Added the focus boundary, recovery attempt, and recovery state to the compact
  diagnostic evidence so a future support report can distinguish a suspended
  page from a failed meadow retry.

## Work queue

| Priority | Idea                                               | Status                         | Evidence required before shipping                                                                                                                               |
| -------- | -------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Capture the reported M2 boot and runtime           | Boot captured; runtime partial | Repeat the affected production run and keep it visible through the full 15-second runtime countdown                                                             |
| P0       | Name the 10-second boot blocker                    | First evidence captured        | Late asset work and main-thread stalls both appear; isolate the 3,141 ms stall and the asset batch that completes at 7,411 ms                                   |
| P0       | Re-baseline the current scene                      | Proposed                       | Production build bundle report and physical-device traces after the recent scene growth                                                                         |
| P1       | Start unknown devices at a cheaper profile         | Proposed, idea 3               | Compare time to reveal and first 15 seconds of cadence against the current balanced start; confirm no visible flash or oscillation                              |
| P1       | Add a persisted survival rung                      | Updated locally; revalidate    | On weak hardware, confirm that retirement restores pacing and that one foreground-headroom recovery either remains healthy or retires once without oscillating  |
| P1       | Reduce boot residency and prewarm scope            | Proposed                       | Only if the report points to assets, first frame, meadow construction, shader compilation, or GPU upload                                                        |
| P1       | Add real performance budgets                       | Proposed, idea 5               | Choose thresholds from current production distributions, then enforce lazy 3D bytes, asset bytes, boot p95, frame p95, dropped-frame ratio, and renderer counts |
| P2       | Stop rendering the fully settled room continuously | Proposed, idea 4               | Inventory every ambient system that needs time; prototype demand rendering or a capped idle cadence without freezing authored life                              |
| P2       | Reduce full-frame effects or DPR sooner            | Evidence dependent             | A runtime report showing fill-rate pressure, healthy main-thread cost, and improvement under a controlled lower-resolution or lower-effects run                 |
| P2       | Split units or defer nonlocal visuals              | Evidence dependent             | A boot or travel report showing parse, asset, compile, upload, or first-use stalls tied to all-unit residency                                                   |

## How to run an experiment

Change one workload dimension at a time. Record:

```text
Date:
Build or commit:
Device and browser:
Cold or warm:
Diagnostic URL and switches:
Hypothesis:
Baseline report IDs:
Single change:
Result:
Visual or interaction regressions:
Decision: accept, reject, or gather more evidence
Rollback:
```

For runtime work, separate settled frames from travel. Record p50, p95, p99,
dropped-frame ratio, main-thread cost, renderer calls and triangles, textures,
geometries, programs, DPR, framebuffer size, and active quality axes. A lower
frame rate with low main-thread cost suggests GPU or presentation pressure; it
does not prove it by itself.

For boot work, record the first unresolved gate and each milestone time. Do
not use asset percentage as a proxy for shader compilation, GPU upload, or
meadow construction.

## Decision log

### 2026-09-04: Measure before changing production quality

The M2 report is credible but does not yet identify a cause. Production quality
policy remains unchanged until the automatic report names the boot gate and
captures runtime evidence.

### 2026-09-04: PostHog stores summaries, not raw traces

Raw traces can contain tens of thousands of frames and resource names. The
support URL therefore uploads a bounded diagnostic summary. The existing
download action remains the path for a full local trace when a compact report
is insufficient.

### 2026-09-04: Unknown-device, idle-rendering, and budget work stay separate

Ideas 3, 4, and 5 are all worth pursuing, but they answer different failure
modes. A conservative starting profile changes entry behavior, idle rendering
changes sustained workload, and budgets prevent recurrence. They should be
tested and landed independently so the evidence remains interpretable.

### 2026-09-04: A queued SDK event is not a stored report

The first local support run exposed an observability gap: the HUD said `Sent`
as soon as `posthog.capture` returned, while the PostHog connection available
to this machine could not query the configured project. Schema 2 now says
`Queued`, requests an immediate beacon, and keeps a downloadable copy of the
compact payload in the tab. Production quality remains unchanged.

### 2026-09-04: A diagnostic upload gets an acknowledged first-party path

Schema 3 introduced an opted-in diagnostic path through the site's own
constrained endpoint before falling back to the browser SDK. The endpoint
accepts only same-origin, allowlisted payloads under 48 KB, forwards them
anonymously to PostHog, and reports success only after PostHog's capture API
responds successfully. This makes `Uploaded` stronger than the earlier SDK
`Queued` state without rerouting ordinary analytics or enabling automatic
capture. A 24-hour redacted local backup remains the final recovery path.

### 2026-09-04: Runtime duration means foreground evidence

The first affected M2 report ended on `pagehide` after only 2,286 ms of
post-reveal evidence. Schema 4 keeps that early report but distinguishes a
final exit from a back-forward-cache transition. A cached page sends a
checkpoint, pauses the foreground-time clock, and resumes the remaining capture
on restoration. Window blur now pauses the same clock even if mobile Safari
leaves the document visible. The normal five-second checkpoint preserves a
useful sample if the visitor leaves later. The HUD counts down the full
15-second target and does not say `Uploaded` when only a boot or checkpoint
event was acknowledged.

### 2026-09-04: Profiles compose switches and never touch learning

A reproduction profile is a named bundle of the switches the scene already
exposes, not a second quality policy. Composition keeps the diagnostics
console honest: every profile's effect is visible as ordinary control values
that can be changed live. Suspending learned quality on every profile visit
costs the affected-device run nothing (a support visit already never
persists) and prevents a deliberately hobbled run from teaching the owner's
next ordinary visit.

### 2026-09-05: Permit one evidence-gated survival recovery

The current automatic controller lowers resolution, effects, meadow mesh
complexity, terrain tessellation, and offscreen wildlife. It intentionally
keeps grass instance density at full coverage and never unmounts the meadow.
That preserves the authored field, but it leaves no final environment lever
after every existing axis reaches its floor.

The implemented rung waits until the axes that can help the measured resource
are exhausted, then requires another 10 seconds of severe, settled evidence.
CPU-bound frames must first reach minimal content. GPU-bound frames must first
exhaust resolution and effects; content stays reserved for measured CPU work.
Unattributed pressure gets the strictest rule and requires all three ordinary
axes at their floors.

The field fades out, the skyline blend follows it, and the meadow-owned scene
layer unmounts after 800 ms. The iPhone trace showed that making this state
visit-long is too conservative when the triggering evidence can straddle an
app switch. Auto now requires 15 seconds of uninterrupted visible-and-focused
headroom before one 1.2-second fade-in. If renewed pressure retires the field,
the controller does not retry during that mount, which bounds allocation work
and prevents oscillation. A successful recovery clears the survival lease. A
validated retirement may still receive a non-renewing 24-hour lease for later
visits, after which Auto probes the meadow again. A live diagnostics override
can still mount or remove it for comparison. The remaining acceptance gate is
physical-device evidence that retirement materially improves pacing and that
the single recovery stays stable when conditions return.
