# ADR 0004: Residency migrates between tiled Flight Volumes, weighted toward the camera

**Status:** Accepted

**Date:** 2026-08-18

**Amends:** ADR 0003. Its steering-agent roaming and its intent/flap split stand
unchanged. Its treatment of the Flight Volume as a fixed, Unit-local box that an
insect belongs to for life does not.

## Context

ADR 0003 gave every butterfly a Flight Volume in its home Unit's frame and left
it there permanently: three residents per Unit, never crossing, camera-
independent by design. In review that reads as exactly what it is. Three insects
per shelf, each confined to an invisible box, is legible as an implementation
within a few seconds of watching, and the room feels like seven aquariums rather
than one space.

Two measurements shaped the decision.

`halfWidth` was 2.0 against a `UNIT_SPACING` of 4.4, so consecutive volumes left
a **0.4 m dead gap** between them. Nothing could cross even in principle.

And the volumes' fixedness was not merely aesthetic — it was load-bearing for a
real bug. Landing candidates were filtered by the _active_ Unit while containment
used the _home_ Unit, so a resident could reserve a Perch 4.4 m outside its own
volume. On release into roam, containment's last-resort clamp — a hard position
write — projected it back inside. The butterfly teleported across the room.

## Decision

The seven Flight Volumes **tile**: `halfWidth` becomes 2.2, exactly half the Unit
spacing, so they meet edge to edge with no gap and no overlap. Residency is no
longer fixed; an insect migrates as it crosses the boundary its volume shares
with a neighbour, and its containment, its collision field and the Perches it may
reach all follow.

Tiling is what makes migration safe rather than merely possible. At a shared
boundary an insect is inside both volumes at once, so handing it across requires
moving nothing. Migration on the old gapped volumes would have re-created the
teleport exactly.

Population is weighted toward the viewer by biasing **migration**, never flight.
An insect never knows where the camera is; only the probability of crossing a
boundary does. The illusion is "there are more butterflies here", which is what
we want, and never "the butterflies want me", which a per-insect attraction force
would have produced. A floor of two residents per Unit keeps a shelf you have
just left from emptying, which is what would otherwise teach a viewer the rule.

Redistribution has to land in about ten seconds. At `cruiseSpeed` 0.56 m/s one
Unit of travel is 7.9 s and three Units is 23.6 s, so flying alone cannot do it.
Two mechanisms share the work:

- **Re-homing** moves an insect between volumes without flying it, and is
  permitted only while it is provably outside every view the camera can produce.
- **Transit** is a real crossing at raised speed, for insects near or in frame.

The re-homing margin is **computed from the live camera** rather than authored.
A constant cannot work: at 16:9 the worst-case visible half-width plus the 6 m
`CAMERA_LOOK_X_MAX_LAG` is 9.4 m, but at aspect 3.0 it is 16.4 m — against a room
only 26.4 m wide. An authored constant is therefore either unsafe on ultrawide
displays or useless on ordinary ones. Deriving it per frame is safe at every
aspect, and degrades honestly: when nothing may be re-homed, Transit carries the
whole redistribution more slowly.

## Consequences

Re-homing is deliberately the same mechanism as the teleport bug above. The only
thing separating them is the margin, so that margin is a computed, testable
quantity and not a judgement call — and it is conservative, because cheap
x-distance testing cannot know that an insect is occluded by a shelf that is
itself in frame.

An insect near a boundary samples only one Unit's collision index. The boundary
falls in the open gap between shelves, so this is usually harmless, but a prop
overhanging a boundary would not repel a neighbour's resident.

Camera-weighted residency is a deliberate reversal of ADR 0003's
camera-independence, made by the owner on review.
