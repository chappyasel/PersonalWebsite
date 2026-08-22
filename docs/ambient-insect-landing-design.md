# Ambient insect landing design

Status: **superseded in part; owner visual QA pending**

The brief below stands. The mechanism no longer does: roaming, arrival, and
departure were rebuilt on 2026-08-18 after two successive implementations were
rejected on sight. See
[ADR 0002](../src/app/components/stacks/docs/adr/0002-soft-collision-for-roaming.md)
and
[ADR 0003](../src/app/components/stacks/docs/adr/0003-steering-agent-roaming-in-a-flight-volume.md)
for what replaced them, and `CONTEXT.md` for the current vocabulary. In short:

- Roaming is a steering agent inside a **Flight Volume**, with soft collision.
  There is no safe-air graph, no active trajectory, and no detour machinery.
- Approach, hover, and touchdown are three slices of one **Arrival Curve** — a
  decaying helix that meets the surface along the surface — rather than a
  circling phase followed by a vertical descent.
- Departure is an **Escape**, defined by displacement from the Perch rather
  than by arriving anywhere, so it can never fail to take off.
- A separate presentation-only **Flap Layer** carries thorax pitch and a
  speed-coupled wingbeat.

## Confirmed brief

- Butterflies and moths should be able to land on authored scene objects.
- Every unit should contribute 3–5 distinctive, visually meaningful candidate
  locations rather than arbitrary shelf coordinates.
- Arrival should read as deliberate flight: decelerate, hover near the target,
  align to its surface, settle, and only then enter a resting wing cadence.
- Departure should reverse that language: wake the wings, lift clear, accelerate,
  and blend back into the existing flight rather than teleporting.
- Hovering, grabbing, or bringing the pointer near the occupied object should
  trigger a hurried departure away from the disturbance.
- Existing butterfly and moth flight should remain the source motion before and
  after a landing cycle. Butterflies are world-resident rather than visibly
  attached to camera x: seven staggered residents provide one home range per
  unit, with neighboring ranges supplying a small reserve during fast travel.

## Proposed perch inventory

These are semantic prop targets, not final coordinates. When an insect claims
one, a bounded grid of downward rays resolves the highest visible contact on
that prop's actual live meshes. The hit and normal are converted into the hit
mesh's local space, so contact stays exact through nested and owner transforms. A target
whose owner or visible geometry is unavailable is rejected rather than used as
a floating fallback.

| Unit     | Distinctive candidate sites                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| About    | Globe crown; reading-stack top cover; cactus pot rim; AI Collective frame top; desk-lamp shade exterior                                |
| Books    | Top featured-book upper edge; lower featured-book upper edge; top steel bookend lip; lower steel bookend lip; tallest packed-spine top |
| Training | Protein-tub lid; basketball crown; kettlebell handle; dumbbell head; golf-flag finial                                                  |
| Systems  | Sansevieria pot/leaf edge; alarm-clock crown; routine-board top edge; desk-lamp shade exterior; grandfather-clock crown                |
| Projects | Trophy rim; notebook cover; phone case edge; compact Mac top; project-photo frame top                                                  |
| Musings  | Mug rim; lighthouse lantern dome; Trust essay cover; headphones band; teacup rim; open-book center ridge                              |
| Talks    | Microphone grille; harmonica top; pothos leaf/pot rim; portrait-frame top; floor-lamp shade exterior                                   |

Safety rules: never place a perch inside a lamp shade or through a hot/light
emitter; require a real feet/thorax triangle grip plus folded body-and-wing
clearance around the complete resting pose; use an outward-facing surface normal; and reject an
occupied/moving prop before the approach commits.

## Domain terms

- **Perch** — an authored prop-relative position, surface normal, clearance,
  owner interaction key, and species/theme eligibility. Butterflies may use
  Perches throughout all seven units.
- **Lamp Perch** — a Perch inside an active practical's visible illumination.
  Moths may use only Lamp Perches, and only while their owning light is on.
