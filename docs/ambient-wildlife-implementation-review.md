# Ambient wildlife implementation review

This is the working ledger for the Habitat Resident spec, implementation, and
verification. It is intentionally candid: shortcuts, unresolved visual calls,
and review findings belong here even when the code ships cleanly.

Published spec: https://github.com/chappyasel/PersonalWebsite/issues/17

## Settled decisions

- Add all three layers discussed in the grill: daytime ground residents
  (rabbit and western bluebirds), nighttime local life (moths around practical
  lamps), and a nighttime sky crossing (bat).
- The rabbit's Habitat spans the seam between About and Books. The bluebird
  Habitat spans Systems and Projects.
- Ground wildlife is recognizable, simplified low-poly naturalism. Avoid
  mascot proportions, faces, speech, collectibles, scores, or click targets.
- The rabbit remains continuously alive and visible in both themes. Bluebirds
  remain continuously visible in their eligible daytime theme. Behavior changes
  provide variation; opacity cycles do not.
- Relevant residents are present from scene reveal rather than waiting on a
  discovery timer.
- Rabbit translation occurs only during a committed hop. Each bluebird remains
  at one fixed scattered home; camera motion never drives resident behavior.
- Reduced-motion visitors receive no wildlife animation.

## Test seam assumption

The user explicitly said to go straight through while away, so the usual
`to-spec` pause to confirm a testing seam was waived. The chosen seam is one
pure Habitat Resident behavior model. Tests observe theme eligibility,
theming, persistent visibility, discrete locomotion, hill depth, flock homes,
peck cadence, grass clearance, and cone-local moth flight. The React Three
Fiber layer is treated as a thin visual adapter and is checked by TypeScript,
ESLint, and integration with the existing scene.

## Shortcuts

- No browser or screenshot inspection was performed. This is required by repo
  policy, but it means animal scale, silhouettes, occlusion, ground contact,
  transparent-material sorting, and lamp-shade clearance remain owner-review
  items.
- Collision avoidance is authored as safe flight volume rather than mesh-level
  physics. Moths use the camera-side half of each light cone, and ground-animal
  sight corridors shorten—but do not remove—grass around their Habitats.

## Issues encountered

- The setup skill referenced its templates under a nonexistent `references/`
  subdirectory. The templates actually live beside `SKILL.md`; the bundled
  originals were read from that location.
- The first renderer passed TypeScript, ESLint, and behavior tests but would
  have thrown at runtime: Three.js refuses to merge a mixture of indexed and
  non-indexed geometries. All inputs are now normalized to non-indexed form,
  and a smoke test constructs the exact production geometry set.
- The first startle adapter imposed a `1.35` world-unit/second speed floor
  whenever the quality layer considered the scene moving. That exceeded the
  `1.25` fast-approach threshold, so ordinary nearby scrolling could keep
  residents hidden. The shortcut was removed; the model now receives measured
  camera speed only.

## Ambiguities and judgment calls

- The grill established world anchoring for rabbit and birds but not for the
  bat. The bat is treated as a global sky event and may cross relative to the
  current camera; moths are fixture-anchored ambience around every registered
  practical.
- The existing office-hours design draft described camera-relative scheduled
  cameos. The later grill decisions and the published spec supersede those
  parts of that draft.
- The issue-tracker setup normally asks for confirmation. The existing GitHub
  remote and `CONTEXT-MAP.md`, combined with the user's instruction to proceed
  uninterrupted, were taken as approval for GitHub plus the existing
  multi-context layout.
- “After the world settles” is measured from the DOM world reveal
  (`data-world="ready"`), not Canvas mount or meadow buffer readiness. This keeps the 8–15
  second discovery window honest on both cold and warm boots.
- Theme, duty-cycle, and return transitions use material opacity while animal
  size stays fixed. The first implementation used uniform scale, which looked
  like animals growing out of or shrinking into the grass.
- The retired procedural animals used a `0.58` render scale. The selected GLBs
  now have asset-specific normalization derived from their source bounds;
  final scale remains a visual owner call.
- Wildlife materials are transparent with depth writes disabled so fades do
  not occlude the meadow before an animal is visible. Sorting artifacts are a
  visual-review risk, especially where body and head meshes overlap.

## Verification

- Before antagonistic review: 78 Vitest files / 359 tests passed; targeted
  ESLint and full TypeScript passed; the meadow envelope check passed 30,893
  assertions over 148 camera poses.
- After fixes and re-review: 79 Vitest files / 363 tests passed; full TypeScript
  passed; Prettier passed every changed file; the meadow envelope check again
  passed 30,893 assertions over 148 camera poses; and full-repo ESLint completed
  with zero errors. Its one warning is an unrelated existing unused import in
  `src/app/weightlifting/opengraph-image.tsx`, which this change does not touch.

## Claude Code antagonistic review

Claude Code ran interactively in read-only plan mode with Opus 5 high effort.
It inspected the uncommitted diff, spec, glossary, ADRs, movement semantics,
Three.js implementation, and tests. Its full raw report is local at
`~/.claude/plans/act-as-an-antagonistic-concurrent-storm.md`.

Disposition of every reported item:

1. **Blocker — geometry merge throws:** proven and fixed by normalizing indexed
   parts; exact production factories now have a runtime smoke test.
2. **Blocker — residents hidden by ordinary scrolling:** proven and fixed by
   removing the synthetic speed floor, requiring real approach movement, and
   adding parked/slow/fast visitor simulations.
3. **High — return is a pop/teleport:** fixed with a calm return opacity
   envelope after cover expires.
4. **High — fades change animal size:** fixed; animal size is constant and
   eligibility/visibility is material opacity.
5. **High — per-frame allocation:** fixed; flock offsets are module constants,
   frame output/scratch is per-instance reusable state, and lamp lookup avoids
   map entry arrays and is skipped in day mode.
6. **High — rendered residents leave Habitat:** fixed; the pure model reserves
   room for all bird offsets and retreats toward clamped cover. Tests now
   sample every rendered bird, not just the flock origin.
7. **Medium — weak tests:** fixed where material. Literal-only determinism was
   removed; tests now simulate parked visitors and honest slow/fast traverses.
8. **Medium — discovery clock starts before reveal:** fixed by establishing the
   wildlife clock when the DOM world phase becomes ready.
9. **Medium — stale ledger:** fixed by this section and the shortcut/issue
   records above.
10. **Medium — domain ADR discovery incomplete:** fixed; domain instructions
    now require both root system ADRs and context-local ADRs, with independent
    numbering documented.
11. **Low — Prettier failures:** fixed with the repository's installed
    formatter; formatting is included in final verification.
