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
poor guide — the retired Musings sailboat grouped mast and hull islands into
broad material meshes whose unsplit box top was 13 cm above anything a probe
could hit, and the lighthouse that replaced it has a tower box reaching its
lantern floor while its only landable surface is the dome above. The
`musings:lighthouse-dome` anchor is the resolved triangle contact read back
out of the real GLB (`UnitBlog.landing.test.ts`), not a corner of any box;
its gallery deck and plinth ledge both measured flat and both reject as
`approach-blocked` because the approach passes through the tower. When adding
a site, author it, read the HUD (or the diagnostics dump, or `pnpm
check:perches`), and copy the resolved contact back into both files. Every
anchor added in the +13 round below was authored that way: a candidate near
the prop, then the measured contact written back.

The Books shelf is the exception, and deliberately: its Perches are projected
through the same count-dependent layout that places the covers
(`featuredBookPerchDefinitions`), so they are measured by construction and the
rows below are a mirror of what that projection produced. Adding one is adding
a book id to `BOOK_PERCH_IDS`.

The development HUD is the live inventory: its Perch section shows the real
authored anchor/contact/normal, owner and occupant, complete envelope, Landing
Plan routes, collision revision, and exact rejection code. It can filter the
active shelf or all shelves, pause automatic landings, and force a normal
planner attempt. The tables below remain the authoring mirror; owner visual
sign-off is recorded separately rather than invented by a headless test.

## About — unit 0

| ID                         | Intended surface       | Anchor `[x, y, z]`            | Normal `[x, y, z]`           | Owner match                      | Lamp ID       | Clearance |
| -------------------------- | ---------------------- | ----------------------------- | ---------------------------- | -------------------------------- | ------------- | --------: |
| `about:aic-crown`          | AI Collective mark top | `[-0.8383, -0.4801, -0.1065]` | `[0, 1, 0]`                  | `id: grab:ai-collective-mark`    | —             |    `0.12` |
| `about:portrait-frame-top` | Profile portrait crown | `[-0.4211, 1.0002, -0.1101]`  | `[0, 0.9982, -0.0600]`       | `id: grab:photo:portrait`        | —             |    `0.12` |
| `about:behave-top`         | Rearmost reading book  | `[0.3300, -0.3470, 0.0350]`   | `[0, 1, 0]`                  | `id: grab:reading:behave`        | —             |    `0.12` |
| `about:lamp-shade`         | Desk-lamp shade crown  | `[-0.6848, -0.2193, -0.0106]` | `[-0.2812, 0.9166, -0.2842]` | `id: egg:lamp:0`                 | `desk-lamp-0` |    `0.12` |
| `about:tj-medallion-rim`   | TJ medallion top rim   | `[-0.2400, -0.5890, -0.0800]` | `[0, 1, 0]`                  | `id: grab:tj-medallion:about`    | —             |    `0.12` |
| `about:other-minds-top`    | Frontmost reading book | `[0.6900, -0.3470, 0.1500]`   | `[0, 1, 0]`                  | `id: grab:reading:other-minds`   | —             |    `0.12` |
| `about:family-frame-top`   | Family frame top edge  | `[0.4348, 0.3476, 0.0869]`    | `[0.0245, 0.9961, -0.0848]`  | `id: grab:photo:about-family-v8` | —             |    `0.12` |

## Books — unit 1

| ID                                                | Intended surface                  | Anchor `[x, y, z]`           | Normal `[x, y, z]`          | Owner match                                    | Lamp ID | Clearance |
| ------------------------------------------------- | --------------------------------- | ---------------------------- | --------------------------- | ---------------------------------------------- | ------- | --------: |
| `books:the-12-levers-pages`                       | _The 12 Levers_ page-block top    | `[-1.1258, 0.5160, 0.2222]`  | `[0, 1, 0]`                 | `id: book:the-12-levers`                       | —       |    `0.12` |
| `books:superminds-pages`                          | _Superminds_ page-block top       | `[-0.0502, 0.5127, 0.2013]`  | `[0, 1, 0]`                 | `id: book:superminds`                          | —       |    `0.12` |
| `books:life-3-0-pages`                            | _Life 3.0_ page-block top         | `[0.7133, -0.3320, 0.2166]`  | `[0.1618, 0.9868, 0.0038]`  | `id: book:life-3-0`                            | —       |    `0.12` |
| `books:thinking-fast-and-slow-pages`              | _Thinking, Fast and Slow_ pages   | `[1.0669, -0.3438, 0.2099]`  | `[0, 1, 0]`                 | `id: book:thinking-fast-and-slow`              | —       |    `0.12` |
| `books:bowling-alone-pages`                       | _Bowling Alone_ page-block top    | `[0.6861, 0.4985, 0.2252]`   | `[0, 1, 0]`                 | `id: book:bowling-alone`                       | —       |    `0.12` |
| `books:barking-up-the-wrong-tree-pages`           | _Barking Up the Wrong Tree_ pages | `[-1.0664, -0.3520, 0.2205]` | `[0, 1, 0]`                 | `id: book:barking-up-the-wrong-tree`           | —       |    `0.12` |
| `books:homo-deus-pages`                           | _Homo Deus_ page-block top        | `[-0.3607, -0.3156, 0.1806]` | `[0.0301, 0.9571, -0.2883]` | `id: book:homo-deus`                           | —       |    `0.12` |
| `books:7-habits-of-highly-effective-people-pages` | _7 Habits_ page-block top         | _projected from the layout_  | _projected_                 | `id: book:7-habits-of-highly-effective-people` | —       |    `0.12` |

