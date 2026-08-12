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
foremost), never a postcard skyline. In both themes the traverse advances the
morning a little: in the dark the first ember approaches by the final unit; in
the light the sun climbs and the city's last night lights wink out. The sky is
never generic dusk; its moment-of-day is part of the identity (he is up before
the sky is).

**Placard** — the dense, readable content for a unit (the museum-label
metaphor): real section content in a screen-fixed panel, never rendered inside
the 3D scene. On desktop it stands beside the world; on mobile it is summoned
(see Peek Chip), never resident.

**Peek Chip** — mobile's collapsed placard: one line naming the active unit,
pinned at the bottom of the clean world. Tapping the chip or the unit expands
it into the full placard; while a placard is expanded the traverse is paused,
and the world leans slightly toward the unit being read.

**World mode** — the full 3D experience (canvas + placards + chrome).

**Flat mode** — the same content as a plain vertical page: the server render,
the fallback for reduced motion or missing WebGL, and what search engines see.

**Rail** — the persistent labeled list of all units; the map of the traverse
and the way to jump.

**Now Strip** — the one-line live readout of present-tense facts (current
book, last lift, local time). Every value on it must be real.