12. **Low — module-global mutable frames:** fixed; mutable carriers now belong
    to the mounted wildlife instance.
13. **Low — bat has no X parallax:** accepted. The ADR explicitly permits the
    bat as a global camera-relative sky event; flag for visual review.
14. **Low — animals may be oversized:** partially addressed with the `0.58`
    render scale; exact legibility versus natural size remains a visual call.
15. **Unproven visual risks:** deferred per repo policy and retained below.

A bounded Claude Code re-check then inspected the six corrected invariants. It
reported no remaining proven defect. It independently constructed all seven
geometries and simulated retreat bounds on both camera sides. Its one test-gap
note—retreat bounds were proven only by an ad hoc simulation—was addressed by
adding that scenario to the committed Vitest suite.

## Owner visual revision — models, distance, and flight

The first owner visual pass rejected the procedural ground animals as visibly
bad, could not find the birds, saw moths crossing the floor-lamp shade, and read
the bat as a rigid glide. That feedback supersedes the earlier “no browser
visual inspection” acceptance boundary even though automated browser control
remains prohibited.

Changes made in response:

- Replaced the procedural rabbit with the owner-selected **Rabbit** GLB and the
  procedural quail with the owner-selected **Western bluebird** GLB. Both are
  by Poly by Google under CC BY 3.0; source URLs and license are recorded in
  `public/models/WILDLIFE-ATTRIBUTION.md`.
- Moved both ground Habitats from the prop bay (`z ≈ -1.6`) into the distant
  meadow (`z ≈ -4.5`). The rabbit asset is normalized to about 0.39 world-unit
  height and its source-space negative Y is corrected to terrain contact. Each
  bluebird is about 0.45 world units tall and starts 0.055 units above terrain
  so feet and belly do not disappear into the grass.
- Added a true parabolic rabbit hop on one continuous locomotion clock and a
  smoothly heightened retreat hop. Pitch follows ascent/descent instead of
  bobbing the entire rigid model by a few centimetres.
- Rebuilt moths as three instanced draws—body, left wings, right wings—with
  independent butterfly-like flap hinges. Polar flight guarantees the moths
  never enter a lamp's shade-exclusion radius and expands their flight area.
- Moths now use every registered practical: two around each smaller desk lamp
  and five around the Talks floor lamp. Source coordinates are distinct from
  the meadow pool coordinates, and density/orbit radius follows practical
  size. There are eleven active slots under the twelve-instance cap.
- Increased bat flap excursion, added depth fold to the wings, and replaced
  the straight body path with several incommensurate X/Y/Z waves plus body bob.
  The result remains deterministic and absolute-time based like Butterflies.

New red/green presentation coverage asserts distant Habitat depth, rabbit jump
height, GLB terrain clearance and size, moth exclusion/flight radii, explicit
moth flap excursion, and bat flap plus off-axis wandering.

Revision verification is green: 80 Vitest files / 371 tests passed, full
TypeScript passed, the meadow envelope check passed 30,893 assertions over 148
camera poses, and full-repo ESLint completed with zero errors. Its one warning
is the same unrelated existing unused import in
`src/app/weightlifting/opengraph-image.tsx`. The focused presentation suite was
first run against the rejected implementation and failed all five new behavior
requirements before the fixes; it now passes all seven presentation contracts.

Remaining owner-review calls:

- The supplied models are unanimated source assets; locomotion is authored at
  the whole-model level. The rabbit's source pose is especially well suited to
  jumping, but the bluebird wings do not articulate.
- Model facing is normalized from source `-Z` to resident `+X`. If the first
  live look reveals either model visually traveling backward, flip its local
  Y rotation rather than changing the behavior heading.
- The bluebird is intentionally larger than literal scale to remain legible in
  the deeper meadow. This is a presentation choice, not a claim of realism.
- Browser-based visual inspection is still deferred because repository policy
  forbids browser automation unless Chappy explicitly requests it. A live owner
  look should review rabbit/bluebird facing and scale, terrain contact,
  transparent-material sorting, moth shade clearance around all four practical
  lights, and whether the stronger bat body bob reads as flight rather than a
  roller-coaster path.

## Revision antagonistic review

A second Claude Code Opus/high-effort pass reviewed only the owner-requested
model and motion revision in read-only plan mode. The first sweep found four
high, five medium, and seven low concerns. Each proven issue was reproduced
from the actual transforms or sampled behavior before disposition:

1. **High — moths roll upside-down:** fixed. Full orbit-angle screen roll was
   replaced by a bounded ±0.16-radian bank, now sampled over time and across
   every possible global instance index.
2. **High — rabbit jump snaps at activity boundaries:** fixed. One continuous
   hop clock now spans roam/forage/look/groom, retreat height ramps smoothly,
   and both height and pitch have frame-continuity regressions.
3. **High — later lamps produce frantic moths:** fixed. Global index still
   provides phase separation, but speed, vertical rate, and flap frequency use
   a bounded five-slot variation band. Tests cover orbital and flap rates for
   indices beyond the live maximum.
4. **High — transparent GLBs lose self-depth:** fixed. Model materials are
   transparent with depth writes disabled only during fades, then return to
   opaque depth-writing at full visibility.
5. **Medium — bat is not rare enough:** fixed by reducing each dark-mode flight
   window from 16% to 11% of its 53-second cycle.
6. **Medium — bluebird hops snap on activity changes:** fixed by keeping each
   bird's phase-offset hop clock continuous across activity labels.
7. **Medium — wildlife does not participate in the quality ladder:** accepted
   for this pass. The feature is already low-poly, capped at 12 moth instances,
   draw calls are fixed rather than population-dependent, invisible residents
   stop drawing, and reduced-motion omits the layer. A measured frame-budget
   regression would justify a separate quality-tier implementation.
8. **Low — floor-lamp moth centers clip the shade rim:** fixed. The live 0.34
   inner radius now clears the measured 0.2502 shade rim plus the moth's maximum
   0.0601 half-span; the test shares the fixture's measured radius constant.
9. **Low — desk moths exceed Blog shelf headroom:** fixed by reducing the common
   vertical orbit to 0.03 ± 0.18 while expanding the horizontal desk orbit.
10. **Low — mirrored bat depth fold has the wrong sign:** fixed with opposing Y
    rotations on the mirrored wings.
11. **Low — unused registry helper and gait carrier:** fixed by removing both.
12. **Accepted/unproven:** the camera-relative bat remains an explicit ADR
    decision; contact shadows are intentionally absent; bluebird overscale is
    disclosed and intentional. Monstera occlusion, source-model facing, fog
    legibility, grass occlusion, and the subjective feel of the bat path remain
    live visual-review calls rather than proven code defects.

