# The meadow's vertex budget

Status: branch `perf/meadow-structural-overnight`, not merged
Started: 2026-09-14

## What the scene actually spends

One captured frame at the About stop, forced Showcase, 1440×900 at DPR 2,
meadow rung 3, taken with the repository's own WebGL command probe:

```sh
BASE=http://localhost:3121 node scripts/stacks-gl-probe.mjs \
  --mode census --query "?quality=showcase&hud=1" --units 0
```

The room pass submits 449 draws and 1,909k vertices. They divide like this:

| what | draws | vertices |
| --- | ---: | ---: |
| grass tiles (`ShaderMaterial` instanced) | 29 | 1,217k |
| terrain plane | 2 | 192k |
| sky dome | 1 | 91k |
| every prop in the room (`MeshStandardMaterial`) | 210 | 213k |
| everything else | 207 | 196k |

The meadow is 74% of the room pass's vertex work in 7% of its draws. The props
— seven shelves of authored objects, the thing the page is actually about —
are 11%.

The probe wraps `WebGL2RenderingContext` before any module loads, so these are
exact integers rather than timings. A busy machine cannot move them, which
matters: six performance lanes were measuring on this host at once.

## Why the grass costs what it does

`buildGrassInstances` places 11,000 near tufts and 6,000 far ones. The near
tuft LOD is 66 triangles carried on **132 vertices**, and none of them can be
shared: reading the accessors out of `public/models/grass-tuft.glb` and
comparing position, position+uv and position+normal+uv keys gives 132 unique
vertices under every definition. The mesh is 33 independent quads — one per
blade — so there is no welding to recover, and 132 vertices per tuft is a
property of the art, not of the loader.

`meadowGrassVertexShader` then computes, per vertex:

- `windAt` — three value-noise evaluations plus a trig pair
- `cloudAt` — one more
- `vPatch` — one more
- a six-slot `uPulses` ring loop
- the `uPoke` brush shape
- `lampPool` over six lamp slots
- with deformation on, a vertex texture fetch and a sixth noise evaluation

Every one of those reads `instanceMatrix[3]` and nothing else. They are
per-**instance** quantities evaluated per-**vertex**: 11,000 × 132 plus
6,000 × 64 is 1,836,000 evaluations a frame to produce 17,000 distinct
answers. That 132:1 ratio is the meadow's fundamental cost shape, and it is
the only lever the grass has left once welding is ruled out.

## What shipped on this branch

The guards do not reduce the ratio. They remove the half of it that is paid
for nothing: at rest no ring is expanding, no brush is on the lawn, and unused
lamp slots carry an exact zero, so the whole block computes zeros at full
price.

Each guard is an algebraic identity rather than an approximation:

- a spent ring carries `pulse.w == 0`, which leaves the running activity max
  unchanged and multiplies its contribution to `pulseLean` to `vec2(0)`
- an idle brush carries `uPoke.w == 0`, which makes `push` zero and leaves
  `interactionShape` equal to `pulseActivity`
- a dark lamp slot carries an exact zero glow, which multiplies its whole pool
  term away

Every guard reads uniforms only, so a warp cannot diverge on one, and each
guarded term keeps a zero default declared ahead of its branch.

### The two bugs the guards introduced, and what they taught

`THREE.MathUtils.damp` approaches its target geometrically and never arrives,
so the brushes had to be settled onto an exact zero or the guard would stay
open for tens of seconds after every gesture — the expensive path would have
been the resident one.

The first attempt settled the brush **state**, which also ate live input. Each
damp step is a fraction of the target, so at 120Hz a grass target under
`0.001 / (1 − e^(−14/120))` ≈ 0.009 was knocked back to zero every frame and
could never climb. Flowers ease at less than a third of that rate, so their
dead band reached 15% of full hover strength. `meadowDragSample` scales
strength by `1 − exp(−speed / dragSpeedScale)`, which is exactly a few percent
for a gentle sweep: a slow drag on the lawn did nothing at all.

The second attempt settled against the frame's gesture **target**, which is
right for a gesture that drives every frame and wrong for every real one.
`target` starts at zero each frame and is written only on frames that carried
a pointer sample, so a 60Hz mouse under a 120Hz renderer reports a target on
every other frame and zero on the rest. Those zeros are not a release. The
settle read them as one and knocked the ramp down between every pair of
samples — the same total suppression as the first bug, now hidden behind a
test that only ever drove a constant target.

The settle now reads how long the brush has gone undriven, with a 250ms grace
window. That window is a policy rather than a proof: it covers every cadence
the regression drives, but it cannot bound every input gap a browser can
produce, and a gesture whose samples fall more than 250ms apart will still
have its ramp cut. Nor is it free — released from full hover strength the
decay needs about 1.6 seconds to reach the epsilon anyway, but a brush
released while already under the epsilon holds the shader's interaction block
open for up to the width of the window.

Reading idle from the scene clock has its own documented limit. R3F resets
`clock.elapsedTime` on a frameloop change and `sceneClock.ts` restores it by
wrapping `setFrameloop`, so a restart during a live gesture would make the
frames before the next pointer sample read as idle and clip a sub-epsilon
ramp for that span. It recovers on the next sample, the bound is under one
epsilon even with no sample left to recover on, and no production path reaches
it — but it is a limit, not an impossibility, and it is written down as one.

