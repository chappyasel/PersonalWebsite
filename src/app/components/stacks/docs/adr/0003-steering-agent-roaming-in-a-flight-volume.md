# ADR 0003: Steering-agent roaming in a Flight Volume, split into intent and flap

**Status:** Accepted, partially amended by ADR 0004

**Date:** 2026-08-18

**Amended by:** ADR 0004, which makes Residency migrate between tiled Flight
Volumes and weights it toward the camera. The steering-agent model and the
intent/flap split below stand unchanged; the assumption that an insect keeps one
Unit-local volume for life, and the camera-independence that went with it, do
not.

**Supersedes:** the roaming portions of ADR 0001. Its authored-Perch decision
stands unchanged; its Safe-Air Graph and Active Trajectory sections do not.

## Context

ADR 0002 removed the hard collision guarantee from roaming, which removes the
reason roaming had to be a planned route. What replaces it is a separate
question, and reviewing the two previous attempts turned up three facts that
constrain the answer.

First, neither implementation ever chose a flight volume. Both flew in a flat
21-centimetre slab at y ≈ −0.5 — the gap between the shelf's two planks, half a
metre above every flower and half a metre below the shelf top. The original
loops sat there because they were authored behind the furniture, and the graph
inherited the height without revisiting it. Insects were in dead air, with no
vertical travel, which is the motion a butterfly is most recognizable by.

Second, both models made the path authoritative: the pilot copied its position
verbatim from a sampler. Anything organic then had to be smuggled into the path
itself, where collision revision could overwrite it. The published models do
the reverse — a target supplies a preferred acceleration, and the insect is
never required to be anywhere in particular.

Third, the presentation layer had no insect in it. The body never pitched, its
vertical bob was six millimetres — under two pixels at this camera — and the
wingbeat was a fixed 8.8 Hz regardless of speed. A butterfly's readable signals
are rotational and speed-coupled, and none of them were present. This matters
more than it sounds: the body is a flat cut-out seen at a 9–12° elevation, so
it is viewed nearly edge-on, and pitch is what swings it toward the camera.

## Decision

Roaming is a steering agent inside a Flight Volume, and body motion is a
separate layer that rides on top of it.

**Flight Volume.** Each Unit owns a continuous region of air spanning its whole
face — from just above the flower heads to above its tallest prop, wrapping the
furniture, with residency weighted toward the camera side so most flight is
visible. It is an extent, not a topology. There are no portals: an insect
drifting at a shelf end is turned by the repulsion gradient, and going around
is a consequence of the geometry rather than an authored transition.

**Intent Layer.** Each insect integrates its own velocity from a drifting
wander target, repulsion from nearby collision boxes, and containment inside
its Flight Volume. Each resident owns its wander state, so correlation between
residents is impossible by construction rather than by rejecting repeated
phrases after the fact.

**Flap Layer.** Thorax pitch oscillates out of phase with the wingbeat, and
wingbeat rate and depth follow airspeed. Depth and rate are deliberately
decoupled near hover, because tying both to speed monotonically would leave a
hovering insect's wings nearly still, which is backwards. The layer writes
orientation only. It cannot move the insect, so it can be tuned freely without
risking collision behaviour or the landing state machine.

## Consequences

- The visible result is now mostly a tuning problem, and tuning is confined to
  the layer that cannot break anything.
- The Flight Volume's extent is the single highest-leverage authored value in
  the system. Getting it wrong is what produced two rejected implementations,
  and it should be reviewed whenever a Unit's tallest prop changes.
- The intent layer produces velocity, never position, so nothing downstream can
  copy a path. Landing keeps its own compiled geometry and hard sweep.
- Correlation and repetition stop being properties to test for and become
  properties that cannot occur, so the graph suite's short-cycle and repeated-
  phrase assertions have nothing to assert against and are retired with it.
- Moths keep their lamp-cone roaming, which was never route-like and was never
  rejected, but adopt the Flap Layer at moth values.
- Owner visual review remains the acceptance gate. A green suite has already
  once accompanied a rejected result; behavioural tests bound this model, they
  do not approve it.

## Alternatives considered

- Curl-noise flow field, following the published insect-swarm method: a
  genuinely strong option, provably free of convergence points and exactly
  tangential at boundaries. Rejected because a shared field makes neighbouring
  residents drift in parallel like leaves in one current, and the fix — giving
  each resident its own noise offset — is per-agent wander with more machinery.
- Extending the moth model, quasi-periodic sums of incommensurate sines, to
  three dimensions: cheapest, and already proven in this scene. Rejected
  because it is smooth by construction, which is the same family as the
  quintic that was just rejected, and because it cannot react to geometry
  without a steering pass bolted on anyway.
- Keeping the graph and adding positional noise: rejected outright. It leaves
  the corridors in place and dresses them.
