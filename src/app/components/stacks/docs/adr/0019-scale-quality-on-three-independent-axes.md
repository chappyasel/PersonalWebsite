# Scale quality on three independent axes

Adaptive quality moves three independent axes rather than a profile ladder:
render resolution, postprocessing effects, and scene content. Automatic mode
builds the render plan directly from that triple under Showcase's resolution
ceiling. The five named profiles remain manual presets; they are not a second
automatic controller.

The controller grades a rolling two-second window against an absolute
16.67-millisecond target and records main-thread submission cost beside frame
interval. Medians establish sustained pressure: a median frame above 1.05
times budget is continuously missing the target, rather than paying for one
long task in the tail. Under sustained pressure, median main-thread cost above
70 percent of budget is CPU-bound; cost below 40 percent is GPU-bound when no
timer query is available. A timer query, when available, replaces that GPU
inference and must itself exceed 1.25 times budget.

The 95th-percentile interval and dropped-frame ratio still protect recovery. A
p95 above 1.25 times budget or at least eight percent dropped frames prevents
an upgrade, but a tail spike alone does not rebuild geometry or resize the
framebuffer. This distinction keeps a steady 50–55 FPS device actionable while
an otherwise comfortable scene with an isolated long task holds. Headroom
requires p95 main-thread cost below half budget, fewer than two percent dropped
frames, and neither sustained nor tail pressure. Everything else holds.

Pressure moves the lever that can relieve it. CPU pressure moves content
directly and leaves resolution and effects alone. Measured GPU pressure moves
resolution to its floor, then effects, and leaves content alone. When a GPU
timer is unavailable, as on Safari, the controller treats low CPU cost plus
late frames as an inference: after two resolution cuts fail to improve p95 or
dropped frames, it preserves the remaining pixels and tries effects instead.
When median cadence is continuously late, a cut only counts as helpful if p50
improves by at least ten percent or returns to the accepted cadence. A smaller
p95 tail by itself cannot justify continuing to blur a device that remains at
the same sustained frame rate.
Resolution has a 1.5-second dwell, effects fall after five sustained seconds
and rise after 15, and content falls after ten sustained seconds and rises
after 60. A resolution step that restores headroom is held for 20 seconds
before Auto retries the known-failing step above it; otherwise a boundary
device alternates between the two steps and reallocates its drawing buffer
indefinitely. An effects tier
removed under pressure is also held for 60 seconds before retry, so spatial
passes such as depth of field cannot cycle on the shorter fall/rise timers. A
change on one axis blocks another until a later window demonstrates
improvement, the block expires, or pressure is severe.

All supported platforms participate in live resolution adaptation. The former
iOS lock was removed after manual production testing across several DPR steps
showed clean framebuffer transitions. The automatic ceiling remains bounded by
native DPR, the active profile cap, and the profile's viewport-scaled pixel
budget. Runtime evidence chooses a rung inside that ceiling. The diagnostics
ceiling remains a manual inspection override: Auto never assigns it because it
deliberately replaces those safeguards.

Content reduction must preserve authored composition. Prop placement, camera
framing, palette, and meadow coverage stay identical at every tier; only
per-instance triangles, terrain tessellation, shader complexity, and offscreen
wildlife residency change. Local scene photographs stay on role-sized textures;
automatic master decoding, duplicate photo meshes, and per-photo frame
subscribers are not quality levers.

Small identity graphics may rebudget their own marks against the renderer's
actual physical-pixel count. The Coordination globe keeps its full-resolution
presentation above one megapixel. Below that point it raises the resting web's
contrast, gives nodes a larger sample footprint, narrows the dominant reveal
chord, and reduces event-horizon dither cell size. This changes legibility, not
composition or content count, and reverses continuously when resolution rises.

All role-sized shelf visuals mount before interaction by default. Once the
default loading manager is quiet and Suspense has committed its children, one
1x1 offscreen draw initializes their geometry and texture resources while the
boot screen is still present. The visible output-color shader variant compiles
first, the upload draw freezes shadow-map updates, and every renderer and scene
state touched by the warm-up is restored. Later theme or effects changes only
compile their shader variant; they do not redraw the complete graph. Scene
Diagnostics exposes `Preload all shelf visuals` as a live A/B switch, and its
reload default remains the resolved production policy.

