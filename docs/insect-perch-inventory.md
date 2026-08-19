# Insect landing spot inventory

This is the human-review mirror of every authored landing anchor currently in
[`insectPerches.tsx`](../src/app/components/stacks/scene/insectPerches.tsx).
It is meant to be easy to annotate or edit while reviewing the composition.

This Markdown file is **not** read by the app. Runtime changes still need to be
copied into `UNIT_PERCHES` in `insectPerches.tsx`; after that, this inventory
should be updated in the same change.

## What the values mean

- **Anchor `[x, y, z]`** is a semantic hint in shelf-unit-local coordinates,
  not the final contact point. It says roughly which part of the named prop is
  intended.
- **Normal `[x, y, z]`** is the preferred surface direction used while scoring
  contacts. Omitted normals in code use `[0, 1, 0]`.
- **Owner match** names the interaction root whose rendered geometry is
  eligible. `id:` is an exact owner ID; `prefix:` selects the first active
  owner whose ID starts with that prefix.
- **Lamp ID** makes the site moth-eligible only while that registered lamp is
  lit. Sites without one are ordinary perches. Butterflies can use either.
- **Clearance** is the stand-off distance used during approach/hover. The code
  default is `0.12`; the final perched body offset is species-specific and much
  smaller.
- **Tangent** optionally fixes the resting body heading in the contact plane;
  omitted tangents face broadly camera-side.
- **Contact distance / normal tolerance** optionally narrow the shared
  resolver defaults for an unusual prop. Rejections use stable diagnostic
  codes rather than a boolean miss.

Before a site is reserved, runtime casts through the authored x/z first, then a
5×5 fallback grid through the live owner's bounding box. It ignores
invisible/non-color-writing mesh hits and scores the remaining contacts by
distance to the authored anchor plus agreement with the authored normal. The
winning point and face normal are stored in the hit mesh's local space, so they
follow nested sway/hover as well as a moved owner. Consequently,
editing an anchor changes which real mesh contact is preferred; it does not
place the insect at that coordinate literally.

### Anchors are measured, not guessed

An anchor within tolerance of a real triangle resolves; one that is not is
rejected as `contact-too-distant` and the site is dead. Bounding boxes are a
poor guide — a sailboat's mast shares one mesh with its hull, so the box top is
13 cm above anything a probe can hit, and the `musings:sailboat-masthead`
anchor here is the resolved contact read back out of the running scene rather
than a corner of that box. When adding a site, author it, read the HUD (or the
diagnostics dump), and copy the resolved contact back into both files.

The development HUD is the live inventory: its Perch section shows the real
authored anchor/contact/normal, owner and occupant, complete envelope, Landing
Plan routes, collision revision, and exact rejection code. It can filter the
active shelf or all shelves, pause automatic landings, and force a normal
planner attempt. The tables below remain the authoring mirror; owner visual
sign-off is recorded separately rather than invented by a headless test.

## About — unit 0

| ID                         | Intended surface       | Anchor `[x, y, z]`            | Normal `[x, y, z]`           | Owner match                    | Lamp ID       | Clearance |
| -------------------------- | ---------------------- | ----------------------------- | ---------------------------- | ------------------------------ | ------------- | --------: |
| `about:aic-crown`          | AI Collective mark top | `[-0.4747, -0.6345, -0.0753]` | `[0, 1, 0]`                  | `id: grab:ai-collective-mark`  | —             |    `0.12` |
| `about:portrait-frame-top` | Profile portrait crown | `[-0.4211, 1.0002, -0.1101]`  | `[0, 0.9982, -0.0600]`       | `id: grab:photo:portrait`      | —             |    `0.12` |
| `about:globe-crown`        | Globe crown            | `[-1.2072, 0.5241, -0.0117]`  | `[-0.2467, 0.9238, 0.2929]`  | `id: egg:globe`                | —             |    `0.12` |
| `about:lamp-shade`         | Desk-lamp shade crown  | `[-0.6848, -0.2193, -0.0106]` | `[-0.2812, 0.9166, -0.2842]` | `id: egg:lamp:0`               | `desk-lamp-0` |    `0.12` |
| `about:tj-medallion-rim`   | TJ medallion top rim   | `[-0.2400, -0.5890, -0.0800]` | `[0, 1, 0]`                  | `id: grab:tj-medallion:about`  | —             |    `0.12` |
| `about:other-minds-top`    | Frontmost reading book | `[0.6900, -0.3470, 0.1500]`   | `[0, 1, 0]`                  | `id: grab:reading:other-minds` | —             |    `0.12` |

