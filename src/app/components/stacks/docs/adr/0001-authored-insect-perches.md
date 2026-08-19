# ADR 0001: Authored insect perches

**Status:** Accepted, partially superseded

**Date:** 2026-08-17

> **Scope note (2026-08-18).** The authored-Perch decision below stands. The
> roaming design it also records — the Safe-Air Graph, its portal topology, its
> per-resident replanning, and the normal-axis touchdown and hover arc in the
> Landing Cycle — is superseded by [ADR 0002](./0002-soft-collision-for-roaming.md)
> and [ADR 0003](./0003-steering-agent-roaming-in-a-flight-volume.md). Read the
> paragraphs beginning "Ordinary butterfly flight uses a semantic Unit-local
> Safe-Air Graph" and "On a collision revision" as history.

## Context

Butterflies and lamp-bound moths already have natural analytic flight, but
landing them at random shelf coordinates would put wings through props and
would not follow a prop's interaction state. Runtime scene raycasts would add
frame cost, produce unstable targets on decorative meshes, and still would
not encode whether a location is visually intentional or safe for a complete
resting pose.

## Decision

Each shelf authors three to five semantic, prop-associated Perches with a
clearance, owner interaction key, unit, and optional tangent/contact
tolerances. Before claim, a bounded ray grid finds
the best anchor/normal-matching mesh contact on that live owner and stores the
hit and normal in hit-mesh-local space. For an exact owner id, an unspecified
anchor-distance tolerance is advisory: owner identity supplies the semantic
target and the anchor selects its nearest normal-matching triangle. Prefix
owners retain a derived distance bound because they can match siblings, and an
explicit contact-distance tolerance is always enforced in either mode.
Lamp Perches additionally name the registered practical whose lit state makes
them eligible. A small registry exposes their live world transforms to a
shared, deterministic Insect Pilot. A successfully resolved triangle is the
feet/thorax grip contact; planning does not reinterpret its mesh AABB as a
minimum-width platform. The exact support mesh must remain in the collision
index while an oriented folded-wing resting envelope remains clear of other
visible meshes. This permits natural crowns, frame tops, book page blocks, and
rims without pretending an insect needs a broad flat platform. The complete approach,
shallow hover arc, folded touchdown, normal-axis folded lift, full-envelope
launch, and frozen-route rejoin are compiled before reservation against one
collision revision. The support exception is a bounded contact region rather
than the entire support mesh. Occupancy exclusion prevents two insects from
selecting one site. Recent screen-space pointer activity plus confirmed
proximity, or direct owner interaction, causes a Departure Vector away from the
disturbance; unmounting, unit changes, moving owners, stale revisions, or
extinguished lamps fail closed.

Ordinary butterfly flight uses a semantic Unit-local Safe-Air Graph. Candidate
front air, rear air, and left/right portal nodes and edges are compiled against
the live collision index with the complete envelope, bob/bank margin, and
ground clearance. Only a connected component reaching both front and rear can
be activated. Each resident has an independently seeded planner with at least
three validated segments ahead, balanced front/rear dwell, role staggering,
and rejection of reversals, recent nodes, repeated four-edge phrases, and
short cycles. Curves are arc-length sampled and velocity matched; presentation
owns only flap/glide, body lift, heading, and bank.

On a collision revision, the untravelled suffix of the active segment is swept
again. A clear segment keeps its clock while only an invalid future tail is
rebuilt. A blocked segment uses a swept, velocity-matched Hermite detour to the
nearest node in the new connected component. If no front/rear component exists,
the resident decelerates safely and publishes `no-safe-air-component` rather
than appearing silently frozen. Landing freezes the trajectory's cruise-time
horizon and rejoins it with matching position and velocity.

Butterflies may select any eligible Perch. Moths may select only a Lamp Perch
belonging to the same currently lit practical as their existing cone flight.
The normal flight samplers remain authoritative before and after every cycle.

## Consequences

- Landing locations are deliberate, reviewable, and cheap to sample. Geometry
  contact is resolved once per claim and a miss is rejected.
- New or rearranged props need their Perch offsets reviewed with the prop.
- Authored clearance controls approach stand-off; species envelopes separately
  determine body lift, folded resting volume, and swept flight radius. Contact
  support comes from the resolved triangle rather than an AABB-width proxy.
- Coarse visible-mesh collision indexes are rebuilt periodically per Unit,
  but their revision advances only when an id or world bound changes.
  Bounds can conservatively reject some geometrically possible routes, but
  eliminate destination-only and between-frame clipping.
- Shared perch and per-resident flight telemetry publish stable rejection/stop
  codes to tests, runtime reservation, and the development HUD. The safe-air
  graph and active-trajectory drawers are outside collision-indexed roots;
  production omits the HUD and its non-colliding scene helpers entirely.
- The pilot adds persistent per-insect state, but hot motion and collision
  queries remain allocation-free. Triangle raycasts occur only while resolving
  semantic contacts, not during ordinary frame-by-frame flight.

## Alternatives considered

- Random shelf coordinates: rejected because they cannot guarantee visual or
  wing clearance.
- Runtime raycasts against all props: rejected because geometric contact is
  not the same as a compositionally good landing site and costs more per
  frame.
- Baked animation clips: rejected because they cannot react to live prop
  interaction or rejoin the existing analytic flight continuously.
