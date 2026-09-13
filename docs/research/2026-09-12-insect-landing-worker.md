# Insect landing worker

The experimental switch moves landing compilation for both moths and butterflies
into one shared Web Worker. It defaults on following Chappy's explicit approval
on 2026-09-13. Ordinary flight, live triangle
contact resolution, collision-index maintenance, reservation, and Three rendering
stay on the main thread.

Scene Diagnostics → Render → Optimizations → Insect landing worker controls it
live through the existing shadcn Switch. `?insectLandingWorker=0` disables it at
boot; `?insectLandingWorker=1` enables it explicitly for comparisons. Live overrides
reset to the approved default on reload unless a query seed is present. The switch
does not change the resolved quality policy.

## Planning and adoption

`insectLandingSnapshot.ts` owns the numeric collision callbacks used by both
paths. The worker reconstructs those callbacks against AABBs with stable IDs,
min/max coordinates, and a collision revision. It receives a numeric target,
kinematics, species profile, flight volume, ground height, and the bounded
support-contact exemption. It receives no Three objects, functions, or live refs.
The synchronous path uses the same helper, preserving dilated planning, exact
runtime sweeps, folded clearance, and meadow collision.

The shared pilot submits a request and keeps roaming. A pending butterfly counts
against its unit's landing limits. The worker message handler validates a
completed ticket on the main thread.
The pilot also polls for failure and cancellation in `useFrame`; it never awaits
a result there. Immediate validation avoids needlessly waiting for another
animation frame to invalidate a fast completed plan. Before adoption, the world
checks its unit
and root, the registered perch and resolved surface, the surface transform and
local contact, reservation revision, occupancy, current interaction, and moth
lighting. A grab invalidates pending work even if it ends between two frames.
Theme changes and world disposal cancel it too.

Worker snapshots expand collision boxes by 2 mm. Plants sway later in the same
frame as a request, so exact live-index revision equality rejected even fast,
valid replies. The larger boxes let the compiler prove clearance across bounded
ambient movement. Adoption force-refreshes live bounds, requires the original
snapshot revision, and checks every collider's ID and containment inside its
captured box. New geometry or movement beyond the snapshot rejects the result.
A passing plan receives the exact live revision for reservation. This is a linear
containment proof, not another route search. Target transforms remain strict, and
any grab cancels pending work.

Adoption also rejects insects displaced more than 35 cm from their submitted position. Otherwise
it sweeps one dilated connector from the current position to the first forward
waypoint. The pilot retains its current position, velocity, and acceleration and
tracks that connector. Reservation happens only after validation and repeats the
existing reservation-time collision and resting-pose checks.

Moth candidates still belong to `lampUnitIndex`, including when the camera leaves.
Butterflies still select their own `currentUnit`, and a residency change cancels
an older unit's pending plan.

## Resource and failure behavior

One shared worker runs one job at a time. The queue holds at most 32 total jobs,
with one per insect. Pending requests retain immutable numerical snapshot
references;
only dispatched jobs clone an index, and adjacent jobs sharing that index reuse
the worker's copy. Snapshots are reused while they enclose the complete live
index. A request may contain at most 8,192 AABBs. Main-thread target
and profile copies happen only for admitted landing attempts, never on ordinary
roaming frames. Each insect has a 2.5-second worker retry interval. Worker mode
tries one
candidate at a time, so failed attempts can change landing cadence relative to
the synchronous candidate loop.

Each message has a monotonically increasing generation. Cancellation drops queued
jobs and invalidates active results. Turning the switch off terminates the worker
and rejects pending tickets. The last world's disposal releases the worker. An
idle worker otherwise remains available for later landing attempts.

Worker startup exceptions, message errors, runtime errors, and a five-second
startup/active-job timeout suspend new worker landing attempts until the toggle
cycles. Insects keep flying. There is no automatic synchronous fallback while the
worker switch remains on. Turning it off explicitly restores the synchronous
baseline. The disabled path creates no worker and makes no worker snapshots or
messages.