## Books — unit 1

| ID                                   | Intended surface                | Anchor `[x, y, z]`          | Normal `[x, y, z]`         | Owner match                       | Lamp ID | Clearance |
| ------------------------------------ | ------------------------------- | --------------------------- | -------------------------- | --------------------------------- | ------- | --------: |
| `books:the-12-levers-pages`          | _The 12 Levers_ page-block top  | `[-1.1258, 0.5160, 0.2222]` | `[0, 1, 0]`                | `id: book:the-12-levers`          | —       |    `0.12` |
| `books:superminds-pages`             | _Superminds_ page-block top     | `[-0.0502, 0.5127, 0.2013]` | `[0, 1, 0]`                | `id: book:superminds`             | —       |    `0.12` |
| `books:life-3-0-pages`               | _Life 3.0_ page-block top       | `[0.7133, -0.3320, 0.2166]` | `[0.1618, 0.9868, 0.0038]` | `id: book:life-3-0`               | —       |    `0.12` |
| `books:thinking-fast-and-slow-pages` | _Thinking, Fast and Slow_ pages | `[1.0669, -0.3438, 0.2099]` | `[0, 1, 0]`                | `id: book:thinking-fast-and-slow` | —       |    `0.12` |

## Training — unit 2

| ID                                | Intended surface         | Anchor `[x, y, z]`           | Normal `[x, y, z]`          | Owner match                       | Lamp ID | Clearance |
| --------------------------------- | ------------------------ | ---------------------------- | --------------------------- | --------------------------------- | ------- | --------: |
| `training:barbell-front-plate`    | Barbell near-plate crown | `[2.6630, -0.6327, -0.3820]` | `[0.2707, 0.9238, -0.2707]` | `id: grab:barbell`                | —       |    `0.12` |
| `training:protein-lid`            | Protein-tub lid          | `[0.3800, -0.2824, 0.0400]`  | `[0, 1, 0]`                 | `id: grab:protein`                | —       |    `0.12` |
| `training:dumbbell-left-plate`    | Left dumbbell crown      | `[-1.1097, 0.2814, 0.3055]`  | `[0, 1, 0]`                 | `id: grab:dumbbell:training:left` | —       |    `0.12` |
| `training:navy-shaker-mouthpiece` | Navy shaker mouthpiece   | `[1.0850, 0.4120, 0]`        | `[0, 1, 0]`                 | `id: grab:shaker:training-navy`   | —       |    `0.12` |

## Systems — unit 3

| ID                              | Intended surface          | Anchor `[x, y, z]`           | Normal `[x, y, z]`    | Owner match                                 | Lamp ID       | Clearance |
| ------------------------------- | ------------------------- | ---------------------------- | --------------------- | ------------------------------------------- | ------------- | --------: |
| `systems:working-session-frame` | Working-session photo top | `[-0.2210, 0.3447, 0.0811]`  | `[0, 1, 0]`           | `id: grab:photo:systems-working-session-v8` | —             |    `0.12` |
| `systems:supplements-frame`     | Supplements photo top     | `[0.3610, 0.3275, 0.1311]`   | `[0, 1, 0]`           | `id: grab:photo:systems-supplements-v8`     | —             |    `0.12` |
| `systems:sf-dusk-frame`         | SF dusk photo top         | `[-0.6385, -0.5095, 0.1211]` | `[0, 1, 0]`           | `id: grab:photo:systems-sf-dusk-v8`         | —             |    `0.12` |
| `systems:lake-frame`            | Lake photo top            | `[-0.1909, -0.5095, 0.1210]` | `[0, 1, 0]`           | `id: grab:photo:systems-lake-v8`            | —             |    `0.12` |
| `systems:lamp-shade`            | Sloped desk-lamp shade    | `[1.02, -0.39, 0.08]`        | `[-0.35, 0.90, 0.22]` | `id: egg:lamp:3`                            | `desk-lamp-3` |    `0.12` |
| `systems:alarm-clock-crown`     | Alarm clock crown         | `[-0.6600, 0.3040, 0.2500]`  | `[0, 1, 0]`           | `id: egg:clock:alarm`                       | —             |    `0.12` |