- **Landing Cycle** — one insect's state sequence: `roam → approach →
touchdown → rest → launch → rejoin → roam`.
- **Disturbance** — owner hover/drag or screen-space pointer proximity that
  invalidates a perch or hurriedly ejects its occupant.
- **Departure Vector** — the camera/world-space direction away from the
  disturbance, biased outward from the perch surface before normal flight
  resumes.

## Implementation TODO

- [x] Resolve the three owner decisions below, one at a time.
- [x] Add a small allocation-free frame-loop perch registry with resolved
      prop-local contacts, normals, clearance, owner interaction key, unit,
      and species eligibility. Contact raycasts occur only when claiming.
- [x] Author and validate 3–5 perches for each of the seven units.
- [x] Extract the butterflies' analytic flight sampler from rendering so landing
      states can blend into and out of the exact existing path.
- [x] Extend moth sampling with the same state seam while preserving its light
      cone, lamp intensity, and night-only rules.
- [x] Implement deterministic perch selection with occupancy exclusion so two
      insects do not choose the same object or visibly synchronize.
- [x] Replace timed position curves with one fixed-step, acceleration-limited
      pilot shared by butterflies and moths. Phase completion is spatial and
      velocity-based rather than clock-based.
- [x] Add complete flight envelopes, exact triangle grip contacts, oriented
      folded resting/touchdown envelopes, bounded support contact, folded
      normal-axis launch lift, multi-side complete Landing Plan validation, and
      per-step collision sweeps. Ordinary butterfly roaming now uses
      arc-length, full-envelope-compiled Safe Routes; reactive shelf avoidance
      remains removed after owner QA exposed its vertical feedback loop.
- [x] Implement approach braking, tangent-plane inspection motion,
      surface-normal alignment, slow resting wings, outward takeoff, and a
      position-and-velocity-matched return to the frozen Safe Route target.
- [x] Add the shared stable-code Perch diagnostic, development HUD/scene
      helpers, active/all filters, pause control, and normal-planner force
      attempt. Omit the diagnostic layer from production.
- [x] Read `hovered` and `dragging` from the existing scene store; project the
      live perch into screen space for true pointer-near detection without
      adding pointer handlers to decorative props.
- [x] On disturbance, cancel an uncommitted approach or launch an occupant away
      from the pointer/prop before returning to flight.
- [x] Fail closed when a perch owner unmounts, changes unit eligibility, moves
      out of range, or becomes unsafe during approach.
- [x] Preserve reduced-motion omission, day/night species gating, and
      allocation-free frame loops. The seven world-resident butterflies
      intentionally add draw calls; instancing is a recorded optimization
      follow-up if profiling shows it is needed.
- [x] Add deterministic regressions for 30/60/120 Hz motion, background-tab
      catch-up, old post-takeoff zoom, speed/acceleration/jerk bounds, blocked
      routes, thin barriers, narrow supports, dynamic neighbors, obstacle
      steering, occupancy cleanup, contact resolution, and owner transforms.
- [x] Run focused Vitest, TypeScript, ESLint, formatting, and diff checks.
- [ ] Owner visual QA of final contact composition and cadence.

## Owner decisions — maximum three

1. **Resolved:** butterflies use the full seven-unit Perch catalog; moths use
   only Lamp Perches inside actively lit practical zones.
2. **Resolved:** usually one butterfly may be landed, occasionally two, and
   never more than two. Butterfly rests vary from 4–9 seconds. At most one moth per
   lamp may be landed, with 2–6-second rests and most moths remaining airborne.
   Durations are deterministically staggered rather than shared timers.
3. **Resolved:** direct hover, click, or grab on the owning object causes an
   immediate hurried departure; dragging another prop in the occupied Unit is
   treated as the same environmental disturbance. A mouse/trackpad pointer inside roughly 70
   screen pixels causes departure after an 80–120 ms confirmation; an insect
   still approaching cancels if the pointer comes within roughly 100 pixels.
   Departure points away from the pointer and outward from the surface, then
   observes the normal 15–30-second flight interval. A failed or cancelled
   claim uses a shorter 3–5-second retry backoff. Touch proximity alone does
   nothing; touch reacts only to direct interaction.