A cold review caught both bugs, and the second one is the more useful lesson:
**a constant input cannot find an input-cadence bug.** The regression drives the real damp
arithmetic at a real cadence and asserts the shipped rule changes not one
frame of a live gesture — `toBe` against the same drive with no settle at all
— across 60Hz under 120Hz, the alternating pattern at 240Hz, and a 15Hz
pointer far outside anything a browser delivers. The rule it replaced is kept
beside them as a named reproduction that still returns zero, because the
obvious version of this optimisation is wrong in a way that is invisible
against a constant input.

The same review corrected the recorded bound. Collapsing the brush moves the
lean twice: directly through `uPokeDir * push`, and indirectly through the
wind suppression, because `interactionShape` carries
`clamp(uPoke.w / hoverStrength, 0, 1)` and an epsilon of brush still holds
back `0.82 × (epsilon / 0.2)` of the gust. The indirect term is about four
times the direct one. Both together are 1.4% of a full authored throw.

Three lessons worth keeping. A threshold on an eased **state** is a different
thing from a threshold on the **gesture** driving it. A per-frame gesture
target is a different thing again from "a gesture is happening", because most
frames of a live gesture carry no sample. And a displacement bound has to
account for every path the quantity reaches the output by, not just the
obvious one.

## What the benchmark had to learn first

The first timing matrix reported `p50 8.3 ms` for every case, including the
one with the meadow removed entirely. That is the 120Hz refresh interval, not
a measurement. With vsync on, a frame that finishes early waits for the panel,
so on a machine with headroom every workload reads identically and the subject
under test disappears into the vsync floor. The only number that still
separated the cases, travel `p95`, moved more between two repeats of the same
case (`basic` at 10.2 then 16.7 ms) than it did between cases.

`scripts/stacks-meadow-benchmark.mjs` now reports two things that must never
be confused:

- **paced** (vsync on) is what a visitor experiences and the only honest
  source for frames that missed the 120Hz budget
- **unthrottled** (`--disable-gpu-vsync --disable-frame-rate-limit`) makes the
  frame interval the real cost of producing a frame, which is what attributes
  cost to a subsystem, and is not a frame rate anyone will ever see

Quote the paced run for pacing and the unthrottled run for attribution, never
the reverse.

The host was contended for every capture taken so far, so every millisecond
below is provisional and labelled as such; the integers are not.

## Provisional: paced, pre-patch build 88f46c1f

M5 Max, headless Chromium on Metal ANGLE, 1440×900 at DPR 2, two repeats.

| case | rest p95 | travel p95 | travel frames over 120Hz |
| --- | ---: | ---: | ---: |
| full | 9.7 / 9.7 | 16.8 / 17.0 | 85 / 114 |
| no-meadow | 9.9 / 9.7 | 16.4 / 16.6 | 51 / 48 |
| basic | 9.7 / 10.0 | 10.2 / 16.7 | 33 / 72 |

The meadow removes 71 draws and 1,445k vertices from the frame and does not
move `p95` at rest on this machine. That is a statement about an M5 Max with
headroom, not about the M2 MacBook Air in the incident report, and this host
cannot stand in for that one.

## Attribution: not established

DPR 1 against DPR 2 would hold the vertex count fixed and quarter the
fragments, which is the experiment that separates a vertex-bound cost from a
fragment-bound one. It was run. It did not answer the question, and nothing
below is a conclusion.

Every capture's own preflight returned contended, so under the auditor's
contention gate none of these numbers is admissible evidence about where the
meadow's cost goes. They are recorded as raw, unusable-for-attribution data:

| | full | no-meadow |
| --- | ---: | ---: |
| DPR 2, before | 5.60 / 6.20 ms | 5.50 / 5.20 ms |
| DPR 1, before | 5.20 / 5.50 ms | 4.00 / 4.00 ms |
| DPR 2, after | 6.70 / 6.10 ms | 5.00 / 6.70 ms |
| DPR 1, after | 5.00 / 5.00 ms | 4.00 / 4.00 ms |

A stable-looking control does not rescue a failed gate: the `no-meadow` column
reading 4.00 four times at DPR 1 shows that configuration was quiet across
those particular samples, not that the host was quiet enough for the
difference between columns to mean anything. No reduction figure is claimed
from this table, and neither vertex-bound nor fragment-bound is ruled in or
out by it.

What the same runs DO establish, because a busy host cannot move an integer,
is submission parity: 42 instanced draws and ~1,991k submitted vertices before
and after, the same tiles at the same rungs. That is evidence the guards did
not make the meadow cheaper by drawing less of it. It is **not** evidence of
visual parity, which remains open and would need a frame capture.

Concluding the attribution needs a quiet host, and it should be concluded
before anyone starts the larger change below.

## Open

The remaining instance-constant work is worth moving off the per-vertex path
only if a quiet-host attribution resolves toward the vertex stage: a static
origin texture, one small target written by a single fragment pass per frame
(one texel per instance), and a `texelFetch` in the vertex shader keyed off a
per-tile instanced index. That is exact rather than approximate — same math,
same origin, no interpolation — but it adds a render target, and the evidence
for it is not yet good enough to justify one.
