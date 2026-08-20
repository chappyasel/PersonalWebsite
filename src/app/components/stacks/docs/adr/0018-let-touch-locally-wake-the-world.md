# Let touch locally wake the World

A coarse pointer moving through exposed World space will create a restrained
Touch Wake. Only nearby environmental details respond—such as grass leaning,
dust or petals stirring, a hanging object swaying, or a creature startling—and
they settle quickly after the contact passes.

Grass responds as a root-anchored tuft: wind and local wakes apply one linear
lean to the authored clump while its footprint remains planted. The shader
must not curve the same tuft more at each successive height, because changing
that curvature every frame reads as growth or texture shimmer rather than
sway.

Touch Wake never fires over interface surfaces, performs no action, and does
not propagate across the scene. Its individual effects may simplify or
disappear through the Capability Profile, but contact must still receive
immediate visual feedback.

This gives touch an ambient, causal presence analogous to the desktop world's
localized pointer reactions without adding another gesture or mystery action.
It is chosen over a persistent trail or global reaction, which would feel
decorative rather than physical and would add unnecessary rendering cost.
