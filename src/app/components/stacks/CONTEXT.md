# Homepage 3D Scene — Context

The home page of chappyasel.com: a single horizontal room of shelf units that
visitors travel through. It presents who Chappy is by showing his things in
one continuous space rather than listing sections on a page.

## Terms

**Homepage scene** — the home-page world as a whole: seven shelf units in one
shared atmosphere, traveled laterally.

**Unit** — one shelf vignette representing one facet (About, Books, Training,
Systems, Projects, Musings, Talks). A unit has scene objects and exactly one
placard. The unit order is fixed and meaningful: it is the traverse.

**Portrait Composition** — a Unit's mobile-specific staging of the same
personal world for a narrow viewport. It may reposition or enlarge scene
objects to preserve meaning, legibility, and touchability rather than scaling
the desktop arrangement down intact. Each Unit owns its camera target and
distance while sharing a consistent lens and horizon language with the other
stops.
_Avoid_: Shrunken desktop unit, mobile fallback

**Presentation Profile** — the World and Placard composition selected from
available viewport geometry. It determines wide versus Portrait Composition
and dock versus Peek Sheet without inferring how the visitor will interact.
Short landscape screens reuse the responsive World; they do not have a
separately authored Compact Landscape profile unless usage evidence later
justifies one.
_Avoid_: Device class, input mode

**Interaction Profile** — the interaction contract selected from the pointer
actually in use. Fine pointers receive hover previews and wheel/trackpad
travel. Coarse pointers receive Touch Focus, direct swipes, and two-finger
framing. Narrow Peek Sheets use native blur for both; surface treatment is not
an input decision.
These choices remain independent of the current Presentation Profile.
_Avoid_: Mobile mode, desktop mode, user-agent class

**Capability Profile** — the rendering budget selected from observed runtime
performance and device constraints, independently of Presentation and
Interaction Profiles. It preserves Identity Props, composition, and immediate
feedback while progressively reducing scalable effects such as shadow detail,
reflections, particles, and offscreen wildlife to protect frame pacing. The
resolved profile remains visually stable through World Boot and the first
resting view; entry never reveals a temporary profile that upgrades in place.
_Avoid_: Mobile quality, coarse-pointer quality, visual identity downgrade

**World Boot** — the whole path from a document load to the world owning the
screen: the capability decision, the boot vignette, the four reveal gates, the
handoff, and the fail-open return to the document. It is one state machine
(ADR 0021), not a sequence of effects.
_Avoid_: Loading sequence, startup flow

**Handshake Phase** — the value of `data-world` on the document element:
`pending`, `warm`, `ready`, or absent. It is what CSS acts on during the very
first paint, before React exists, and it is the single published answer to
"which homepage is on screen".
_Avoid_: Loading state, world flag

**Boot Stage** — where the boot vignette's bookcase stands on screen. It opens
in its centred box, as it always has. When the URL opens the world on About,
it then glides onto the live shelf at unit 0's origin and scale. The pre-paint
script derives both values from the camera's About rest pose for the current
viewport. The glide begins when the room is ready or the last reveal object
lands, whichever happens first. The vignette pass completes only after the
glide lands, so the handoff dissolves in place. A section hash or pathname that
opens on another stop leaves the boot stage centred and completes without a
glide. The same URL predicate and projection run before paint and after
hydration.
_Avoid_: Centered loader, loading box

**Reveal Gate** — the four facts that must all hold before the boot screen is
retired: a painted frame, an idle loading manager that has stayed quiet, filled
meadow buffers, and one completed pass of the boot vignette. Time never opens
one of the three world facts. It only ever releases the fourth: past the
vignette ceiling the reveal stops waiting on the pass, because presentation may
delay a painted room by a fixed cosmetic budget and never hold it (ADR 0022).
_Avoid_: Load percentage, loading threshold

**Wait Stage** — the first reveal gate this boot has not passed: chunk,
assets, first frame, meadow, opening. It decides which of the room's ten wait
lines are eligible to show, since each line is grouped under the gate it is
true of; within a gate the lines take turns, but a timer never advances the
gate itself. Latched, so the line never moves backwards when a late batch or a
meadow remount reopens a gate. It is ordinal on purpose; there is no
percentage anywhere in the boot, because a loading manager's `loaded/total`
rebases per batch and the slowest stretches of a cold boot publish no load
events at all.
_Avoid_: Progress, loading percent, boot step

