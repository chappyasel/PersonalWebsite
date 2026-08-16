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

**Traverse** — the full journey from the first unit to the last. Vertical
scrolling advances the traverse; the traverse also advances the morning (see
Sky).

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

**Placard** — the dense, readable content for a unit (the museum-label
metaphor): real section content in a screen-fixed panel, never rendered inside
the 3D scene. On desktop it stands beside the world; on mobile it is summoned
(see Peek Chip), never resident.

**Peek Chip** — mobile's collapsed placard: one line naming the active unit,
pinned at the bottom of the clean world. Tapping the chip or the sheet's own
controls expands it into the full placard; tapping the 3D scene remains
available for scene interactions. While a placard is expanded the traverse is
paused, and the world leans slightly toward the unit being read.

**World mode** — the full 3D experience (canvas + placards + chrome).

**Flat mode** — the same content as a plain vertical page: the server render,
the fallback for reduced motion or missing WebGL, and what search engines see.

**Rail** — the persistent labeled list of all units; the map of the traverse
and the way to jump.

**Door** — a scene object with an honest destination that opens on a
stationary activation. A Door may also be movable, but scenery with no
destination and easter eggs are not Doors.
_Avoid_: Link, linked prop, clickable object

**Door Label** — the compact destination label a Door reveals when a visitor
dwells on it. It names the outcome of entering the Door; it is not a general
label for scenery or easter eggs.
_Avoid_: Tooltip, hover label

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