## Training — unit 2

| ID                              | Intended surface              | Anchor `[x, y, z]`           | Normal `[x, y, z]`          | Owner match                            | Lamp ID | Clearance |
| ------------------------------- | ----------------------------- | ---------------------------- | --------------------------- | -------------------------------------- | ------- | --------: |
| `training:barbell-bar`          | Barbell bar, mid-span         | `[1.9200, -0.8375, -1.0400]` | `[0, 1, 0]`                 | `id: grab:barbell`                     | —       |    `0.06` |
| `training:protein-lid`          | Protein-tub lid               | `[0.4200, 0.5090, -0.2000]`  | `[0, 1, 0]`                 | `id: grab:protein`                     | —       |    `0.12` |
| `training:dumbbell-left-plate`  | Left dumbbell crown           | `[0.2501, -0.5961, -0.1887]`  | `[0, 1, 0]`                 | `id: grab:dumbbell:training:left`      | —       |    `0.12` |
| `training:navy-shaker-rim`      | Navy shaker lid ring          | `[1.1213, 0.4120, -0.0459]`  | `[0, 1, 0]`                 | `id: grab:shaker:training-navy`        | —       |    `0.02` |
| `training:dumbbell-right-plate` | Right dumbbell inner plate    | `[-1.1645, 0.2608, 0.3314]`  | `[0, 1, 0]`                 | `id: grab:dumbbell:training:right`     | —       |    `0.12` |
| `training:pickleball-frame-top` | Pickleball frame top edge     | `[-0.1217, -0.5186, 0.0512]` | `[0.0102, 0.9954, -0.0951]` | `id: grab:photo:training-pickleball-group-v8` | — |    `0.12` |
| `training:golf-flag-frame-top`  | Golf-flag frame top edge      | `[-0.6876, -0.4764, 0.1023]` | `[0.0198, 0.9945, -0.1026]` | `id: grab:photo:training-golf-flag-v8` | —       |    `0.12` |

## Systems — unit 3

| ID                              | Intended surface          | Anchor `[x, y, z]`           | Normal `[x, y, z]`    | Owner match                                 | Lamp ID       | Clearance |
| ------------------------------- | ------------------------- | ---------------------------- | --------------------- | ------------------------------------------- | ------------- | --------: |
| `systems:working-session-frame` | Working-session photo top | `[-0.2210, 0.3447, 0.0811]`  | `[0, 1, 0]`           | `id: grab:photo:systems-working-session-v8` | —             |    `0.12` |
| `systems:supplements-frame`     | Supplements photo top     | `[0.3610, 0.3275, 0.1311]`   | `[0, 1, 0]`           | `id: grab:photo:systems-supplements-v8`     | —             |    `0.12` |
| `systems:sf-dusk-frame`         | SF dusk photo top         | `[-0.6385, -0.5095, 0.1211]` | `[0, 1, 0]`           | `id: grab:photo:systems-sf-dusk-v8`         | —             |    `0.12` |
| `systems:lake-frame`            | Lake photo top            | `[-0.1909, -0.5095, 0.1210]` | `[0, 1, 0]`           | `id: grab:photo:systems-lake-v8`            | —             |    `0.12` |
| `systems:lamp-crown`            | Sunlamp panel top edge    | `[1.0789, -0.3316, -0.239]`  | `[-0.02, 1.00, 0.05]` | `id: egg:lamp:3`                            | `desk-lamp-3` |    `0.12` |
| `systems:alarm-clock-crown`     | Alarm clock crown         | `[-0.6600, 0.3040, 0.2500]`  | `[0, 1, 0]`           | `id: egg:clock:alarm`                       | —             |    `0.12` |
| `systems:lighthouse-frame`      | Lighthouse photo top      | `[0.2218, -0.4569, 0.1312]`  | `[0, 1, 0]`           | `id: grab:photo:systems-lighthouse-v8`      | —             |    `0.12` |

## Projects — unit 4