**Warm Boot** — a load predicted to find the chunk and its assets already in
the browser cache, which selects the shorter handoff. Only ever a prediction:
it never hides the boot vignette and never overrides reduced motion or
Save-Data.
_Avoid_: Cached load, fast path

**Demotion** — giving the world up after it was already promised, because of a
hang, a chunk or scene throw, or a lost GL context. The document comes back
animated. Distinct from a visitor who was never eligible, who is not being
given a fallback but the homepage. A room that has once been ready can no
longer be demoted for a hang, and no boot can be demoted while its tab is
hidden: both backstops exist to rescue a visitor stuck on a boot screen, and
neither case has one (ADR 0022).
_Avoid_: Fallback, downgrade

**Identity Prop** — a scene object whose presence communicates something
meaningful about Chappy or owns a meaningful action. Every Identity Prop must
survive into its Unit's Portrait Composition, though its position and scale may
change.
_Avoid_: Required decoration, hero prop

**Project Icon** — a physical shelf object that represents one of Chappy's
apps through its original, recognizable icon artwork. It is an Identity Prop,
not a screenshot mounted as wall art.
_Avoid_: Project card, app screenshot

**Role Icon** — a Project Icon billet on the About shelf carrying the mark of
an organization Chappy currently works with, and a Portal to it. The four stand
two by two beside the Apple mark at half the Projects edge; each is its own
Movable Prop.
_Avoid_: Logo wall, sponsor badge, client list

**Dice Pyramid** — six separate Movable Props arranged three-two-one to
represent Liar's Dice. The arrangement may collapse through interaction; the
individual dice remain the objects rather than becoming one grouped sculpture.
_Avoid_: Dice statue, grouped dice prop

**Movable Prop** — an Identity Prop whose semantic role includes physical
carrying through Weighted dragging. Every fine-pointer Movable Prop remains
Movable under a coarse-pointer Interaction Profile; Portrait Composition may
enlarge or reposition its touch target but may not remove the interaction.
_Avoid_: Desktop-only toy, decorative drag affordance

**Set Dressing** — an atmospheric scene object that strengthens a Unit's
composition without defining its identity or owning a meaningful action. A
Portrait Composition may move, simplify, replace, or omit Set Dressing.
_Avoid_: Identity Prop, required prop

**Reaction Archetype** — the single named response a prop gives while a pointer
rests on it. Every prop has exactly one, derived from what the prop already is:
its foliage profile, its material, its measured size, then its authored mass.
_Avoid_: Hover effect, hover style, animation preset

**Signature Reaction** — a Reaction Archetype authored for one named prop
because the gesture belongs to that object rather than to its class. The tea
cup's steam and the basketball's roll are Signature Reactions; a book's nod is
not, because the rule already reaches every book.
_Avoid_: Custom hover, one-off animation, special case

**Lean Clearance** — the air measured above a prop before a neighbour's
geometry begins. A prop's lean is fitted into it, because the hinge pins only
the contact edge underneath and says nothing about what is stacked on top. A
lean with nowhere to go becomes a pull toward the viewer of the same travel,
never silence.
_Avoid_: Collision check, clipping fix, overlap guard

**Held Pose** — the changed but static state a prop settles into and holds for
as long as it is hovered or under Touch Focus. A Reaction Archetype may open
with a one-shot flourish, but it always resolves to a Held Pose, so a prop that
is still selected never looks unselected.
_Avoid_: Hover loop, idle animation, sustained effect

**Held Rate** — the Held Pose of a prop whose character is that it moves. A
globe turning faster, a cup steaming harder, an alarm clock trembling: the
changed state is the RATE, not a position. Parking such a prop at some angle
would stop the one thing it does. Same contract as a Held Pose — it must still
read as selected with no timeout.
_Avoid_: Hover loop, idle animation (an idle runs whether or not you are there)

**Traverse** — the full journey from the first Unit to the last. Desktop
scrolling and mobile World Swipes advance it; the Traverse also advances the
morning (see Sky).

**Arrival Gate** — the requirement that a destination Unit's visible
composition be complete before the camera settles there. Travel responds
immediately and may begin before the gate passes; an unfinished Unit may not
become the resting view.
_Avoid_: Travel lock, navigation gate, preload gate