The bounded post-fix re-check returned PASS on all seven requested invariants:
upright moth bank, continuous rabbit jump, bounded moth dynamics, restored
opaque GLB depth behavior, lamp clearance/headroom, continuous bluebird hop,
and opposing bat-wing depth folds.

## Owner hill and light-cone correction

The next live owner look clarified four presentation decisions that supersede
the earlier grill: the rabbit must never disappear, both ground species belong
halfway up the tall-grass hill rather than merely behind the props, bluebirds
must remain grounded and widely scattered, and moths belong below each shade
inside its light cone rather than orbiting the light source.

The tight repro command was
`yarn test src/app/components/stacks/scene/wildlifePresentation.test.ts`. Before
the fix it deterministically failed six of ten presentation contracts:

- rabbit/bluebird centers were `z = -4.65/-4.35`, outside the actual mid-meadow
  tall-grass band (`z = -8.2…-18.2`);
- the original 60/40 visibility envelope and 8–15-second discovery delay set
  resident opacity to zero by design;
- bluebird offsets covered only 0.54 × 0.39 units and a renderer-only sine hop
  bounced every model;
- moth local Y ranged above and beside the source because the flight shape was
  a horizontal shade-mouth annulus;
- moth flap frequency overlapped the butterflies' 8.2–10.1 Hz band; and
- no dark-material presentation contract existed.

Changes made:

- Rabbit and bluebird Habitat centers moved to `z = -11.5` and `z = -13.2`,
  respectively: the first rolling hill and the deeper portion of its tall-grass
  band. The flock now spans 2.2 × 1.17 units, with generic offset bounds so all
  three birds remain inside the Habitat as they roam.
- Both residents now render immediately and continuously in their eligible
  daytime theme. Startle remains a visible retreat followed by a cooldown; the
  obsolete hiding state, visibility period, and hide-memory vocabulary were
  removed. “Always visible” is interpreted as eligible daytime visibility;
  dark-theme ecological gating and reduced-motion omission remain intact.
- Bluebird vertical hopping was removed. Ground height remains sampled under
  each scattered bird, while yaw variation and pecking posture retain life
  without bouncing.
- Every lamp registration now exposes the actual cone target as well as the
  source. Moth samples occupy a widening volume 0.18–0.52 units down desk-lamp
  cones and 0.32–1.15 units down the larger floor-lamp cone. The renderer builds
  an allocation-free orthonormal basis from source to target, so angled task
  lamps and the vertical floor lamp share the same behavior.
- Moth wing beats now span 6.4–7.0 Hz, below the butterflies. Dark,
  tone-mapped standard materials replace the bright untone-mapped warm wings;
  live lamp intensity still controls every moth instance.

The focused green loop now passes 24/24 tests, including 180 seconds of
continuous resident visibility, mid-hill depth, flock separation, zero bird
hop, below-source cone volume, slower moth flap rate, dark material values, and
live light gating. Browser automation remains prohibited, so the exact amount
of grass occlusion and perceived distance remain owner visual-review calls.

Final project verification after this correction is green: 80 Vitest files /
375 tests, full TypeScript, changed-file formatting, and 56,902 meadow-envelope
assertions over 228 settled/swing plus 360 fast-fling poses all pass. Full-repo
ESLint has zero errors and retains the same unrelated existing unused-import
warning in `src/app/weightlifting/opengraph-image.tsx`.

## Discrete locomotion, controlled illumination, and open-air correction

The next owner review established that continuous low-speed translation still
read as gliding, regardless of activity labels or cosmetic bobbing. It also
clarified that the rabbit belongs in both themes; imported animal scale and fog
needed another reduction; moth motion was finally convincing but lacked stable
light response and crossed nearby geometry.

The deterministic red presentation pass failed six contracts before the
locomotion rewrite: rabbit and bird scale/fog, grounded rabbit motion, fixed
bird homes with frequent pecking, broad moth travel, and butterfly-style moth
presentation. The implementation now makes the following explicit:

- Rabbit scale is another 20% smaller (`0.004032`, 64% of the first GLB pass).
  It holds exact world-space waypoints while grounded, uses a short takeoff and
  landing beat, and translates at constant horizontal velocity during a
  constant-gravity flight. The local model correction was flipped by π so its
  face agrees with the hop direction. Terrain is resampled throughout, and the
  waypoint sequence traverses meaningful hill-height variation.
- Bluebird scale is reduced to `0.2`, making its 0.212-world-unit silhouette
  smaller than the rabbit while honoring the owner's approximate reduction.
  Each of the three birds has
  one immutable scattered home, zero horizontal velocity, its own clock, and
  repeated peck pulses plus look/groom/rest states. The shared flock origin,
  camera-speed retreat, and all whole-model bird locomotion were removed.
- Both GLB material sets now receive exactly half of the scene's ordinary fog
  blend. This interprets “half way between before and now” literally: a shader
  hook multiplies Three's computed fog factor by `0.5`, rather than using an
  arbitrary opacity reduction. The rabbit remains fully eligible at night;
  bluebirds retain their daytime eligibility.
- Owner screenshot review showed that a literal half fog blend made both
  species read as faded blue blobs. The shader now interpolates back toward
  source color by 70% of that wildlife-only fog amount; at maximum fog the
  result is 67.5% source color rather than a 50/50 source/fog mix. It uses only
  interpolation in Three's active fog space, with no luma transform and no
  `0..1` clamp that could clip the desktop HDR path. The rabbit's and birds'
  actual textures therefore identify them; scale, grass, and the remaining fog
  keep them subordinate.
- Moths retain unlit materials so wing rotation cannot modulate brightness.
  Their per-instance color now interpolates from the dark authored color toward
  a restrained lit color using live lamp strength, axial depth, and distance
  from the cone center. Illumination is positional and stable across a flap.
- Expanded moth paths are generated directly in the camera-side half of the
  cone, always at least `0.12` world units from the lamp/pole axis. Position,
  velocity, acceleration, heading, banking, and illumination therefore describe
  the same smooth analytic path—there is no post-sample fold or clamp. Desk
  cones stop at `0.74` units so moth bodies clear the room floor.
- Moths copy the butterflies' two-sine analytic velocity/acceleration model,
  velocity-derived heading, turn-derived bank, flat body orientation, and
  Z-axis wing hinges. Their cone-local area remains larger and their flap band
  remains slower.

Judgment calls and remaining visual checks:

- “Real gravity” is implemented as a ballistic airborne segment. The source
  rabbit has no skeleton, so takeoff compression, leg extension, and landing
  absorption cannot be anatomically animated without a rigged replacement.