`__stacks.state().insectPlanning` exposes bounded planning and transport totals for
profiling. Main-thread totals cover synchronous compiler time and preparation of
admitted worker requests. Worker totals cover compilation, dispatch, round trips,
and successful compilations; pilot totals count adopted and rejected replies.
These totals do not include adoption validation, battery use, or all main-thread
scene work. In development, the Routes overlay shows observed accepted worker
plans. Synthetic route previews require the switch off, so the overlay cannot
reintroduce synchronous compiler searches during worker-mode frames.

## Verification and measurements

The local comparison uses the production build and the fixed synchronous path
from baseline `bfbb891a018fd07246bd6ea7c8eab58db2050345`. It does not intercept or
benchmark the older deployed bundle. The earlier ownership-fix A/B is evidence
for the ownership fix alone and is not a worker measurement.

Run a local production server, then:

```sh
INSECT_PROFILE_URL=http://localhost:3217 node scripts/profile-insect-landing-worker.mjs
```

The script refuses remote origins. It runs fresh isolated contexts sequentially
with Chromium/Metal, viewport 1512×982, device DPR 2, `quality=showcase`, verified
light/dark localStorage theme, and a visible page. Each context visits Systems,
Projects, Training, then Systems again. Each visit settles for six seconds and
captures twenty seconds of rAF intervals and long tasks. Raw records default to
`/tmp/insect-landing-worker-profile/`. No concurrent browser comparisons run.

Verified 2026-09-13 on Apple M5 Max with the ANGLE Metal renderer. Device DPR
was 2; the unchanged Showcase pixel budget resolved effective DPR to 1.8714.
Every capture stayed visible and retained the same quality axes. Both enabled
runs created one worker, both disabled runs created none, and all four runs
reported zero page errors.

Each row aggregates four 20-second captures. FPS is frame count divided by
recorded rAF time, excluding the first interval of each capture.

| Theme | Planner | Average FPS | Frame p95 | Frame p99 | Worst frame | Frames >50 ms | Frames >100 ms | Long tasks |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Dark | Fixed synchronous | 115.3 | 9.0 ms | 9.4 ms | 125.3 ms | 25 | 16 | 25 |
| Dark | Worker | 119.1 | 9.1 ms | 9.4 ms | 17.4 ms | 0 | 0 | 0 |
| Light | Fixed synchronous | 118.6 | 9.1 ms | 9.4 ms | 58.4 ms | 1 | 0 | 1 |
| Light | Worker | 116.5 | 9.3 ms | 16.7 ms | 58.2 ms | 2 | 0 | 4 |

Dark averaged 3.8 FPS higher, with 16 frames above 100 ms reduced to zero.
Its aggregate p95/p99 barely changed because the stalls were infrequent. Light
averaged 2.2 FPS lower and had a worse p99. This single run per setting supports
dark-mode stall reduction, not a general FPS or battery claim. The experiment was
initially default-off. Chappy subsequently approved default-on for both species;
the mixed light-mode result remains a reason to repeat measurements on more devices.

Planning totals below cover each complete context, including boot and settling.
They describe different request sequences and are not a matched-request compiler
speedup comparison.

| Theme/path | Completed compiler calls | Compiler total | Longest compiler call | Main preparation total/max | Worker dispatch total | Adopted worker plans |
| --- | ---: | ---: | ---: | --- | ---: | ---: |
| Dark synchronous | 112 | 4310.8 ms on main | 139.3 ms | n/a | 0 | n/a |
| Dark worker | 87 | 3360.5 ms in worker | 157.9 ms | 105.2 / 2.9 ms | 5.0 ms | 6 |
| Light synchronous | 116 | 437.1 ms on main | 47.3 ms | n/a | 0 | n/a |
| Light worker | 74 | 696.7 ms in worker | 166.4 ms | 81.9 / 3.4 ms | 4.0 ms | 66 |

