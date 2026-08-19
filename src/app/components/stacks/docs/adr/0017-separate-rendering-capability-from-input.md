# Separate rendering capability from input

Rendering quality will use an independent Capability Profile informed by
observed runtime performance and device constraints. Presentation Profile
continues to describe viewport composition, and Interaction Profile continues
to describe the pointer actually in use; neither will stand in for rendering
capability.

Adaptive quality must preserve Identity Props, authored composition, and
immediate interaction feedback. When frame pacing requires relief, it reduces
scalable effects such as shadow detail, reflections, particles, and offscreen
wildlife first.

This avoids treating every touch device as weak or every fine-pointer device as
powerful. Stable response is part of the scene's aliveness, while a fixed
mobile tier would waste capable hardware and full desktop effects would make
weaker devices feel sluggish.
