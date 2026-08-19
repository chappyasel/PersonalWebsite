# ADR 0002: Soft collision for roaming, hard guarantee only for landing

**Status:** Accepted

**Date:** 2026-08-18

## Context

The first two insect flight implementations both guaranteed that a roaming
insect's flight sphere could never overlap a prop. That guarantee is what
forced their architecture: to prove a corridor is clear before flying it, you
must know where you are going before you go there, so roaming became a planned,
swept, pre-validated route — first three closed loops, then a node-and-edge
graph — replanned whenever the collision index moved.

The owner rejected both on sight as robotic, and the second rejection is the
informative one. That implementation smoothed its route with jerk-limited
quintics, which is the textbook trajectory generator for a CNC machine or a
robot arm. It was not accidentally robot-like; minimizing jerk along a
pre-committed path is the definition of how a robot moves. Every remedy
available inside that architecture — more nodes, more smoothing, more
randomness in edge selection — makes the motion smoother, and smoother is the
wrong direction. The flight literature describes butterfly flight as an
erratic trajectory at an inconstant speed, which is the opposite objective.

The guarantee was never actually load-bearing. These insects are roughly ten
centimetres across, seen from nearly five metres away through a 33° lens at a
9–12° elevation. A wingtip passing through a leaf for two frames is not
observable. The guarantee was costing the entire visual result to buy something
nobody can see.

## Decision

Collision is soft while roaming and hard while landing.

Roaming has no sweep gate and no validated corridor. An insect integrates its
own velocity under a repulsion force derived from the same per-Unit collision
boxes, and geometry bends it away rather than forbidding it. A rare shallow
overlap with a thin prop is an accepted outcome, not a defect.

Landing keeps the complete existing guarantee. The Arrival Curve, the resting
pose, and the launch are still compiled and swept against one collision
revision before a Perch is reserved. Contact is the entire point of a Landing
Cycle, so that is where exactness earns its cost.

## Consequences

- Roaming no longer needs to know where it is going before it goes there. This
  is what makes an area-filling, non-repeating, per-resident motion model
  possible at all; see ADR 0003.
- The safe-air graph, its edge topology, its revision-driven replanning, its
  detour machinery, and its stop reasons all become unnecessary rather than
  merely unfashionable.
- Roaming gets cheaper, not more expensive. Per-frame swept-sphere corridor
  validation is replaced by a distance evaluation against the same boxes.
- A disturbed insect can always leave. The previous escape could fail to find
  any clear corridor and refuse to take off at all; with soft collision there
  is always a direction available, so the failure mode is deleted rather than
  handled.
- Tests can no longer assert "no roaming sample ever overlaps a collider."
  Roaming invariants become statistical and behavioural — volume occupancy,
  absence of shared corridors, sustained motion — and the exactness assertions
  move to the landing suite, where they still hold.
- If a specific prop ever does produce a visible clip, the fix is local: raise
  its repulsion radius, not reinstate the planner.

## Alternatives considered

- Keep the hard guarantee and layer organic motion on top: rejected because
  that is what the last two attempts did. Organic motion and a pre-validated
  corridor are in direct tension, and the corridor wins every frame.
- Hard for props, soft for the shelf planks: rejected as a false economy. It
  needs a prop/structure classification the collision index does not carry,
  and the planks are the geometry insects fly nearest.
