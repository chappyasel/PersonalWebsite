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

### The bug the guards introduced, and what it taught

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

A cold review caught it. The settle now takes the strength the frame loop is
damping toward and leaves any driven brush alone, so only an undriven one
collapses.

The same review corrected the recorded bound. Collapsing the brush moves the
lean twice: directly through `uPokeDir * push`, and indirectly through the
wind suppression, because `interactionShape` carries
`clamp(uPoke.w / hoverStrength, 0, 1)` and an epsilon of brush still holds
back `0.82 × (epsilon / 0.2)` of the gust. The indirect term is about four
times the direct one. Both together are 1.4% of a full authored throw.

Two lessons worth keeping. A threshold applied to an eased **state** is a
different thing from a threshold applied to the **gesture** driving it, and
only the second is safe. And a displacement bound has to account for every
path the quantity reaches the output by, not just the obvious one.

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

## Open

The decisive experiment is DPR 1 against DPR 2 with the vertex count held
fixed and the fragment count quartered. If `full − no-meadow` shrinks by
roughly four, the meadow is fragment-bound — `DoubleSide` alpha-tested cards
have heavy overdraw — and the per-vertex story above is the wrong subject. If
it holds flat, the vertex stage is the subject and the remaining
instance-constant work is worth moving off the per-vertex path: a static
origin texture, one small target written by a single fragment pass per frame
(one texel per instance), and a `texelFetch` in the vertex shader keyed off a
per-tile instanced index. That is exact rather than approximate — same math,
same origin, no interpolation — but it adds a render target, and it should not
begin until the attribution says the vertex stage is where the time goes.