**World Swipe** — mobile's direct horizontal gesture for advancing or
reversing the Traverse through the exposed World. Vertical gestures belong to
the Peek Sheet and readable Placard content, never to lateral World travel.
_Avoid_: Vertical world scroll, omnidirectional travel swipe

**World Pinch** — a two-finger gesture on exposed World background that moves
the visitor camera closer or farther without changing Units. During carrying,
the same gesture changes the Movable Prop's hold depth instead; the original
contact continues to own its screen position and release.
_Avoid_: Browser page zoom, scale transform, pinch-to-travel

**Kinetic Snap** — the candidate mobile settling behavior in which the World
follows a World Swipe continuously, release momentum may carry it across
multiple Units, and every resting position resolves to an authored Portrait
Composition.
_Avoid_: Free intermediate rest, one-page swipe

**Arrival Beat** — one restrained, Unit-specific response that acknowledges a
visitor's first arrival at that Unit during a session. It emerges from that
Unit's Identity Props, creatures, or motivated light; revisits use the normal
camera settle.
_Avoid_: Generic page transition, every-visit spectacle, random flourish

**Vision Ride** — the optional first-person vignette entered through the Apple
Vision Pro on the About shelf. It owns the whole viewport during an authored
cinematic journey, settles into a seamless retrowave loop, and returns the
visitor to the same place in the Homepage scene; it is not a driving game or a
second navigable world. The room can tune that one world before entry: the
alarm clock arms its 3:45 sky, all three Training shakers arm Redline motion,
the Projects boards supply the pixel finish, and striking Vision Pro in the
Training golf bay arms its green fairway treatment. Entry captures the active
Reality Stack so nothing changes halfway through the ride.
_Avoid_: Vision Pro world, driving mode, minigame

**Sky** — the world's backdrop, always set in Chappy's morning hours. Dark
theme depicts 3:45am: full night, stars out, the city mostly asleep, dawn not
yet arrived. Light theme depicts just after first light: a genuinely light,
cool morning sky. The city on the horizon is San Francisco, subtly: a mostly
generic ridge with a few unmistakable landmark silhouettes (Sutro Tower
foremost), never a postcard skyline. Jasper / 45 Lansing is a quiet personal
marker in the same skyline material; only its floor-33 window distinguishes it.
In both themes the traverse advances the
morning a little: in the dark the first ember approaches by the final unit; in
the light the sun climbs and the city's last night lights wink out. The sky is
never generic dusk; its moment-of-day is part of the identity (he is up before
the sky is).

**Tended Meadow** — the scene's cultivated landscape, gently reclaiming the
edges of the room without making it feel abandoned. Taller growth, soil, moss,
and dry matter appear selectively where they explain contact, age, or a
transition; a narrow unmown apron gathers around furniture while shelf faces,
objects, and interaction zones remain legible. Ivy is intentionally excluded.
_Avoid_: Overgrowth, cottagecore, random foliage, environmental clutter

**Motivated Dawn** — the scene's lighting language: broad cool illumination
comes from the morning sky, while warm local illumination comes from visible
practical fixtures. Darkness, falloff, and retained material texture matter
more than making every object equally bright.
_Avoid_: Unmotivated fill, decorative rim light, uniform exposure

**Perch** — an authored, prop-relative landing site with a real triangle grip
contact, outward surface normal, optional tangent/tolerances, and clearance for
an insect's complete folded resting pose. Butterflies may use Perches
throughout all seven Units; the resolved triangle contact follows its owning
prop if that prop moves.
_Avoid_: Random shelf coordinate, spawn point

**Perch Diagnostic** — the shared, stable-code verdict for one species at one
Perch: authored anchor, triangle contact, tangent frame, eligibility,
occupancy, complete envelope, collision revision, all Landing Plan routes, and
the exact rejection reason. The development HUD visualizes this same verdict.
_Avoid_: Debug marker, renderer-only validity

**Flight Volume** — the region of air a roaming insect may occupy: a
continuous authored extent, not a set of places. It is authored in one Unit's
own frame — spanning that Unit's whole face, from just above the flowers to
above the tallest prop, wrapping the furniture with residency weighted toward
the camera side — and the seven of them tile edge to edge, so the room is
covered without seams or gaps between them. Membership is a containment force,
never a route.
_Avoid_: Safe-air graph, navigation mesh, flight path, authored orbit, cage

