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
