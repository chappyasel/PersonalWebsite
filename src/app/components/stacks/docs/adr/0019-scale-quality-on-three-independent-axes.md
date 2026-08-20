# Scale quality on three independent axes

Adaptive quality moves three independent axes rather than a profile ladder:
render resolution, postprocessing effects, and scene content. Automatic mode
builds the render plan directly from that triple under Showcase's resolution
ceiling. The five named profiles remain manual presets; they are not a second
automatic controller.

The controller grades a rolling two-second window against an absolute
16.67-millisecond target and records main-thread submission cost beside frame
interval. It first asks whether the scene is missing its target: at least eight
percent dropped frames or a 95th-percentile interval above 1.25 times budget.
Only a pressured window is classified as CPU-bound or GPU-bound. This guard is
intentional—a 12-millisecond main-thread cost that still delivers 60 frames per
second is busy, not a reason to degrade the scene. Under pressure, main-thread
cost above 70 percent of budget is CPU-bound; cost below 40 percent with a GPU
or interval term above 1.25 times budget is GPU-bound. Headroom requires cost
below half budget and fewer than two percent dropped frames. Everything else
holds.

Pressure moves the lever that can relieve it. CPU pressure moves content
directly and leaves resolution and effects alone. GPU pressure moves resolution
to its floor, then effects, and leaves content alone. Resolution has a
1.5-second dwell, effects fall after five sustained seconds and rise after 15,
and content falls after ten sustained seconds and rises after 60. A change on
one axis blocks another until a later window demonstrates improvement, the
block expires, or pressure is severe.

Content reduction must preserve authored composition. Prop placement, camera
framing, palette, and meadow coverage stay identical at every tier; only
per-instance triangles, terrain tessellation, shader complexity, and offscreen
wildlife residency change. Local scene photographs stay on role-sized textures;
automatic master decoding, duplicate photo meshes, and per-photo frame
subscribers are not quality levers.

Within a content tier, meadow topology stays fixed. Wind and local wakes use a
linear, root-planted lean; they do not continuously reshape the tuft with a
quadratic height bend. An abrupt tuft silhouette change must therefore
coincide with a `geo` tier transition in the development HUD, never an
animation frame. The resolved content tier also owns offscreen-wildlife
suspension; inheriting that flag from the Showcase profile would spend the
visible geometry lever without applying the corresponding CPU reduction.

Resolution drops two steps when travel begins, because travel is bounded,
known in advance, and hidden by motion. After a complete settled validation
window, the controller repays the borrowed resolution one step per dwell and
never above the remembered step. GPU pressure cancels repayment; CPU pressure
does not, because fewer pixels cannot relieve main-thread work. Effects may
fall during travel. Content never changes mid-travel, but one CPU-driven
request may be deferred to the first valid settled window. Three consecutive
over-budget travels permit one content step at rest.

Always-correct CPU reductions apply at every tier. Coarse touch pointer moves
skip the scene-wide hover raycast while pointer-down activation remains intact.
An explicit static allowlist freezes the shelf structures and meadow geometry.
The moving sky dome and its hit targets disable automatic updates but update
their matrices explicitly. Interactive panels, grabbable props, physics roots,
and animated objects are excluded from the frozen subtree. An opt-in
development assertion reports any allowlisted transform that changes.

The compact HUD remains visible by default in development. Expensive
diagnostics are opt-in: opening the console with `D`, using `?debug=1`, or
running the performance harness mounts the trace subscribers, matrix timer,
static-world assertion, insect perch sweep, and physics overlay. Their timing
remains visible in the HUD and trace, but their frames are not evidence for the
automatic controller. Native Placard blur remains the shipped background
surface on every pointer type and is outside the quality axes.

Learned state stores the axis triple in versioned local storage and restores it
as a starting point, never a floor or ceiling. Cold-start device signals may
bias that starting point downward, while measurement remains free to move in
either direction. Sampling begins only after reveal, shader precompile, and a
settled validation window.

This replaces a policy that could only trade pixels, and that measured 61
percent movement in framebuffer pixels against 4.7 percent in geometry. Phones
were left degraded and still slow, because their framebuffer is already small
and their constraint is geometry and main-thread work. It amends 0017, where
effects were reduced first: reducing effects on a device short of triangles
spends the wrong resource.