**Residency** — which Flight Volume an insect currently belongs to. It is not
fixed at birth: an insect migrates as it crosses the boundary its volume
shares with a neighbour, and its containment, its collision field, and the
Perches it may reach all follow. Tiling is what makes migration possible — at
a shared boundary the insect is inside both volumes at once, so nothing has to
move it.
_Avoid_: Home unit, spawn unit, assigned shelf

**Transit** — the purposeful crossing an insect flies from one Flight Volume
into a neighbour: raised speed, wander suppressed, but still flight — geometry
still repels it and containment still applies. It is what roaming is not, a
movement with somewhere to be, and it is the only redistribution mechanism
that works when nothing can be re-homed.
_Avoid_: Migration path, travel animation, waypoint run

**Re-homing** — changing an insect's Residency without flying it, permitted
only while that insect is provably outside every view the camera can currently
produce. The margin is computed from the live camera rather than authored,
because any constant is either unsafe at wide aspect ratios or useless at
narrow ones.
_Avoid_: Teleport, respawn, warp, snap

**Intent Layer** — a roaming insect's slow decision about where to be,
expressed only as forces on its own velocity: a drifting wander target,
repulsion from nearby geometry, and containment inside the air it belongs to —
a Flight Volume for a butterfly, a Lamp Cone for a moth. It never produces a
position, so no two insects can share a line through the air.
_Avoid_: Route, trajectory, waypoint animation, planner

**Lamp Cone** — the air a moth roams: a soft radial extent about a lit
practical, containing it the way a Flight Volume contains a butterfly. Softness
is the point rather than a tolerance — a moth that drifts a little proud of the
beam, darkens, and is drawn back is doing the thing a moth is for, and a hard
boundary cannot express it.
_Avoid_: Light radius, moth orbit, cone path

**Flap Layer** — the fast body motion that makes an insect read as an insect:
thorax pitch driven a quarter cycle behind the wingbeat that causes it,
wingbeat rate and depth coupled to airspeed, and — while perched — long
stillness punctuated by the occasional slow open and close, at a period and
depth that differ per insect so no two are ever in step. It is presentation
only and cannot move the insect or alter what it collides with.
_Avoid_: Bob, animation clip, secondary motion, idle loop

**Lamp Perch** — a Perch inside an active practical's visibly illuminated zone.
Moths may land only on Lamp Perches while that practical is lit; they never
settle arbitrarily across unlit shelves.
_Avoid_: Moth perch, generic Perch

**Landing Cycle** — one insect's interruptible, acceleration-limited sequence
from roaming through a single continuous Arrival Curve, rest, launch, and a
position-and-velocity matched return to roaming. It is the only part of an
insect's life with a hard collision guarantee.
_Avoid_: Landing animation, waypoint path

**Arrival Curve** — the one continuous curve an insect flies from roaming to
contact: a spiral around the Perch normal whose radius and height decay
together, so it meets the surface along the surface rather than descending
onto it. Circling and settling are the same gesture, not separate phases.
_Avoid_: Approach phase, hover arc, touchdown segment, normal-axis descent

**Disturbance** — direct interaction with a Perch's owning prop, or recent
mouse/trackpad activity followed by confirmed proximity to its projected
screen position. Touch proximity and a dormant cursor are never Disturbances.
Its severity is part of its identity: a grabbed prop and a passing cursor are
different Disturbances, not one event at different strengths.
_Avoid_: Hover state

**Escape** — the departure a Disturbance provokes. It is defined by making
ground away from the Perch, never by arriving anywhere, so it always resolves:
an insect that cannot make progress finds another way out or abandons the
Perch, and never holds station above the site it fled.
_Avoid_: Departure Vector, escape target, launch waypoint

**Placard** — the primary, readable content for a Unit (the museum-label
metaphor): real section content in a screen-fixed panel, never rendered inside
the 3D scene. In a wide presentation it stands beside the World; in a narrow
presentation it remains resident as a Peek Sheet and may expand for reading.

**Travel-Synced Placard** — mobile behavior in which the resident Placard body
changes as the Traverse crosses into each Unit, including intermediate Units
during a Kinetic Snap. The content participates in travel rather than waiting
for the World to settle.
_Avoid_: Settlement-only content, destination preview