Worker-enabled runs recorded zero synchronous compiler calls and zero worker
failures. Moths produced seven successful compilations and adopted six;
butterflies produced 67 and adopted 66. Each rejected one successful reply
because live geometry no longer fit the collision snapshot. Other replies failed
the numeric planner. Total round-trip time was 3606.4 ms for 87 moth replies and
1252.8 ms for 74 butterfly replies, including queueing and startup.

Raw captures and summaries are in `/tmp/insect-landing-worker-final/`. Earlier
smoke captures tested startup and exposed the overly strict adoption checks;
they are excluded from these tables. No deployed-bundle interception was used.

Per-visit frame results, in navigation order:

| Theme/path | Unit | p95 | p99 | Maximum | >100 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Dark sync | Systems | 9.2 ms | 9.4 ms | 116.7 ms | 5 |
| Dark sync | Projects | 8.8 ms | 9.3 ms | 41.6 ms | 0 |
| Dark sync | Training | 8.8 ms | 9.3 ms | 58.4 ms | 0 |
| Dark sync | Systems revisit | 9.1 ms | 24.6 ms | 125.3 ms | 11 |
| Dark worker | Systems | 9.1 ms | 9.3 ms | 16.7 ms | 0 |
| Dark worker | Projects | 9.2 ms | 16.7 ms | 17.4 ms | 0 |
| Dark worker | Training | 9.2 ms | 9.4 ms | 16.7 ms | 0 |
| Dark worker | Systems revisit | 8.9 ms | 9.3 ms | 9.4 ms | 0 |
| Light worker | Systems | 8.9 ms | 9.3 ms | 16.7 ms | 0 |
| Light worker | Projects | 9.2 ms | 9.4 ms | 16.8 ms | 0 |
| Light worker | Training | 16.4 ms | 17.4 ms | 42.5 ms | 0 |
| Light worker | Systems revisit | 9.3 ms | 16.8 ms | 58.2 ms | 0 |
| Light sync | Systems | 9.2 ms | 9.4 ms | 17.6 ms | 0 |
| Light sync | Projects | 9.3 ms | 16.7 ms | 58.4 ms | 0 |
| Light sync | Training | 9.0 ms | 10.6 ms | 33.3 ms | 0 |
| Light sync | Systems revisit | 8.7 ms | 9.3 ms | 34.0 ms | 0 |

The targeted verification comprises 182 passing tests across the shared pilot,
real Three world and delayed worker transport, both-species lifecycle cases,
moth ownership callers, collision/perch behavior, and diagnostics. Tests also
cover contained ambient motion versus movement beyond the conservative snapshot.
Typecheck and changed-file ESLint pass. An additional diagnostics/Chrome check
passed 65 tests after adding the shadcn Switch presentation. The production build
and real worker startup pass. The live shadcn Switch starts and stops the worker,
returned to the then-default off after reload, left quality policy unchanged, and produced no page
errors. The browser check also confirms that requests stop increasing after
disabling it. Results are saved in `/tmp/insect-worker-ui.json`; the inspected
control capture is `/tmp/insect-worker-ui.png`. `git diff --check` passes.

After the default-on approval, the release was rebased onto current `main` with
only the two insect commits; unrelated illustrated-room prototype work was
excluded. A fresh production build passed. Local browser checks in both themes
confirmed default-on worker startup and completed requests, live shutdown with
no further requests, reset to on after reload, and an explicit `=0` rollback that
creates no worker or requests. Quality policy stayed unchanged and both themes
reported no page errors. These checks are in `/tmp/insect-worker-default-ui.json`;
they test startup and rollback, not a new performance comparison.
The complete `pnpm verify` gate passes on the default-on release: TypeScript,
strict repository-wide ESLint, 3,932 tests (21 skipped), search-index freshness,
and meadow geometry checks. The synchronous geometry fixtures explicitly select
the baseline path; worker lifecycle tests continue to use delayed real compiler
results. The default-settings assertion and boot rollback test cover the approved
default and its override.

No visitor-facing Action, Portal, Artifact, Easter egg, route, or authored scene
experience was added. Field Notes catalog additions do not apply.
