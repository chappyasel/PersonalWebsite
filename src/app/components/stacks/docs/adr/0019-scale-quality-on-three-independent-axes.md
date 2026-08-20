# Scale quality on three independent axes

Adaptive quality will move three independent axes rather than one ladder:
render resolution, postprocessing effects, and scene content. Each carries its
own time constant, from a resolution step that adjusts in seconds to a sticky
content tier that changes rarely. The controller grades every window against an
absolute sixtieth of a second and measures main-thread cost beside the frame
interval, so it can tell a saturated CPU from a saturated GPU and move the axis
that is actually constrained.

Content reduction must preserve authored composition. Prop placement, camera
framing, palette, and meadow coverage stay identical at every tier; only
per-instance triangles, terrain tessellation, shader complexity, and offscreen
wildlife residency change. Resolution scales pre-emptively when travel begins,
since travel is bounded, known in advance, and hidden by motion. Content never
changes mid-travel. The lowest tier is a triangle and pixel budget a test
enforces, not a set of knob positions.

This replaces a policy that could only trade pixels, and that measured 61
percent movement in framebuffer pixels against 4.7 percent in geometry. Phones
were left degraded and still slow, because their framebuffer is already small
and their constraint is geometry and main-thread work. It amends 0017, where
effects were reduced first: reducing effects on a device short of triangles
spends the wrong resource.