**Peek Sheet** — the resident mobile presentation of the active Unit's
Placard. Its resting state shares the viewport with the World; it may expand
for reading or be dismissed into a Peek Chip.
_Avoid_: Supporting sheet, optional details

**Resting Split** — the mobile Peek Sheet's default approximately 70% World /
30% Placard division of the usable viewport. The World-weighted area preserves
the Portrait Composition; it does not make the Placard secondary content.
_Avoid_: Content hierarchy, fixed pixel height

**Peek Chip** — the dismissed form of the mobile Peek Sheet: one line naming
the active Unit, pinned at the bottom of the exposed World. It restores the
resident Peek Sheet; it is not the default presentation of the Placard.

**World mode** — the full 3D experience (canvas + placards + chrome).

**Flat mode** — the same content as a plain vertical page: the server render,
the fallback for reduced motion or missing WebGL, and what search engines see.

**Rail** — the persistent labeled list of all units; the map of the traverse
and the way to jump.

**Mobile Rail** — seven permanently visible Unit buttons. Tapping a glyph
travels directly to that Unit. Sliding horizontally across the row previews
Units through the Travel-Synced Placard and commits travel on release. Brief
haptic ticks may reinforce transitions on supporting devices. Vertical movement
remains native, and the Rail cedes touch during Ambient Reading.
_Avoid_: Hidden primary navigation, unlabeled notches, haptic-only feedback

**Portal** — a scene object with an honest destination that opens on a
stationary activation. A Portal may also be movable, but scenery with no
destination and easter eggs are not Portals.
_Avoid_: Link, linked prop, clickable object

**Portal Label** — the compact outcome label a Portal or explicit local action
reveals when a visitor dwells with a fine pointer or establishes Touch Focus.
Navigation labels name the destination; local-action labels name what the
stationary activation does. Under Touch Focus the label is also a large,
explicit activation target. It appears adjacent to the focused prop and offset
from the contact; when that would collide with chrome, the Peek Sheet, or a
viewport edge, it docks above the Peek Sheet with a short visual tether to its
owner. Movable-only scenery and quiet easter eggs do not receive one.
_Avoid_: Tooltip, hover label

**Touch Focus** — the persistent mobile selection established by the first tap
on a discrete authored prop. Every standalone object participates, including
fixed furniture and seam plants; structural systems such as shelves, ground,
grass, and sky do not compete for focus. It reveals the prop's outcome before
any Portal navigation or explicit local action occurs and gives a movable-only
prop a persistent selected state without inventing a Portal Label. A subsequent
tap on either an actionable prop or its Portal Label commits the same
role-specific activation.
It has no timeout and clears when focus transfers or the visitor changes
context through background touch, World travel, rail navigation, or Peek Sheet
expansion. Carrying does not count as that first tap. Normal release or browser
cancellation clears the carried prop's prior focus, so its next quick tap
focuses and reframes its new position before a later tap can activate it.
_Avoid_: Hover emulation, instant touch navigation

**Focus Lean** — the restrained, context-preserving camera reframe that begins
after a quick release establishes Touch Focus. It enlarges the focused prop
without changing Units or hiding its surroundings, then restores the authored
Portrait Composition when focus clears. It never begins during unresolved
Touch Arbitration or carrying.
_Avoid_: Inspection mode, unit travel, pinch zoom

**Touch Arbitration** — the coarse-pointer decision made when contact begins
on a discrete authored prop. A quick release establishes Touch Focus; movement
before the hold threshold becomes a World Swipe with its full displacement;
a stationary hold on any Movable Prop promotes the same contact into carrying.
A second contact then adjusts hold depth without taking release ownership from
the first. An anchored prop that answers a drag itself (the near globe turns
and tilts under the finger) takes the contact once it moves past the tap slop
in either axis; the arbiter then neither travels the World nor cancels, and
the prop owns the pointer stream until release. The exposed World outside
authored props retains its native one-finger swipe behavior and reserves a
two-finger World Pinch for framing.
_Avoid_: Long-press mode, global scroll lock

**Touch Halo** — the invisible, projected coarse-pointer target that expands
an interactive prop to a dependable minimum hit area without changing its
visual or physical scale. When Halos overlap, visible proximity and authored
interaction priority resolve the candidate; Touch Focus confirms it before an
action commits.
_Avoid_: Exact-mesh touch, permanent hotspot marker, oversized prop