Changing which real point and spot lights are visible changes Three.js's
program key. Device traces show that first-travel shader creation can block an
iPhone frame for seconds even after texture and geometry residency is stable.
The production policy retains the active-unit-plus-neighbors lighting policy
while filling missing light slots with zero-intensity lights up to the largest
nearby neighborhood. This holds one bounded program shape without exposing
every real light or compiling the entire material graph against every
neighborhood. A fixed-profile iPhone trace reduced travel p95 from 2,099 ms to
66 ms and the maximum frame from 3,588 ms to 212 ms, without a perceptible boot
regression. `Stabilize nearby-light shader count` remains available as a live
diagnostic rollback.

Within a content tier, meadow topology stays fixed. Wind and local wakes use a
linear, root-planted lean; they do not continuously reshape the tuft with a
quadratic height bend. An abrupt tuft silhouette change must therefore
coincide with a `geo` tier transition in the development HUD, never an
animation frame. The resolved content tier also owns offscreen-wildlife
suspension; inheriting that flag from the Showcase profile would spend the
visible geometry lever without applying the corresponding CPU reduction.

Resolution borrows two steps at travel start only after the device has shown
sustained GPU pressure. An unknown or CPU-bound device keeps its framebuffer:
fewer pixels cannot relieve main-thread work, and resizing the backing store
can expose the page for a frame. After a complete settled validation window,
the controller repays an actual borrow one step per dwell and never above the
remembered step. GPU pressure cancels repayment; CPU pressure does not.
Effects may fall during travel. Content never changes mid-travel, but one
CPU-driven request may be deferred to the first valid settled window. Three
consecutive over-budget travels permit one content step at rest.

Always-correct CPU reductions apply at every tier. Coarse touch pointer moves
skip the scene-wide hover raycast while pointer-down activation remains intact.
An explicit static allowlist freezes the shelf structures and meadow geometry.
The moving sky dome and its hit targets disable automatic updates but update
their matrices explicitly. Interactive panels, grabbable props, physics roots,
and animated objects are excluded from the frozen subtree. An opt-in
development assertion reports any allowlisted transform that changes.

The compact HUD remains visible by default in development. Expensive
diagnostics are opt-in: opening the console with `H`, using `?debug=1`, or
running the performance harness mounts the trace subscribers, matrix timer,
static-world assertion, insect perch sweep, and physics overlay. Their timing
remains visible in the HUD and trace, but their frames are not evidence for the
automatic controller. A production visit may use `?hud=1` to load only the
compact monitor and its read-only scene hooks; it mounts none of those probes
and leaves automatic adaptation active. That opt-in also retains four minutes
of quality sample windows and bounded focus or page-lifecycle events for the
downloadable support log. Recording writes to a module-local bounded list, not
React state, and remains disabled on ordinary production visits. Native
Placard blur remains the shipped background surface on every pointer type and
is outside the quality axes.

Depth of field separates cost from appearance. Its resolution scale controls
the effect buffer and remains part of the effects budget; it is not a blur
amount. Bokeh strength follows the viewport presentation profile because the
portrait camera and tighter composition make the same world-space blur read
more strongly. The focal target sits at the middle of the shelf depth. A
1.05-unit zero-blur radius covers the complete shelf volume before the normal
background falloff begins; thin prop detail never enters the bokeh ramp merely
because it sits toward the front or rear of a plank. The standard authored
strength resolves to 1.15 in portrait,
1.4 in short landscape, and 1.9 in wide presentation at the 2x reference DPR
where the look was approved. The renderer multiplies that value by the current
DPR divided by two because the postprocessing kernel is measured in physical
framebuffer texels. This keeps its CSS-pixel footprint constant across the
resolution ladder, including supersampled social captures. The HUD reports the
actual shader value as `DoF q…/b…`. Scene Diagnostics can temporarily multiply
the resolved bokeh strength from 0.25x to 3x or replace the effect-buffer scale
from 0.25x to 1x. These controls reset on reload and never change the authored
profile table.

