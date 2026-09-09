# Arbitrate ambiguous touch at Identity Props

Ambiguous coarse-pointer contacts that begin on an active Identity Prop will
enter Touch Arbitration from the start. A quick release establishes Touch
Focus, movement before the hold threshold transfers the complete gesture into
a World Swipe, and a stationary hold claims the prop for carrying when it is a
Movable Prop. Every prop that supports fine-pointer carrying remains Movable
under a coarse-pointer Interaction Profile. Contacts on the exposed World
retain native horizontal swipe behavior.

This limits custom gesture ownership to the screen-space regions that need to
distinguish focus, travel, and carry. It preserves native scrolling elsewhere
and avoids making the whole canvas responsible for recreating platform pan
behavior. Each active region is a Touch Halo large enough for dependable touch
and tracks its Identity Prop through each Portrait Composition. Overlapping
Halos resolve through visible proximity and authored interaction priority;
Touch Focus makes the result reversible before any action commits.

A normally released or browser-cancelled carry clears Touch Focus. The moved
prop keeps its Touch Halo at its rendered position, and its next quick release
establishes a new Focus Lean there instead of being mistaken for a second-tap
activation.

An anchored prop can answer a drag without being Movable: the About globe,
once it is up close, turns and tilts under a fine pointer's drag through the
same one-shot drag intent that fires before a carry. A touch never reaches
those handlers, because this arbiter claims the contact at the window, so an
anchored prop that has a drag intent offers it through its registry entry.
Movement past the tap slop in either axis then hands the contact to the prop
instead of starting a World Swipe or cancelling; the arbiter only waits for
the pointer to lift. A Movable Prop never hands off: its touch drag is the
carry itself.

The same window claim means r3f's pointer never follows a finger, so the near
globe's marks are cast from the position the arbiter publishes, and cast once,
when the press is marked. The camera's touch parallax starts moving the moment
a finger is down; a per-frame sample read a miss by release and the tap
dismissed the globe. The press-time mark stays the label until the next press,
a turn, or the globe going back, which is also the right model for a screen
without hover.

The World reserves two-finger pinch from native viewport zoom. A pinch that
begins on exposed background adjusts visitor-camera framing; once a Movable
Prop is carried, it adjusts that prop's camera-relative hold depth instead.
The first contact remains the carry owner, so releasing the second finger ends
only depth adjustment while releasing the first drops the prop. Native
one-finger horizontal travel remains unchanged.