## Projects — unit 4

| ID                       | Intended surface | Anchor `[x, y, z]`           | Normal `[x, y, z]`          | Owner match                  | Lamp ID | Clearance |
| ------------------------ | ---------------- | ---------------------------- | --------------------------- | ---------------------------- | ------- | --------: |
| `projects:trophy`        | Trophy cup crown | `[-0.7427, -0.3896, 0.0547]` | `[0, 1, 0]`                 | `id: grab:trophy`            | —       |    `0.12` |
| `projects:notebook-page` | Notebook page    | `[0.0231, -0.8245, -0.1475]` | `[0, 1, 0]`                 | `id: grab:notebook:projects` | —       |    `0.12` |
| `projects:phone-face`    | Phone face       | `[0.4118, -0.7928, -0.0724]` | `[0, 1, 0]`                 | `id: grab:phone:projects`    | —       |    `0.12` |
| `projects:mac-top`       | Mac casing top   | `[0.8765, -0.2160, -0.1280]` | `[0.0457, 0.9906, -0.1291]` | `id: link:projects:mac`      | —       |    `0.12` |

## Musings — unit 5

| ID                          | Intended surface       | Anchor `[x, y, z]`            | Normal `[x, y, z]`         | Owner match                 | Lamp ID       | Clearance |
| --------------------------- | ---------------------- | ----------------------------- | -------------------------- | --------------------------- | ------------- | --------: |
| `musings:writing-paper`     | Writing-paper top      | `[-0.4800, -0.7925, -0.0120]` | `[0, 1, 0]`                | `id: grab:paper:5`          | —             |    `0.12` |
| `musings:book-pile-top`     | Top book in pile       | `[0.4200, -0.6545, 0]`        | `[0, 1, 0]`                | `id: grab:pile:5:47:2`      | —             |    `0.12` |
| `musings:open-book-page`    | Open-book page         | `[0.6222, 0.1205, 0.1168]`    | `[0, 1, 0]`                | `id: grab:openbook`         | —             |    `0.12` |
| `musings:tea-rim`           | Teacup rim             | `[0.3900, 0.1526, -0.0800]`   | `[0, 1, 0]`                | `id: egg:tea`               | —             |    `0.12` |
| `musings:lamp-shade`        | Sloped desk-lamp shade | `[-1.00, 0.48, 0.04]`         | `[0.30, 0.92, 0.20]`       | `id: egg:lamp:5`            | `desk-lamp-5` |    `0.12` |
| `musings:headphone-band`    | Headphone band crown   | `[0.0400, 0.3870, 0.1400]`    | `[0, 1, 0]`                | `id: grab:headphones`       | —             |    `0.12` |
| `musings:sailboat-masthead` | Sailboat rig top       | `[0.9295, -0.5023, -0.0597]`  | `[0.2844, 0.9581, 0.0343]` | `id: grab:sailboat:musings` | —             |    `0.12` |

## Talks — unit 6

| ID                           | Intended surface       | Anchor `[x, y, z]`            | Normal `[x, y, z]`          | Owner match                              | Lamp ID              | Clearance |
| ---------------------------- | ---------------------- | ----------------------------- | --------------------------- | ---------------------------------------- | -------------------- | --------: |
| `talks:microphone-crown`     | Microphone head crown  | `[0.7132, -0.7469, 0.1811]`   | `[-0.082, 0.927, 0.366]`    | `id: grab:microphone`                    | —                    |    `0.12` |
| `talks:harmonica-deck`       | Harmonica deck         | `[0.8200, 0.0903, 0.0800]`    | `[0, 1, 0]`                 | `id: grab:harmonica:talks`               | —                    |    `0.12` |
| `talks:consensus-frame-top`  | Consensus photo crown  | `[-0.3721, 0.4503, -0.0455]`  | `[-0.012, 0.9967, -0.0804]` | `id: grab:photo:talk-consensus-phone-v8` | —                    |    `0.12` |
| `talks:demo-night-frame-top` | Demo-night photo crown | `[-0.9067, -0.3541, -0.0363]` | `[0.0179, 0.9973, -0.0719]` | `id: grab:photo:talk-demo-night-v8`      | —                    |    `0.12` |
| `talks:floor-lamp-rim`       | Floor-lamp rim         | `[-2.0038, 1.3360, -0.0199]`  | `[0, 1, 0]`                 | `id: egg:lamp:floor:6`                   | `talks-floor-lamp-6` |    `0.15` |

