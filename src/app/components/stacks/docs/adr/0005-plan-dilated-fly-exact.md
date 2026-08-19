# ADR 0005: The Landing Plan is validated against a dilated envelope

**Status:** Accepted

**Date:** 2026-08-18

## Context

The Landing Cycle is the only part of an insect's life with a hard collision
guarantee: a route is compiled and swept before the Perch is reserved. But the
pilot does not replay that route — it _tracks_ it, with acceleration and jerk
limits and finite gain, which is what keeps the motion from reading as a machine
following a spline. Tracking means deviating from the polyline by a centimetre
or two.

Near tight geometry that deviation is refused by the runtime sweep, and a single
refused step aborts the whole landing. Measured on the live scene: of ten
attempts, seven reached hover, seven reached touchdown, and only four reached
rest. From the shelf that reads as a butterfly repeatedly changing its mind at
the last moment.

## Decision

Plan against a **dilated** envelope and fly with the real one: the route is
validated with a radius slightly larger than the one the pilot is swept against,
so ordinary tracking error is absorbed by construction rather than being fatal.
As a safety net, a refused step during a landing no longer aborts immediately —
it slides, as roaming already does under ADR 0002, and abandons only after
sustained failure.

## Considered options

Widening the runtime tolerance was rejected because it weakens the one hard
guarantee in the system rather than accommodating it. Tracking the polyline more
stiffly was rejected outright: reduced deviation is bought with exactly the
robotic quality that ADR 0003 existed to remove.

## Consequences

Marginal Perches get harder to plan for, not easier. The About collective mark
sits in a 6 cm gap between the desk lamp and the TJ medallion, and the About desk
lamp has 18 cm of headroom under the top plank; both already depend on the
smallest Arrival Curve, and dilation pushes them further toward the edge. Whether
any of them tips back to rejected is an empirical question the Perch audit
answers immediately.