**Pickup Cue** — the world-native feedback that makes Touch Arbitration
legible on a Movable Prop: immediate physical compression on contact, a subtle
loaded lift as the hold threshold completes, then pickup. A prop already up
close gives no cue: it is in hand, so a press on it neither compresses it nor
pulls the camera. A light haptic may
reinforce pickup where supported; it is never explained with floating
instruction copy.
_Avoid_: Permanent drag badge, generic progress spinner

**Touch Wake** — the small, local disturbance created as a coarse pointer moves
through exposed World space. Nearby environmental details may bend, stir,
startle, or sway, then settle quickly; it never fires over UI, performs an
action, or travels beyond the contact's immediate neighborhood. Capability
Profile may simplify or omit individual effects while preserving immediate
contact feedback.
_Avoid_: Cursor trail, global scene reaction, hidden activation

**Damped Toss** — the coarse-pointer release from carrying: it preserves
enough release velocity to feel physical while capping extremes for a small
viewport. Weighted dragging still makes mass perceptible, and any prop that
escapes its authored play area recovers automatically.
_Avoid_: Placement-only release, unbounded mobile throw, always snap home

**Offstage Reset** — the existing shared recovery contract for a Movable Prop:
its rearrangement persists while visible, then returns to its authored pose
only after remaining outside the expanded camera frustum. Touch carrying keeps
this desktop behavior unchanged.
_Avoid_: Reset on travel, session-long disorder, touch-specific recovery

**Resident Unit Activity** — the camera-derived runtime state for a mounted
shelf unit. Hot units render and simulate normally; warm units remain ready and
run ambient work at a lower cadence; cold units stay mounted but are hidden and
skip expensive work. Carrying and other live interactions pin their unit hot,
so virtualization never becomes state reconstruction.
_Avoid_: Active-index-only culling, travel-time remount, state eviction

**Resident Placard Content** — the lifetime policy for readable Unit content.
The active Placard mounts immediately. After the World reveal, the remaining
Placards mount nearest-first, one per idle slice, and stay resident so travel
preserves scroll state and decoded media. Background preparation pauses while
the World is moving; arrival must never compete with a speculative mount.
_Avoid_: Travel-time mounting, idle work during travel, post-visit eviction

**Paper Surface** — an explicit diagnostic comparison for the Placard: an
opaque, warm reading sheet with restrained fibers, edge highlights, and
shadow. Shipped narrow and wide Placards use native browser blur regardless of
pointer type.
_Avoid_: Sampled scene copies, input-selected surface treatment

**Ambient Reading** — the expanded Peek Sheet state in which readable content
owns touch while the World remains visibly alive behind it. Insects, lighting,
and subtle scene motion continue, but World travel, Touch Focus, and carrying
pause until the sheet collapses.
_Avoid_: Interactive background, frozen world

**Source Asset** — licensed third-party or owner-supplied visual material
being considered for the scene. It is raw material, not something that belongs
in the world merely because it is available.
_Avoid_: Drop-in model

**Scene-ready Prop** — a shelf-specific object whose source, silhouette,
materials, scale, composition, and behavior have all been deliberately
accepted for the homepage scene.
_Avoid_: Asset, stock model

**Shelf Spacing Audit** — the geometry-derived report of the actual occupied
and empty spans on both planks of every unit. It measures rendered mesh bounds,
including streamed models and rotated props, rather than duplicating their
authored centers in a second coordinate list. Featured-book layout uses the
same seam to enforce non-overlap and minimum air gaps.
_Avoid_: Eyeballing gaps from source coordinates

**Weighted dragging** — the shared carry response in which real mass changes
pointer follow, maximum lift, throw, and tilt. A light keepsake follows quickly;
a heavy weight lags and stays low. Collision and gravity remain physically
consistent across both.

**Now Strip** — the one-line live readout of present-tense facts (current
book, last lift, local time). Every value on it must be real.

## Development layout editor

Free roam is how the owner reaches props, and it never captures the mouse:
the right button looks, the left button selects a prop and drags its gizmo.
WASD follows the camera's heading on the world XZ plane, so W always moves
toward the viewed horizontal direction even while the camera looks up or down.
Q/E moves on world Y. The policy lives in `scene/freeRoamMotion.ts`;
`CameraRig` only wires it.