The composer retains a stencil attachment for scene-local visibility rules.
The Coordination event horizon writes one bit only where it passes ordinary
scene depth; its internal graph tests that bit while ignoring the horizon's own
depth. The graph can therefore remain visible through the black surface
without painting over shelves, grass, or other geometry in front of it.
Its approved shockwave may also interrupt the shared sky material briefly.
One scalar clock drives that uniform, the image-based environment intensity,
the directional key, the hemisphere fill, and the meadow's analytic grass,
terrain, and flower materials, so exposure cannot disagree between the vault,
room, and custom-lit field. The response uses no render target or texture
sample; reduced motion skips it, and disabling `Coordination singularity`
recompiles the sky and meadow variants without the flicker fragment branch and
stops processing its impulse clock.

Optional visual effects also expose a live checkbox in Scene Diagnostics.
Reload-time query switches remain useful for repeatable A/B measurements and
rollback, but they do not replace the live control. Persistent grass
deformation follows this rule, but remains a dormant experiment: every shipped
quality tier resolves it to off, and the panel checkbox can opt into the lean
field for the current mount. The override resets on reload and does not mutate
the quality plan. The off path uses sampler-free grass materials, allocates no
field render targets, and submits no stamp or recovery passes. Physical events
still drive the transient impact pulses. If the experiment returns,
persistence means a stamped mark holds at full strength for one second, then
uses magnitude-dependent recovery before the seven-second final clear.

Cinematic+ is another session-only diagnostics choice. It resolves the normal
Cinematic quality plan, then adds a physical upper-left sun and a depth-occluded
God Rays pass in light mode. Shelf edges and props therefore cut real shafts
through the radial light instead of relying on painted sky bands. It also
replaces the non-shadowing key light with a camera-bounded directional shadow
rig. The rig uses one 2048-square map; loaded model props cast into it, while
the meadow terrain and tuft shaders compile in directional shadow-map sampling.
Dark theme keeps its authored night lighting. Leaving Cinematic+ unmounts the
sun, ray pass, and shadow rig; disposes their render targets; restores model
flags; and returns to shaders compiled without the extra samples.

Learned state stores the axis triple in versioned local storage and restores it
as a starting point, never a floor or ceiling. Its capability bucket is derived
once from renderer and device evidence; live frame windows adapt the axes but
cannot switch buckets and restore a different triple during the same mount.
Cold-start device signals bias all three axes: a narrow touch viewport starts
from Efficient's resolved DPR as well as its effects and content tiers, instead
of starting Efficient geometry under Showcase resolution and visibly walking
down. Measurement remains free to move in either direction. Version 10
discards version 9 entries, because they may contain a resolution floor learned
from a p95 improvement that never restored median cadence. Sampling begins only
after reveal, shader precompile, and a settled validation window. A current axis
triple becomes persistable only after a post-transition headroom or improved-cut
window accepts it and the scene then stays unchanged for ten seconds. Repeated
acceptable samples retain the first validation timestamp, so ordinary sampling
cannot postpone that deadline forever; pressure that still fails validation is
intentionally not learned.

The Safety contract has two checks. CI pins the tier mapping, projected
triangle ceiling, physical-pixel floor, and every deterministic quality policy
on each commit. Before release, `yarn test:performance:safety` runs Playwright
against a local production build and records the rendered first, middle, and
last checkpoints; each must stay at or below 250,000 triangles. The browser
check stays local because hosted runners expose only software WebGL, which can
lose the context while compiling this scene. Frame rate remains outside the
contract because machine timing is not reproducible.

This replaces a policy that could only trade pixels, and that measured 61
percent movement in framebuffer pixels against 4.7 percent in geometry. Phones
were left degraded and still slow, because their framebuffer is already small
and their constraint is geometry and main-thread work. It amends 0017, where
effects were reduced first: reducing effects on a device short of triangles
spends the wrong resource.