## Current shared route and Landing Cycle

Butterflies and moths use the same acceleration-limited landing pilot in
[`insectPilot.ts`](../src/app/components/stacks/scene/insectPilot.ts).
Butterflies roam on complete-envelope-validated, arc-length Unit-local loops;
moths retain their existing lamp-cone cruise. Route position, velocity, and
acceleration are separate from wing/body presentation. Both species use the
same fixed-step pilot and precompiled Landing Plan.

```text
roam → approach → hover → touchdown → rest → launch → rejoin → roam
```

1. **Roam safely.** Twenty-one world-resident butterflies keep three staggered
   home ranges per Unit with neighboring overlap. A compiled loop is never
   camera-relative or activated before its complete envelope clears props and
   ground.
2. **Validate the complete pose.** The resolver selects a real triangle on the
   named owner. Feet/thorax must fit the exact support surface; an oriented
   folded-wing envelope must remain clear of every neighboring visible mesh.
3. **Compile before reserving.** Up to eight complete plans are swept through
   curved approach, one shallow hover arc, normal-axis touchdown, outward
   launch, and velocity-matched frozen-route rejoin. The intended support
   exception is a small contact region, not its entire mesh.
4. **Approach and inspect.** Existing velocity and wing phase are preserved.
   Speed, acceleration, and jerk bounds apply on transition frames too.
5. **Touch down by condition.** The pilot does not advance because a timer
   expired. It begins the final descent only after reaching the staging
   position and speed tolerances, then rests only after reaching stricter
   contact position and velocity tolerances.
6. **Rest continuously.** The same wing oscillator eases to a slow, small
   cadence without resetting phase. Butterflies rest `4–9 s`; moths rest
   `2–6 s`. Live contact and collision safety are rechecked as props move.
7. **Launch outward.** Calm departure follows the surface normal; pointer or
   owner disturbance adds an away vector. The first leg lifts normal to the
   surface with wings folded, then the full-wing envelope opens only after it is
   clear. Up to eight complete routes are checked before takeoff.
8. **Rejoin motion, not merely position.** The Safe Route clock freezes while
   engaged. A bounded Hermite boundary controller reaches that frozen route
   point with its recorded velocity before the route resumes, so there is no
   final-frame snap or runaway moving target.

Integrated butterfly transitions cap at `1.55` world units/s, `2.8` units/s²
acceleration, and `18` units/s³ jerk. Moths are deliberately slower at `1.35`,
`2.45`, and `15`. Fixed 120 Hz integration makes the result consistent at
30/60/120 Hz and caps a background-tab catch-up at 100 ms.

## Why this replaced the previous motion

The removed timed implementation could leave `1.196` world units of error at
the end of a plausible takeoff, then switch into an uncapped roam frame at
`71.75` world units/s. Its Bézier started with zero velocity, its hover formula
jumped at the phase boundary, and its point-only contact check could not see
wings, sibling props, or a thin obstacle between frames. Those were structural
causes of the floating, zooming, and clipping—not anchor-tuning problems.

## Honest review notes / remaining judgment calls

- Collision uses cached world-space mesh bounds for predictable low frame cost.
  This is conservative: an irregular mesh can reject a route whose triangles
  would technically leave room. The selected landing contact itself still
  comes from a real rendered triangle.
- Only a bounded region around the intended support contact is exempted during
  touchdown/rest/launch. The rest of that same mesh and all neighboring meshes
  remain colliders; coarse bounds can therefore reject a concave support whose
  triangles would leave more room.
- The inspection phase is exactly one shallow tangent-plane arc.
- Safe Routes replace the old shelf-grazing analytic roam. Collision revisions
  retain a clear route, choose a prevalidated alternate through a swept
  velocity-matched detour, or stop; there is no reactive vertical roam branch.
- Surface heading favors the camera-side tangent unless the Perch authors one.
- No interactive visual QA was run because repository policy prohibits browser
  automation unless explicitly requested. Exact composition and cadence remain
  owner-review items; the motion/collision invariants are automated.
