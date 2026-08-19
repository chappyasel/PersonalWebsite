# ADR 0007: Moths roam by intent too, contained in a soft Lamp Cone

**Status:** Accepted

**Date:** 2026-08-18

## Context

ADR 0003 replaced the butterflies' played-back analytic flight with a steering
agent, and moths were never migrated. `mothFrame` is still a sum of sines: a
closed-form position copied straight onto the insect each step. Three
consequences follow, and all of them are visible.

Each moth flies one fixed closed curve for the life of the page. The curve is
selected by `phase = index * TAU * 0.381966` and `variation = index % 5`, so
twelve moths share **five** distinct behaviours. And because nothing is
integrated, a moth has no way to be pushed: geometry cannot repel it, so it
passes through props rather than avoiding them.

Moths also carry a real illumination model — brightness falls off with radial
distance from the cone axis and with depth down the beam, applied per instance.
It cannot show, because the sampled path is constructed bounded by the cone
radius. A moth is mathematically incapable of leaving the light, so the only
gradient anyone ever sees is the shallow interior one.

## Decision

Moths roam through the same Intent Layer as butterflies — wander, repulsion,
containment, integrated into their own velocity — with a tighter, twitchier
profile: shorter wander time constant, higher turn rate, lower cruise. A moth is
not a slow butterfly.

Containment is a **Lamp Cone** rather than a Flight Volume: a soft radial extent
about the lit practical. The softness is the feature. Because the Intent Layer
contains by biasing intent and only clamps as a last resort with slack, a moth
naturally drifts a little proud of the beam and is drawn back — which is the
behaviour the illumination model was written for and has never been able to
show. The illumination floor drops from 0.32 toward 0.05 and the falloff extends
past the cone radius, so leaving the light actually reads as leaving the light.

Moths remain lamp-bound. Residency, Transit and Re-homing (ADR 0004) are
butterfly concepts: a butterfly belongs to a region of the room and may cross
between regions, while a moth belongs to a lamp.

## Consequences

A second containment shape now exists. Every other part of the steering agent —
the wander sphere, the distance field, the acceleration limits — is shared, so
the cost is the shape and its margin ramp, not a second flight model.

Twelve moths gain twelve genuinely distinct paths instead of five, and gain
geometry repulsion they have never had.