- The one-sided analytic cone is a fixture-specific safe volume rather than a
  general-purpose collider. Both radial basis axes are oriented camera-side;
  tilted lamps shift their X wave into that half-plane with matching analytic
  velocity and acceleration. A live owner look remains authoritative for
  unrelated foreground props outside those authored fixture planes.
- The user likes the revised moth motion and appearance. Future changes should
  preserve this path/orientation model and tune only illumination or safe
  volumes unless new feedback proves otherwise.
- Separate follow-up: butterflies and moths should be able to land at a small
  set of authored, collision-safe perches, transition through
  approach/settle/rest/takeoff states, and beat their wings very slowly while
  resting. The same perch/obstacle map should address the butterflies'
  occasional minor clipping. This is intentionally not folded into the current
  correction because it adds a distinct state machine and authored scene data.
- Browser automation remains prohibited by repository policy and was not used.
  Final perceptual acceptance still requires the owner's ordinary live view.

### Antagonistic review of this correction

Claude Code Opus/high-effort returned FAIL with two blockers, four high, and six
medium findings. The full numeric analysis was independently checked and the
material findings were handled as follows:

1. **Blocker — post-sample collision folding froze floor moths:** fixed. The
   fold and its zero-velocity plane were deleted. Local +Z is now an analytic,
   one-sided two-sine path; the renderer orients that radial basis toward world
   +Z. Position, derivatives, heading, banking, and illumination cannot diverge.
2. **Blocker — reduced residents were below median grass:** fixed without
   undoing the owner's requested scale reduction or distant hill placement.
   Two soft sight corridors reduce tuft height to 36% at their cores and feather
   smoothly back to the normal mid-band. Tests build the actual grass buffers
   and require median Habitat grass below each model silhouette.
