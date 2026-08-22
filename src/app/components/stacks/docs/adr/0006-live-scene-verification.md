# ADR 0006: Behavioural invariants are verified against a running scene

**Status:** Accepted

**Date:** 2026-08-18

## Context

The insect system shipped a rewrite with **532 passing tests and not one
butterfly that landed**. Over ninety seconds, twenty-one residents spent half
their time in approach and reached rest zero times. The cause was a two-line
disagreement — the planner validated the hover arc with the folded pose and the
reserved-support exception, and the pilot then flew it with the open-wing sphere
and no exception — and nothing in the suite could see it, because the test world
never modelled the reserved support as a collider at all.

That was not the only one. A teleport across the room, a glide-in with the wings
shut, a thorax bobbing against its own wingbeat, a perched body floating a third
of a prop's height above it, and an occupancy of one where three was authored:
every one of them was invisible to unit tests and obvious within a minute of
watching the scene. Two were defects the author had rationalised in a code
comment in order to make a test pass.

## Decision

Properties that are statistical, live and emergent are verified against a running
scene, in a separate command from `pnpm test` because they need a server. The
suite keeps what it is good at — pure functions, planner geometry, and the
contract that every phase the planner forgives the support in is a phase the
pilot flies with the same licence.

The live check asserts what vitest structurally cannot: that Perches resolve and
are reachable, that some minimum number of insects are actually perched across a
sampling window, that no insect moves further between samples than flight can
explain, that none lands outside its own Flight Volume, and that none is ever
below its contact plane.

## Consequences

It cannot run in `pnpm test` and will not gate an ordinary commit, so it has to
be run deliberately. That is the trade: a check that needs a browser and sixty
seconds, against a class of defect that a green suite demonstrably cannot catch.

A green suite is not approval. The rejected implementation before this one had
487 passing tests.