The gizmo's handles win the hit test outright. They are drawn over everything
(`depthTest={false}`) and their intersections are promoted to the front of
r3f's distance-sorted list, because r3f stops at the first handler that calls
`stopPropagation` and both the handles and prop selection do. Without that, a
prop standing between the camera and an arrow quietly took every press aimed at
the arrow, which reads as a gizmo that has stopped working. Ordinary picking
away from the handles is untouched.

Entering free roam hides the DOM interface and suppresses prop hover reactions
so selection and transform work stay visually stable. Escape or H reveals the
interface without leaving free roam. Every `Grabbable` registers with the
editor automatically across all seven Units; shelves, walls, terrain, and
other structural geometry do not.

Layout changes made with the development editor are automatically written to
`.next/stacks-layout-draft.json`. When Chappy asks to persist the layout, read
that draft and apply each changed record's `preview`, `previewRotation`, and
`scaleRatio` to the authored scene props. Translation arrows and rotation rings
stay visible together at 60% opacity. One neutral handle applies uniform scale
to the whole prop. The draft is a handoff artifact only. It must never restore
debug overrides when the page reloads.

Leaving free roam disables the layout editor. That releases the selection and
the gizmo, and hands every prop back to normal hover, carry, and physics, but
it does NOT move anything: a prop's edited pose becomes its resting pose for
the rest of the page session, so the new arrangement can be judged from the
ordinary docked view. Reloading is what returns the room to its authored
layout; "Reset all" in the diagnostics panel does the same without a reload,
and works whether or not the editor is enabled. The undo stack survives the
toggle along with the poses. The autosaved draft is still the only thing that
outlives a reload, and still the handoff for later source edits.

## Screenshot mode

The owner's still-frame setup for social headers (LinkedIn 1584×396, X
1500×500). `?screenshot=1` seeds it at load; the Scene console's Render tab
has the live switch, a dolly slider, a lens slider, and a "Copy setup URL"
button. `?screenshot-dolly=` and `?screenshot-fov=` carry the two values in
the URL. The mode opens on the owner's header setup (2026-09-06): the 45
degree lens, the lawn lifted 0.06 and fully uneven at 0.6, so `?screenshot=1`
alone is the header; `?screenshot-fov=composition` asks for the room's own
lens instead. Everything it does is session-only and gone on a reload without the
parameter; it changes no production quality policy and awards no Field Note.

The homepage OG card is this still too, since 2026-09-06: the generator
(`scripts/generate/home-og-scene.mjs`) captures `?screenshot=1` at night with
`screenshot-portrait=1`, which keeps the large portrait where a header would
stand the Macintosh, because a link preview has no profile picture beside
it. The console's "Top shelf" control is the same switch. The capture keeps
its own 30 degree lens, pitch and crop from before; only the room in front
of the camera changed. The generator sets no `?quality=`, on purpose: the
mode lands on Cinematic+ only when the URL leaves the quality open.

On, it makes every unit except About cold through the residency controller
(`sceneUnitActivityController.setSoloUnit`), so the shelf stands alone; the
per-unit ground pools follow the same answer. It hides the interface with the
H key's attribute, but silently, and owns only the hide it introduced, the
same contract free roam uses. The About stop drops its rail shift and the
pointer parallax reads a centred pointer, so the shelf rests on the middle of
the viewport whatever the window's aspect. The dolly is added AFTER the
visitor zoom clamp, because that clamp is a floor of 0.75 and a 4:1 banner
needs several units of air. The render lands on Cinematic+ unless the URL
pins a `?quality=`; leaving the mode hands the quality back only if it is
still the one the mode set. `[` and `]` dolly out and in (Shift for four
steps), handled in ChromeKeyboard so they work in production.

