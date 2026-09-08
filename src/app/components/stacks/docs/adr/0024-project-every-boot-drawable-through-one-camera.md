# 0024 — Project every boot drawable through one camera

Status: accepted
Date: 2026-09-07

## Context

The loading screen is an SVG of the About unit that the boot stage lays over
the live shelf, then the room takes over at the same pose. Two things had
drifted since the stage was written on 2026-08-23.

The stage's rest pose had fallen behind the camera's. PR #51 gave desktop
stops a lateral truck beside the reading dock, and the About stop carries the
share of it that its scroll shift lerps toward unit 1; the depth offsets
(raised eye, authored pitch) were later put behind a console toggle that
ships off. Neither reached the stage or its reference test, which built the
composition without the rail and the depth offsets on. At 2056×1290 the live
origin sat 46 px left and 7 px above the placed bookcase.

The drawables inside the SVG each projected themselves their own way. The
supports and the reading fan scaled by camera distance about the unit's
origin as if the eye stood at x = 0 looking level; the standing frames were
pure orthographic; the planks, the landmark anchors and the floor props had
no depth at all. The live camera stands 0.7 to 1.0 units right of the unit's
origin, 0.25 above the top plank, looks down 3.15°, and the unit is yawed
0.1 rad. So the lower plank tilts about 20 px across a 2056-wide window, the
dumbbell on the grass, 0.62 units nearer than the shelf plane, renders a
tenth larger than its silhouette, and the two golf balls beside it had no
boot counterpart.

## Decision

One projector, `scene/aboutBootPerspective.ts`, and one rule: every drawable
is placed by projecting its 3D unit-local anchor through the About rest
camera, and scaled by the anchor's depth ratio. Shapes drawn from 3D corners
(planks, supports) project each corner; flat glyphs (generated silhouettes,
frame elevations) hang off their projected anchor at its scale. The
composition carries each landmark's depth next to its x. With the eye at the
origin looking level and no yaw the projector reduces exactly to the old
`cameraZ / (cameraZ - z)`, so nothing that was right got worse.

The camera is the canonical desktop rest pose (1440×900, rail fallback). On
desktop only the eye's x moves with the viewport, so the pre-paint script
publishes `--stacks-boot-eye-shift`, the live eye's distance from the
canonical one in SVG units, and each drawable's CSS transform slides by that
times (1 - its depth ratio). That is the projector's own formula with only
the eye's x changed, so placement is exact at every width, not only at 1440.

The stage mirrors the truck and the shipped depth default, and its reference
test now builds the composition with the rail and the depth at that default,
so the next such drift fails there rather than on the first live frame.

Every projected number is rounded to a thousandth of an SVG unit before it
reaches markup. Node and Chrome disagree in the last bit of sin, cos, hypot
and atan2 often enough that the first cut failed hydration on a dozen
attributes.

## Consequences

Measured against `__stacks.project` at the reveal, unit origin and plane
scale within 0.5 px at both 1440×900 and 2056×1290. Floor props and golf
balls within 1 px. Plank corners within 3 px at 2056 wide, which is the
one-share parallax on a polygon spanning depths; the far end of a plank and
the near end want slightly different shares. The vertical residual of about
1 px is the camera's idle bob.

The second pass, the same day, took the rule inside the drawables. The
generated silhouettes are traced through the rest camera from each model's
anchor (`aboutBootSilhouettePoint`; the globe stays orthographic because its
map is drawn onto the ball orthographically), so the dumbbell's plates are
seen from the eye's real height and side and the headset shows its top. The
reading fan's corners go through the projector (`bootReadingProjector`), so
the books open the way the live ones do. The planks paint before the
landmarks: a thing standing mid-plank hides the surface behind its feet, not
the other way round, which is what made everything look shelved behind the
plank. Floor props are solid; at the silhouettes' 0.9 the dumbbell read as a
second layer over the plank and the foot. The Vision Pro is lit as the room
lights it (near-white band and seal, a greyer frame, black glass, and a
fabric-toned base between the traced parts), with the glass dilated one
pixel instead of six.

The standing frames keep their own orthographic elevations, placed and
scaled by the projector. Their remaining error is the tilt-back
foreshortening a flat elevation cannot show, one to two pixels on a frame
leaning 30°. Routing their corners through the projector is the obvious next
step if it ever shows.

A camera-traced profile is what the eye sees, not the footprint on the
plank, so the shelf-gap audits allow two millimetres of apparent overlap
where the headset's band reaches under the role icons; the two clear each
other in depth and the boot paints the icons in front.

Narrow viewports stand the camera farther back, so their depth ratios are
milder than the canonical desktop ones; a phone's dumbbell is about 2 px
larger here than live.

Anything new on the boot goes through `bootPlacementStyle` or
`bootParallaxStyle` in `dom/bootVignette.ts`. A drawable with an attribute
`transform` or an unprojected position is the old inconsistency coming back.