3. **High — bluebird larger than rabbit / floating:** fixed. Bird scale is
   `0.2` (about 0.212 world units versus the rabbit's 0.252) and foot clearance
   is reduced from `0.055` to `0.006`.
4. **High — 774 KB bird asset / 2048² texture:** fixed. The embedded texture is
   reduced to 256² with glTF Transform; the validated GLB is about 118 KB and a
   regression caps the shipped payload at 150 KB.
5. **High — model-facing corrections differ:** accepted with corrected docs.
   The owner's live observation specifically established that the rabbit was
   backward at `-π/2`, so its correction remains flipped to `+π/2`. The birds do
   not translate. The earlier ledger claim that both source models shared one
   forward convention was unsupported and is superseded.
6. **High — desk moths could penetrate the floor:** fixed. Desk axial reach is
   capped at `0.74`, still materially broader than the original 0.52 volume but
   above the measured floor with a moth half-span included.
7. **Medium — moth work continued in day mode:** fixed. Hidden meshes now skip
   lamp iteration, behavior evaluation, instance transforms/colors, and GPU
   buffer uploads until the dark crossfade becomes visible.
8. **Medium — inert presentation flags and duplicated flight profile:** fixed.
   Unread `hopHeight`, `unlit`, and `butterflyOrientation` flags and their
   tautological assertions were removed. `MOTH_FLIGHT` now aliases the actual
   floor-lamp registry profile used by the renderer.
9. **Medium — half-fog string replacement could silently no-op:** fixed. The
   patch is isolated in a tested helper and emits a development warning if
   Three's shader chunk changes.
10. **Medium/low — peck is a whole-model bow:** accepted constraint. The source
    bluebird GLB is a single unrigged mesh, so head-only pecking is unavailable
    without replacing or rigging the asset. The motion is fixed at the feet and
    intentionally modest; the landing/perch follow-up is the right place to
    reconsider articulated flying-animal assets.
11. **Low — lamp-map iterator allocation / positional moth identity / silent
    future budget truncation:** accepted for the current fixed four-lamp scene.
    These are scale-up risks, not defects in the shipped registry. Revisit if
    lamps become dynamic or the instance budget changes.
12. **Out of current scope — bat flies broadside:** recorded as a future visual
    correction; this review pass was bounded to the owner's rabbit, bird, and
    moth feedback.

The review also called out unrelated fast-fling meadow and skyline changes in
the dirty worktree. Those belong to concurrent owner work and were neither
reverted nor claimed as part of wildlife.

### Final bounded re-review corrections

The first post-fix re-review found three remaining issues in newly added code:

1. **Fog color-space/HDR mismatch:** fixed by replacing luma/chroma restoration
   and its hard clamp with a second source-color interpolation in whatever fog
   space Three is actively using. This deliberately gives the same structural
   operation to both renderer paths without clipping pre-ACES radiance.
2. **Angled-cone lateral clipping:** fixed. Both cone radial bases now face
   world +Z. Where the X basis materially contributes to world depth, an affine
   transform moves that wave into the open half-plane while carrying position,
   velocity, and acceleration together. The near-world-X Blog path keeps its
   full breadth because its Z basis already supplies safe clearance. Tests
   sample representative left/right/vertical cone directions and require every
   combined radial offset to remain camera-side.
3. **Uncoupled grass corridors:** fixed by extracting Habitat coordinates into
   `wildlifeHabitats.ts`, shared by behavior and vegetation. Each corridor now
   derives from its resident home and tests cover the camera-side portion, not
   only median grass at the center.
4. **Post-shift illumination mismatch:** fixed by applying the safe-side affine
   transform inside `mothFrame` before radial illumination, heading, and bank
   consume the sample. The regression independently recomputes illumination
   from rendered X/Z and finite-differences the transformed derivatives.
5. **Hot-loop allocations:** fixed with a caller-owned reusable cone-basis
   carrier. The temporary per-lamp and per-moth return objects were removed.
6. **Unnecessary Blog one-siding:** fixed by requiring the X basis to contribute
   materially to world depth before narrowing it. Blog and the vertical floor
   lamp preserve their broader symmetric X travel.

Final automated verification after these corrections: 80 Vitest files / 383
tests passed; TypeScript passed; ESLint reported zero errors and the one
pre-existing unrelated weightlifting warning; the meadow envelope passed
115,942 assertions with zero failures; and `git diff --check` passed.

Claude Code's final bounded re-check returned **PASS**. Its independent sweep
recomputed illumination from returned X/Y/Z with zero error across both light
profiles, both lateral modes, all 12 indices, and 18,000 samples; finite
differences agreed with analytic derivatives to approximately `5e-10`; all live
desk-lamp paths remained camera-side; the Blog path recovered its breadth; and
the focused review suite, TypeScript, ESLint, and meadow check were green. The
only documentation note was the already-recorded constraint that future lamps
must not aim axially away from the camera unless they add a new safe volume.

## Ground-resident retirement and landing follow-up

The subsequent owner review rejected the rabbit and ground bluebirds at the
conceptual limit of their assets: both Poly models are single unrigged meshes,
so whole-body transforms cannot make their legs articulate. Further fog,
scale, or trajectory tuning would preserve the fake locomotion the owner was
reacting to. The correct resolution was removal, not another presentation
pass.

- Rabbit and ground-bluebird rendering, GLTF preloads, behavior, tests, grass
  sight corridors, Habitat glossary terms, the provisional Habitat ADR, local
  GLBs, and their attribution file were removed.
- Existing sky birds were untouched.
- The bat's world scale changed from `0.72` to `0.36`; its base depth moved from
  `z = -5.2` to `z = -8.4`, with a deeper `0.7` arc, so the working silhouette
  is now a smaller, more distant sky event.
- The interrupted color/fog experiment was removed with the rejected models.
- Full verification after cleanup: 80 Vitest files / 366 tests passed;
  TypeScript passed; ESLint had zero errors and the same unrelated existing
  weightlifting warning; the meadow verifier passed 115,942 assertions; and
  `git diff --check` passed.

The next feature is specified separately in
`docs/ambient-insect-landing-design.md`. Its landing-state implementation is
based on the completed maximum-three-question grill recorded there.

## Insect landing implementation

### Resolved choices

- Butterflies use all seven units; moths use only perches owned by their same
  actively lit practical.
- Butterfly rests are 4–9 seconds; moth rests are 2–6 seconds. Usually one and
  occasionally two butterflies rest, never the full population; at most one
  moth rests per lamp.
- Direct owner interaction—or dragging any prop in the occupied Unit—departs
  immediately. Mouse/trackpad proximity uses
  70 px with 80–120 ms confirmation (100 px during approach); touch proximity
  alone is ignored. Completed cycles use the normal 15–30-second flight
  interval; failed or cancelled claims use a 3–5-second retry backoff.

### Corrections made during implementation

- Rejected authored coordinates as final contact after owner feedback exposed
  floating insects. Perches now resolve against the named owner's visible mesh
  geometry when claimed, store hit-mesh-local contact/normal, and reject misses.
- Removed continuous camera-x attachment. Seven world-resident butterflies now
  have one staggered home range per unit, so fast travel reaches a reserve
  population without dragging the visible insects with the camera.
- Approach and departure duration scale with distance, and both butterflies
  and moths have a hard per-frame speed ceiling to prevent zooming.

### Judgment calls and follow-ups

- A geometry target scores real visible contacts by proximity to the authored
  semantic anchor and agreement with its requested normal. This is systematic
  and non-floating, but a complex prop may still benefit from a named
  mesh/material filter if owner QA prefers a different patch; do not restore
  guessed world coordinates as final contact.
- The reserve population uses seven React butterfly bodies and therefore more
  draw calls than the original three. Keep the behavioral model; convert the
  bodies/wings to three instanced draws if route profiling identifies this as
  material.
- Clearance is an authored resting-pose standoff, not a general swept-volume
  collider. Real contact, camera-side cubic approaches, speed ceilings, and
  outward departures address the visible paths without adding per-frame scene
  collision. If owner QA finds one remaining clip, constrain that semantic
  target's mesh/material/direction rather than adding broad raycasts.
- Project instructions prohibit interactive browser automation unless the
  owner explicitly requests it. Automated code/type/behavior verification is
  run here; final composition/contact placement remains owner visual QA.

### Antagonistic review and verification

Claude Code's first read-only pass found five material issues: failed contact
could raycast every frame; theme changes leaked occupancy; non-local residents
could cross the whole traverse; authored anchors were not participating in
geometry selection and approaches were straight; and an Euler bank write
erased butterfly surface alignment. It also found detached-owner, initial-touch,
departure-direction, roam-clamping, and analytic-heading regressions.

All were corrected. The bounded re-review then caught one introduced moth
orientation branch error; that was corrected by restoring per-moth roam Euler
composition while keeping transition-only speed clamping. Claude Code's final
targeted response was **PASS**, with no remaining material issue across the
original blockers and follow-ups.

Final automated verification: 82 Vitest files / 374 tests passed; TypeScript
passed; ESLint reported zero errors and the same unrelated existing warning in
`src/app/weightlifting/opengraph-image.tsx`; the meadow verifier passed 115,942
assertions with zero failures; and `git diff --check` passed.

## Insect pilot and swept-collision follow-up

This section supersedes the earlier landing notes that describe camera-side
cubics, phase timers, point-only clearance, and per-frame displacement caps.
Owner review correctly found those mechanisms still floated into landings,
zoomed after takeoff, and clipped visible props.

### Proven causes and corrections

- A deterministic reproduction left `1.196` world units of rejoin error, then
  crossed the old `depart → roam` seam at `71.75` units/s despite a nominal
  `1.55` limit. The timer-driven choreography was removed. One shared fixed-step
  pilot now integrates bounded velocity, acceleration, and jerk until spatial
  and velocity tolerances are actually met.
- The old approach began with zero derivative and used a hardcoded world-`+Z`
  Bézier; hover, settle, wing, and orientation formulas reset at boundaries.
  Incoming kinematics and wing phase now remain continuous. Steering brakes
  toward a surface-relative staging point and rejoin matches both position and
  velocity of the live analytic sampler.
- The old resolver proved only that one body point touched its named owner.
  Each species now has a conservative complete-wing envelope. A claim checks
  that footprint against the exact hit mesh, checks siblings separately, and
  sweeps up to eight approach and launch corridors before committing.
- Ordinary motion and every landing movement use continuous swept-sphere tests,
  so thin obstacles between frames cannot be crossed. A look-ahead probe fan
  bends roaming insects upward or laterally; a completely boxed-in insect
  brakes rather than clipping.
- Resting butterflies and moths revalidate the full pose against refreshed Unit
  collision indexes and depart outward if nearby geometry becomes unsafe.

### Shortcuts, ambiguities, and judgment calls

- Collision broad phase uses visible mesh AABBs, a no-allocation segment-AABB
  reject before exact slab tests, and snapshots refreshed at most every 200 ms.
  This is intentionally conservative and predictable, but can reject a
  route through empty space inside an irregular bound. The actual support point
  and normal still come from a rendered triangle.
- The selected support mesh is exempted from its own terminal collision test
  after a footprint-fit check. A large concave support could need a tighter
  authored proxy later; other meshes under the same interaction owner remain
  obstacles.
- The current inspection behavior is a decaying surface-tangent weave. A true
  shallow orbit or two-loop inspection remains a feel-level option, not an
  unimplemented correctness requirement.
- Perch body heading is camera-side by default. An explicit per-Perch tangent is
  the clean extension if owner review wants a distinctive orientation.
- No browser or screenshot automation was used because project instructions
  prohibit it without an explicit request. Exact cadence and composition remain
  owner visual QA.

### Verification added

Focused regressions cover 30/60/120 Hz equivalence, bounded tab-resume work,
speed/acceleration/jerk ceilings, the old long-rest zoom class, obstacle
steering, complete-wing approach checks, adjacent and moving siblings, narrow
supports, midpoint-only thin barriers, blocked departure, collision-index
refresh, reservation cleanup, actual Three mesh bounds, contact resolution, and
owner-transform following. The final aggregate counts and antagonistic-review
disposition are recorded below after the complete verification pass.

### Final recovery hardening and antagonistic disposition

Claude Code's final read-only Opus/high-effort review did not merely inspect
the new tests. It built deterministic and seeded end-to-end repros against the
live collision kernel and pilot. The first passes found three successive
recovery defects that ordinary happy-path tests missed:

1. Requiring every overlapping box to improve independently produced
   contradictory constraints and could freeze an insect after geometry moved
   over it.
2. Replacing those constraints with one merged AABB made a wide shelf plank
   dominate the apparent nearest exit. A real plank plus one tall neighboring
   mesh accepted only downward escape even though the pilot and visible free
   corridor were above it.
3. Using only the nearest face fixed that case but left a smaller static wedge
   when a different prop blocked that face and a slightly farther top face was
   open.

The final rule is independent of mesh or interaction ownership. A recovery
step may use any face within `1.25 ×` the species' wing-envelope radius of the
shallowest exit, must devote at least 25% of its displacement toward that face,
and may never enter a box that did not already contain the insect. The pilot
tries a deterministic upward ring first, then a downward emergency ring only
while its stationary envelope proves it is already penetrated. A short local
peel prevents a distant second prop from vetoing a valid nearby exit. Constant-
depth slides, token vertical drift across a long solid, far-side traversal, and
new-obstacle entry remain rejected.

Those two thresholds are deliberate judgment calls, not hidden physics:

- `1.25 × wing radius` includes the reviewer's last measured open top face at
  `1.10 ×` while remaining local enough to exclude the far side of shelf-scale
  solids.
- `25% directional progress` rejects the reviewer's `0.82`-unit lateral move
  with only `0.066` vertical gain. The first accepted boundary leaves the
  measured slab shell rather than traveling through its interior.

The final bounded Claude Code pass returned **PASS** with no proven material
regression. Its independent results were:

- the exact plank/tall and blocked-nearest-face repros both escaped and reached
  cruise; `depart()` from rest succeeded;
- a seeded 600-case shelf sweep reported zero rise freezes and zero stationary
  off-cruise freezes in every one-, two-, three-, and four-collider bucket;
- four cases still grazing a collider at eight seconds cleared by `8.28 s` and
  all reached cruise rather than remaining embedded;
- 94,065 accepted recovery steps contained zero cases that moved deeper into
  every containing box;
- speed, acceleration, jerk, and frame-displacement checks had zero violations;
  reservation fuzz had zero desynchronizations or leaks; and
- the focused adversarial suite passed `37/37`.

Final repository verification: 85 Vitest files / 403 tests passed; full
TypeScript passed; full-repo ESLint reported zero errors and the same unrelated
existing unused-import warning in
`src/app/weightlifting/opengraph-image.tsx`; the meadow verifier passed 115,942
assertions with zero failures; and `git diff --check` passed. Browser and
screenshot automation were not used, per repository policy. Exact visual
cadence, surface composition, and whether the tangent-plane inspection weave
should become a literal shallow loop remain owner-review calls.

### Owner-visible roaming regression and correction

The preceding adversarial PASS was not sufficient. It proved that synthetic
recovery cases eventually escaped, but owner visual QA immediately exposed a
severe presentation failure: ordinary butterflies repeatedly climbed and dove,
including apparent travel into the meadow. The review optimized recovery
liveness without testing the authored cruise lanes against the real shelf
heights as a motion-composition invariant.

A deterministic lower-shelf reproduction found two causes:

1. Penetration recovery was approved globally. Progress out of one overlapping
   prop incorrectly forgave a step that moved deeper into a different collider,
   such as the lower shelf. Recovery now requires qualifying outward progress
   for every intersected collider; a step cannot escape one bound by worsening
   another.
2. Reactive avoidance fundamentally fought the existing butterfly paths. Those
   paths intentionally graze coarse shelf/prop AABBs; avoidance pushed away on
   one frame and the analytic sampler pulled back on the next, producing the
   visible vertical yo-yo. Ordinary `roam` now copies the proven analytic
   position, velocity, and acceleration exactly. Swept collision and obstacle
   steering remain active for approach, touchdown, launch, and rejoin.

The Three scene adapter also treats the meadow base as a hard floor for every
integrated landing-transition sweep, including penetration recovery. The full
wing sphere cannot select a below-ground route even when downward motion would
otherwise exit a prop.

This is a deliberate tradeoff: rare incidental clipping from the original
analytic roam can still occur, as it did before landing work. Removing that
without reintroducing reactive oscillation requires a separate persistent
detour planner or re-authored collision-free cruise lanes; it is not hidden as
completed work. Landing transitions remain collision checked. New regressions
cover the exact authored-roam contract, overlapping shelf/prop escape, and the
meadow floor. Repository policy still prohibits browser/screenshot automation,
so the correction is deterministically verified and awaits the owner's direct
visual confirmation.

Verification after the correction: 85 Vitest files / 406 tests passed; full
TypeScript passed; targeted insect ESLint passed; full `src` ESLint reported
zero errors and the same unrelated weightlifting unused-import warning; the
meadow verifier passed 115,942 assertions with zero failures; and
`git diff --check` passed.

### Sprite raycast runtime regression

Owner visual QA then exposed a separate resolver crash:
`THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against
sprites`, followed by a null-camera `matrixWorld` access. The Perch resolver
recursively raycast an interaction owner's entire object tree and filtered for
Mesh hits only afterward, so decorative Sprite descendants executed their
camera-dependent billboard raycast before they could be rejected.

The resolver now collects nested `THREE.Mesh` surfaces first and raycasts that
surface list non-recursively. Sprites, lines, helpers, and other nonphysical
descendants cannot participate in contact or require a camera; nested GLTF
meshes remain eligible. A focused regression constructs one owner with both a
valid Mesh and a large Sprite and asserts successful contact with no Sprite
camera error.

Verification after the resolver correction: 85 Vitest files / 407 tests
passed; full TypeScript passed; targeted resolver ESLint passed; full `src`
ESLint retained only the unrelated weightlifting unused-import warning; and
`git diff --check` passed.

## Natural Butterfly Recovery and Reliable Landing — gated recovery pass

Implementation resumed from the owner-reviewed recovery plan on 2026-08-17.
GitHub issues #16, #17, and #18 were closed before code changes; this workflow
uses the local inventory, ADR, glossary, and this ledger instead of issues.

### Gate 1 — Perch diagnostics

- Added one renderer-agnostic `InsectPerchDiagnostic` evaluator with stable
  rejection codes. Runtime reservation, tests, and the development overlay all
  consume the same owner/contact/eligibility/occupancy/envelope/revision verdict.
- Contact resolution now returns a structured result with exact owner/contact
  failure. Its candidate list contains visible triangle-bearing Meshes only;
  Sprites never reach `Raycaster`.
- Collision snapshots still refresh on a short timer, but a revision advances
  only when a box id or exact world bound changes. Unchanged polls preserve the
  prior snapshot object.
- The development HUD has a hover-expandable Perch panel with active/all shelf
  filters, active valid counts, envelopes/routes, pause-automatic-landings, and
  a force button. Red anchors, status contacts, anchor lines, normals, optional
  envelopes, and plan routes live beside `SceneContent`, never below a
  collision-indexed Unit, and all opt out of raycasts. The Scene and DOM HUD
  mounts are development-only.

Judgment call: the 3D helpers deliberately cannot own hover events because
diagnostic geometry must not participate in scene raycasting. Hover metadata
therefore lives on the HUD's Perch rows, which show id, owner, occupant, stable
code, and exact reason while highlighting the same diagnostic entry.

### Gate 2 — collision-compiled roaming

- Removed the shelf-grazing two-sine position sampler from butterfly runtime.
  Three authored Unit-local loops now stay in open meadow air. Dense Catmull–Rom
  samples compile into an arc-length lookup only after the full flight sphere,
  ground clearance, and bob/bank margin sweep clear the live Unit index.
- Seven butterflies remain world residents, one home Unit each. Unit pose—not
  camera position—places each route, and the loop breadth overlaps neighboring
  ranges.
- Collision revision changes recompile alternates. A retained loop keeps its
  phase; an invalidated loop connects to a valid alternate with a swept,
  velocity-matched Hermite detour. With no valid detour, a bounded route state
  decelerates instead of enabling reactive vertical steering.
- The route owns position, velocity, and acceleration. Continuous wing phase,
  per-butterfly flap frequency, descent glide amplitude, tiny phase-shared body
  lift, velocity heading, and acceleration-derived bank are presentation only.

Rejected again: frame-by-frame vertical obstacle steering. It is a feedback
controller fighting a moving authored target and was the proven cause of the
owner-visible yo-yo. A route must compile or it cannot become ordinary roam.

### Gate 3 — complete Landing Plans

- The pure pilot now owns exactly `approach → hover → touchdown → rest → launch
→ rejoin`; Safe Routes remain outside it. A planner builds curved approach,
  one shallow tangent-plane inspection arc, normal touchdown, complete resting
  pose, outward launch, and frozen Safe Route rejoin before occupancy changes.
- Perches accept an explicit tangent plus bounded contact-distance and normal
  tolerances. The support exception is split into a bounded contact region;
  the rest of the same mesh remains collision-active.
- The Safe Route clock freezes throughout engagement. Rejoin uses a bounded
  Hermite boundary controller to meet the frozen point and its recorded
  velocity before ordinary route sampling resumes. Fixed-step speed,
  acceleration, jerk, and wing phase limits remain active on transition frames.
- Butterfly selection no longer requires a lucky close pass. Any eligible
  active/neighboring resident can build the normal plan; the force button uses
  that same selection, reservation, planner, collision, and stable rejection
  path.
- Pointer disturbance now requires recent non-touch pointer activity and the
  existing 80–120 ms proximity confirmation. Owner hover/drag and pointer
  departure use the collision-checked outward launch path from every engaged
  phase. A dormant cursor cannot suppress approaches.
- Moth cone cruise, night/lamp response, visibility, and slow flap character
  remain unchanged. Moths share only the Landing Plan machinery and retain the
  lit Lamp Perch restriction.

### Shortcuts, ambiguities, and deferred owner work

- Coarse world-space Mesh AABBs remain the planning collision representation.
  This intentionally prefers false rejection to triangle-level clipping.
- The route compiler's three production loops are shared shapes transformed by
  each Unit pose; they are distinct alternates, not 21 separately hand-drawn
  loops. Per-butterfly phase, speed, color, and flap keep the population from
  reading as synchronized.
- Headless verification cannot truthfully certify composition. Repository
  policy prohibits browser/screenshots unless Chappy explicitly requests them,
  so the seven-shelf anchor/contact correction gate, route feel review, and
  forced/natural landing review remain explicit owner visual sign-offs. The HUD
  exists to make those reviews deterministic; no “all shelves approved” claim
  is fabricated here.

### Automated verification added in this pass

- mixed Mesh/Sprite contact, structured bad contact, unchanged/stale collision
  revisions, narrow supports, siblings, blocked route midpoints, ground
  penetration, and bounded same-mesh support contact;
- every production Safe Route traced with the complete butterfly envelope and
  bob/bank margin against representative shelf/prop bounds;
- arc-length speed, blocked route rejection, swept velocity-matched detours,
  and full Landing Cycles at 30/60/120 Hz with speed/acceleration/jerk,
  reservation cleanup, explicit hover, and continuous wing phase;
- deterministic planning from all seven resident home ranges without an
  acquisition-distance flyby; and
- unlit/species/occupancy/stale/paused diagnostic codes, production diagnostic
  omission, and recent-pointer confirmation semantics.

### Owner feedback and adversarial corrections

The first owner pass immediately rejected the Perch authoring result: Talks
showed only `1/5` ready, and About/Books subsequently showed zero. That was a
real gate failure, not a reason to weaken the envelope.

- The old HUD conflated occupied/unlit sites with bad geometry. It now opens a
  click-controlled portal drawer above navigation and separates `ready`,
  temporarily `waiting`, and genuinely `rejected`, with exact per-row codes and
  counted reasons.
- Books' two bookend owner IDs never existed in the interaction registry. Its
  two row prefixes selected the first matching spine rather than the spine near
  the anchor, and virtually every upright spine/bookend was physically too
  narrow for the `0.10 × 0.12` resting footprint. About also relied on thin or
  compound decorative owners.
- The real broad shelf RoundedBoxes are now stable, non-interactive Perch
  owners. About and Books use authored clear ledge contacts on those exact
  structural meshes; the resolver probes the authored x/z before its coarse
  fallback lattice. Full envelope, sibling, route, and bounded support-region
  checks remain unchanged.
- The owner also rejected one visible butterfly per shelf as too sparse.
  Population is now three staggered residents per Unit (21 total), while the
  global landed population remains usually one and occasionally two.
- The next owner pass correctly rejected the broad shelf-ledger replacements as
  compositionally meaningless. The catalog now uses recognizable object tops:
  the AI Collective mark, featured-book page blocks including _Life 3.0_, a
  barbell plate, Systems/Talks photograph crowns, trophy, notebook, phone, Mac,
  writing paper, open book, tea rim, microphone, and harmonica. The AIC mark
  and shared desk-frame backing retain their original thin silhouettes; their
  real crown triangles are sufficient grip contacts.
- That review exposed a wrong safety premise: an open wingspan needs collision
  clearance, but does not need shelf-width support. The resting kernel now
  requires a resolved feet/thorax triangle contact and an oriented folded-wing
  volume clear of other meshes. Touchdown stays folded; launch first lifts
  along the surface normal while folded, then opens into the full swept flight
  envelope after clearing the object. Visual wing fold is rate-limited and
  preserves the continuous oscillator phase.
- The apparent frozen red butterflies were butterfly-scale diagnostic spheres.
  Scene helpers are now hidden by default, hover reveals one site, and the tiny
  diamond/contact/normal markers have an explicit legend. A separate real
  motion freeze was also reproduced: animated collision revisions restarted a
  startup Hermite detour every cache tick. Clear untravelled detour suffixes are
  now re-swept and retained, allowing residents to reach normal cruise.
- A later About-only headless trace used the checked-in AI Collective SVG,
  actual globe and desk-lamp GLBs, production transforms/interaction owners,
  live catalog, and the shared diagnostic seam for a complete globe rotation.
  Initially the AI Collective crown was always `support-too-narrow`; the
  low-poly globe alternated between `none` and `resting-pose-blocked` as its
  ball turned inside the ring. Fixed transforms removed the globe alternation,
  ruling out timed cache refresh itself. The portrait and lit Lamp Perch stayed
  valid. The owner rejected treating decorative crown width as a
  platform-width requirement: the contact is feet/thorax, while safety belongs
  to the real triangle plus folded-pose clearance. After that shared model
  correction, the trace proved two remaining globe defects: the fallback probe
  could replace an acceptable authored crown contact with a lower ball hit, and
  one rotating whole-ball AABB intermittently swept through the fixed crown
  pose. The resolver now retains an acceptable exact authored hit; the visually
  identical ball is partitioned into eight same-material octants so collision
  boxes follow the curved surface. Across 48 timed refreshes spanning a full
  idle rotation, all four About sites now report only `none`. The harness is
  retained without replacing the intentional AIC/globe sites.
- A deterministic shared-world regression then reproduced that exact premise
  on the original 1.9 cm AI Collective and 1.6 cm portrait-frame edges: both
  resolved real upward-facing triangles and failed only at the redundant
  `support-too-narrow` AABB gate. That platform-width gate and its unused
  contact-patch dimensions were removed from diagnostics, reservation, and
  terminal rechecks. Support-mesh identity, the complete folded envelope,
  sibling collisions, the bounded contact exception, and the meadow ground
  floor remain fail-closed.
- A real Books fixture then reproduced the HUD's forced `approach-blocked` on
  the Life 3.0 page-block Perch through the production Safe Route, current
  catalog, ShelfUnit structure, contact resolver, planner, and reservation
  seam. All eight original approach candidates stopped on the intended book
  support at segments 23–26: the Landing Plan had added the pilot's 4.5 cm
  fallback wander amplitude to an already complete 8 cm wing envelope, even
  though compiled route following does not apply that wander. Sweeping the
  actual wing envelope admitted a clear approach without weakening collision
  checks. The next exact blocker was the top plank above the lower shelf: all
  eight steep launch candidates hit it after the folded normal-axis lift. The
  planner now retains those preferred open-air launches and also tries a
  shallow outward inclination under constrained headroom. The complete
  Life 3.0 plan now compiles and reserves; shelf, support, sibling, ground, and
  full-envelope sweeps remain active.
- The Force control also inherited the natural cadence's probabilistic limit
  of one engaged butterfly, so it could exit before selection with `Landing
population limit is 1`. Natural attempts still use the one/occasionally-two
  cadence; Force now uses the existing hard cap of two and continues through
  the same eligibility, reservation, planning, and collision rules.
- The same review exposed stale authored hints rejecting visibly correct
  triangles on exact owners. Exact `ownerId` contacts now treat an unspecified
  anchor distance as advisory while still selecting the nearest
  normal-matching visible triangle. Prefix ownership remains distance-bounded
  to prevent sibling drift, and an explicit `contactDistanceTolerance` remains
  strict for both ownership modes. Regression coverage retains distance and
  normal-mismatch rejection for those genuinely ambiguous or constrained
  contacts.
- The Life 3.0 overlay then proved that advisory resolution alone concealed a
  bad authored marker: Books Perches were static Unit coordinates while the
  featured row recomposes whenever its source count or order changes. The four
  semantic page-top anchors now project through the exact live featured layout
  and page-block transform used by `UnitBooks`; the retained headless Books
  fixture requires the authored marker, resolved triangle, and rendered page
  top to coincide before the diagnostic may report `none`.
- The owner also rejected the restored cruise as obvious circles. Route
  instrumentation confirmed the production oval/inner loops had zero turn
  reversals, one dominant turn direction for 100% of each loop, and one
  loop-long bank run. The three shared routes are now smooth braided,
  switchback, and clover-like wanders with 4–8 turn reversals, nonlocal passes,
  meaningful depth/vertical variation, and roughly 20–23-second loop periods.
  Their arc-length speed and full-envelope compilation remain unchanged;
  30/60/120 Hz tests retain the `2.8` acceleration and `18` jerk limits.

The antagonistic Claude Code pass reproduced a shared-object translation bug
in moving Landing Plans before it was stopped for excessive review latency.
Parallel adversarial follow-up then proved and fixed: runtime steering that did
not follow every validated phase waypoint; stale-revision reservation after a
forced collision rebuild; lost exact reservation/force failure codes; route
overlays omitted from the shared diagnostic verdict; and Safe Route recovery
using wall time/landed position instead of frozen route time/state.

Final repository-wide results after the last authoring correction:

- Vitest: 93 files, 459 tests passed;
- TypeScript: `yarn tsc --noEmit` passed;
- meadow invariant checker: 115,942 assertions, zero failures;
- Prettier and `git diff --check`: passed; and
- ESLint: zero errors, with the unrelated existing unused `wlExercises`
  warning in `src/app/weightlifting/opengraph-image.tsx`.

Remaining composition approval is owner-visible rather than fabricated by
headless automation.