The About shelf is restaged for the header. The Projects Macintosh stands where the large portrait does (`StillMac` in
UnitProjects.tsx: the same casing and screen, no approach, because the flight
to the camera is one singleton for the room and would lift the hidden
Projects machine too). Its screen holds the iconic still: rule 22 from a
single seed, the seed at the top row and every generation below it, the true
infinite-line picture clipped by the bezel, never stepped
(`createIconicRuleStill` in macScreen.ts). The reading stack shows the first three "Featured?" books
instead of the current reads. The couch and its shadow, and the seam monstera
behind the shelf's right end, are not rendered. The coordination globe keeps
its fine neighbourhood mesh and draws no thick reveal arcs. The meadow is
rebuilt for the room that is left: every contact-shadow occluder and unmown
apron in meadowField.ts names its owner (a unit index or the couch) and is
skipped for furniture that is absent (`MeadowFurniture`); the grass instances
rebuild with that and with the still's profile (`GrassStillProfile`: a lift
outside About's footprint, feathered over 1.5 units, and extra height
variation everywhere, both as the console's Grass lift and Grass variation
sliders and the `screenshot-grass-*` parameters); the lawn itself reaches
further (`GRASS_STILL_ENVELOPE`: the trapezoid's west edge and its feather
pushed out 18 units, counts up 1.4x to hold the spacing, the camera-side
apron carried back to z 12), because the room's envelope is sized for a 3:1
window at the authored stop and a dollied 4:1 frame looks past it; the
terrain's `aShade` is rewritten in place since its geometry is cached per
tier; and the putting green is compiled out of the terrain shader (`MEADOW_GOLF_GREEN`), with its
vegetation clearing lifted, since it is painted into the carpet rather than
mounted in Training.

Under Cinematic+ the sky paints a sun at a fixed world direction
(`CINEMATIC_SUN` in SceneEnvironment.tsx) and the god-rays source sphere now
stands on that same direction from the eye, sized to the painted disc. It
used to be pinned to a screen position, which at a wide aspect put a second
sun well to the left of the painted one.

The side tilt-shift takes the OG capture's path while the mode is on: its
clear line sits at the viewport's middle with the capture's widened band
(`effectiveCaptureLensCenter`), because the rail and dock it would otherwise
centre between are hidden with `visibility` and still measure. An explicit
`og-lens-center` still wins.

The window itself is sized by hand or through the browser's device toolbar;
the console shows the live ratio next to the two targets. The boot vignette
still opens with the portrait silhouette, and the rail-shifted About glide
lands a shelf-width left of the centred stop before the camera settles: both
are over before a still is worth taking.

## Grade profiles

A named look the Scene console (Render tab, "Color grade") puts on the room,
or `?grade=` names at load. The print grade in `sceneColorGrade.ts` and
GRADE_FRAGMENT is untouched by any of them; a profile adds a **develop
stage** after it, in display space, with Lightroom's controls: exposure, temp
and tint, contrast, highlights, shadows, whites, blacks, vibrance,
saturation, an eight-band colour mixer (hue, saturation, luminance per band)
and a post vignette. `sceneGradeProfiles.ts` owns the profiles, the
controller, and `developDisplay`, the CPU reference the shader transcribes
and the shade probe runs. Two uniform branches keep the stage cheap: the
whole of it is skipped when every value is at identity, and the mixer, the
only block with a loop and a second HSV round trip, is skipped when no band
is set.

_Shipped_ is what visitors see since 2026-09-06: a constrained develop with
no mixer (warmer key, real blacks under the fog lift, a touch of contrast and
vibrance, a soft vignette; dark quieter still). The mixer is kept out of the
live room on purpose: it only acts above a saturation gate, so an additive
sky mote or a cloud edge fading into blue crosses the gate and wears a ring
or a band, which is how the first candidate was rejected. _Bolder_ is one
step from Shipped toward the Lightroom pass, still mixer-free. _Lightroom
match_ was fitted by least squares to the owner's Lightroom pass on a
Cinematic+ screenshot (light theme only; dark stays identity), and reaches
the same error a 25^3 colour LUT does on that pair, so nothing a global
colour map could keep was lost; it uses the mixer, so it is a still-frame
look. _Flat_ is the stage at identity, the print as it shipped before.
_Custom_ is the sliders: moving any slider forks the active profile into
Custom seeded from it, like touching a slider under a Lightroom preset; a
named profile restores its own values and Custom keeps its last state. The
sliders edit the theme on screen.

Session-only like every console switch. "Copy values" puts the moved sliders
on the clipboard as JSON, which is what to paste when a look should become
the shipped print; "Copy grade URL" carries the profile (and, for Custom,
every slider under `?grade-values=`) so a screenshot setup or a headless
capture reproduces it.