| ID                                 | Intended surface        | Anchor `[x, y, z]`           | Normal `[x, y, z]`           | Owner match                              | Lamp ID | Clearance |
| ---------------------------------- | ----------------------- | ---------------------------- | ---------------------------- | ---------------------------------------- | ------- | --------: |
| `projects:trophy`                  | Trophy cup crown        | `[-0.7427, -0.3896, 0.0547]` | `[0, 1, 0]`                  | `id: grab:trophy`                        | —       |    `0.12` |
| `projects:notebook-page`           | Notebook page           | `[0.0231, -0.8245, -0.1475]` | `[0, 1, 0]`                  | `id: grab:notebook:projects`             | —       |    `0.12` |
| `projects:phone-face`              | Phone face              | `[0.4118, -0.7928, -0.0724]` | `[0, 1, 0]`                  | `id: grab:phone:projects`                | —       |    `0.12` |
| `projects:mac-top`                 | Mac casing crest        | `[0.9205, -0.1986, 0.0229]`  | `[0.0330, 0.9910, -0.1330]`  | `id: action:projects:mac`                  | —       |    `0.09` |
| `projects:weightlifting-frame-top` | Weightlifting frame top | `[-0.8474, 0.5261, -0.1279]` | `[0.0268, 0.9945, -0.1009]`  | `id: grab:frame:Weightlifting App`       | —       |    `0.12` |
| `projects:liars-dice-frame-top`    | Liar's Dice frame top   | `[0.0050, 0.5205, -0.0875]`  | `[0.0114, 0.9949, -0.0998]`  | `id: grab:frame:Liar's Dice`             | —       |    `0.12` |
| `projects:homework-frame-top`      | Homework App frame top  | `[0.8491, 0.5299, -0.1152]`  | `[-0.0326, 0.9943, -0.1017]` | `id: grab:frame:Homework App (Acquired)` | —       |    `0.12` |

## Musings — unit 5

| ID                        | Intended surface             | Anchor `[x, y, z]`            | Normal `[x, y, z]`          | Owner match                    | Lamp ID       | Clearance |
| ------------------------- | ---------------------------- | ----------------------------- | --------------------------- | ------------------------------ | ------------- | --------: |
| `musings:writing-paper`   | Writing-paper top            | `[-0.6110, -0.8291, -0.0200]` | `[0, 1, 0]`                 | `id: grab:paper:5`             | —             |    `0.12` |
| `musings:trust-cover`     | Trust essay cover (reclined) | `[0.1370, -0.4727, -0.1184]`  | `[0, 0.3429, 0.9394]`       | `id: grab:trust-essay:musings` | —             |    `0.12` |
| `musings:open-book-page`  | Open-book page               | `[-0.1426, 0.1205, -0.0632]`  | `[0, 1, 0]`                 | `id: grab:openbook`            | —             |    `0.12` |
| `musings:tea-handle`      | Teacup handle crown          | `[-0.3814, 0.1557, 0.2114]`   | `[0, 1, 0]`                 | `id: egg:tea`                  | —             |    `0.12` |
| `musings:lamp-shade`      | Sloped desk-lamp shade       | `[-1.0035, 0.6327, -0.1446]`  | `[0.1252, 0.1588, -0.9793]` | `id: egg:lamp:5`               | `desk-lamp-5` |    `0.12` |
| `musings:headphone-band`  | Headphone band crown         | `[1.0120, 0.4910, 0.0200]`    | `[0, 1, 0]`                 | `id: grab:headphones`          | —             |    `0.12` |
| `musings:lighthouse-dome` | Lantern dome, front right    | `[1.1920, -0.2805, -0.0620]`  | `[0.2631, 0.9037, 0.3377]`  | `id: grab:lighthouse:musings`  | —             |    `0.12` |

## Talks — unit 6

| ID                           | Intended surface       | Anchor `[x, y, z]`            | Normal `[x, y, z]`           | Owner match                              | Lamp ID              | Clearance |
| ---------------------------- | ---------------------- | ----------------------------- | ---------------------------- | ---------------------------------------- | -------------------- | --------: |
| `talks:microphone-crown`     | Microphone barrel      | `[0.5311, -0.7721, 0.1237]`   | `[-0.095, 0.922, 0.374]`     | `id: grab:microphone`                    | —                    |    `0.12` |
| `talks:harmonica-deck`       | Harmonica deck         | `[0.8200, 0.0903, 0.0800]`    | `[0, 1, 0]`                  | `id: grab:harmonica:talks`               | —                    |    `0.12` |
| `talks:consensus-frame-top`  | Consensus photo crown  | `[-0.3721, 0.4503, -0.0455]`  | `[-0.012, 0.9967, -0.0804]`  | `id: grab:photo:talk-consensus-phone-v8` | —                    |    `0.12` |
| `talks:demo-night-frame-top` | Demo-night photo crown | `[-0.9067, -0.3541, -0.0363]` | `[0.0179, 0.9973, -0.0719]`  | `id: grab:photo:talk-demo-night-v8`      | —                    |    `0.12` |
| `talks:floor-lamp-flank`     | Floor-lamp shade wall  | `[-2.1379, 1.1318, 0.2382]`   | `[0.027, 0.122, 0.992]`      | `id: egg:lamp:floor:6`                   | `talks-floor-lamp-6` |    `0.15` |
| `talks:panel-frame-top`      | Panel photo crown      | `[0.3023, 0.4006, 0.0110]`    | `[-0.0257, 0.9982, -0.0536]` | `id: grab:photo:talk-panel-v8`           | —                    |    `0.12` |
| `talks:dc-policy-frame-top`  | DC policy photo crown  | `[-0.1380, -0.3847, 0.0166]`  | `[-0.0139, 0.9986, -0.0516]` | `id: grab:photo:talk-dc-policy-v8`       | —                    |    `0.12` |

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
