# Hover Reaction Archetypes — work log

Implementation of ADR 0020 (`src/app/components/stacks/docs/adr/`). This is the
running record of shortcuts, open questions, judgement calls and next steps, for
review together. Newest sections at the bottom.

## Todo

- [x] 1. Derivation (`archetypeFor`), all six bands resolve
- [x] 2. Band: sway (foliage)
- [x] 3. Band: flutter + strain (mass)
- [x] 4. Amplitude and hinge direction fixes
- [x] 5. Dev census: print every prop's resolved archetype
- [x] 6. Reach: wire the derivation into `ModelProp`'s hover floor
- [x] 7. Band: glow (furniture)
- [x] 8. Band: shimmer (metal)
- [x] 9. Reduced-motion contract
- [x] 11. Seam monstera opted out of hover entirely (owner call)
- [x] 12. One spring for every band, replacing the exponential damps
- [x] 13. Backward lean for the medals
- [x] 14. Stacked props: measured lean clearance, slide substitution
- [x] 10a. Signature overrides, first six (the ones that own machinery)
- [ ] 10b. Signature overrides, remaining four (sailboat, harmonica, microphone, phone) — each is design work, not wiring

## Judgement calls made without asking

**Closed a gap in the approved bands.** The approved preview listed
`mass 0.05–1.0 -> TIP` and `mass > 5.0 -> STRAIN` with nothing between. Once
foliage is removed, 1–5 kg holds exactly two props: the globe (1.4) and the
trophy (1.8). Both are on the signature shortlist anyway. Extended TIP to cover
them rather than invent a seventh band. **Reversible, one line.**

**Reused `massClassFor`'s existing boundaries** (1 / 5 / 20 kg) instead of
authoring new mass thresholds for hover. A second taxonomy would drift from the
one `MASS_HANDLING` already uses for carrying.

**Sway leans about the edge the prop rests on, not the soil line.** A real plant
bends where the stems leave the soil. Both routes to that were rejected: a
vertex shader would have to inject into a material five of the nine plants share
with the mugs and clocks, and a geometry split bails on multi-mesh GLBs and
takes the prop off ModelProp's hover floor. See "Known limitations".

**Sway ignores `hingeFor`'s refusal reasons.** With the size cutoff lifted the
only refusal left is `"rig"`, meaning a light sits inside the prop's own box.
Shelf plants stand close enough to the practical lamps to trip it, which would
have silently killed the lean on whichever plants happen to sit near a lamp.

**Rotation and translation were raised by different amounts.** Rotation is
pinned to a contact edge by `hingeShift` and cannot clip, so it carries the
amplitude. Translation can walk a prop off its plank, so the shared dial moved
less. Numbers in the ADR.

## Owner decisions taken during the work

- **Full per-class, no shared tell.** Chosen over a shared floor plus character
  layer, and over keeping the nod and only fixing amplitude.
- **Derived default with by-name overrides.** Not a hand-authored list.
- **Bands plus a ~10-prop signature shortlist.** Not bands alone, not a gesture
  per family.
- **Every archetype holds a pose.** One-shot gestures rejected because Touch
  Focus has no timeout.
- **Bands scene-wide in one pass**, not unit by unit.
- **Plants lean forward, not sideways.** Overruled the `eggs.tsx` comment that
  "a plant nodding toward the viewer reads as a bug"; that comment is about
  continuous idle motion, not a directed held response.
- **Props hinge toward the camera, not away.**

## Known limitations and shortcuts

**Sway is a whole-prop lean, not a foliage bend.** The pot leans with the
leaves. Honest for a potted plant nudged on a shelf, but it is not what foliage
really does. Unblocking it needs either per-prop material clones (for a vertex
shader) or a foliage-island split that only works on single-mesh GLBs.

**`metal` is a flag, not a material scan.** The props that shimmer today are
bespoke components calling `useMetalShimmer`, not `ModelProp`s whose materials
could be sampled, so band 2 will be wired by hand rather than derived from
material properties. This is the one band that is not really _derived_.

**Small plants read subtly.** The lean is an angle, matching TIP's unit, so a
0.18-scale succulent's crown barely moves while a tall plant's travels far.
Fixable by scaling the angle to prop height. Not done; wanted owner eyes first.

**The press-scale easing still uses the shared lambda.** A strain-band prop
tilts at lambda 4.5 but its press squash still eases at 10. The squash is the
Pickup Cue, a carrying signal rather than a hover one, so it was left alone.
Might read as slightly incoherent on the barbell.

## Environment issues encountered

**Shared worktree.** A peer session is editing this same tree throughout
(`coordinationGlobe`, `coordinationNetwork`, `interactionProjection`,
`unitActivity`, `SceneDiagnostics`, and free-roam work). Consequences:

- The full suite intermittently fails on files I never touched, including one
  torn read of `SceneDiagnostics.tsx` mid-write.
- `Grabbable.tsx` carries their uncommitted `hoverTiltAngle` and `onDragIntent`
  work interleaved with mine.
- **Nothing here is committed.** Landing it needs a selective `git add` of my
  files only, never `git add -A`.

Files that are mine:

```
src/app/components/stacks/scene/leanClearance.ts            (new)
src/app/components/stacks/scene/leanClearance.test.ts       (new)
src/app/components/stacks/scene/stackedHover.presentation.test.ts (new)
src/app/components/stacks/scene/interaction.ts              (modified, shared)
src/app/components/stacks/scene/reactionArchetype.ts        (new)
src/app/components/stacks/scene/reactionArchetype.test.ts   (new)
src/app/components/stacks/scene/swayMotion.ts               (new)
src/app/components/stacks/scene/swayMotion.test.ts          (new)
src/app/components/stacks/scene/hoverTilt.ts                (modified)
src/app/components/stacks/scene/Lift.tsx                    (modified)
src/app/components/stacks/scene/Lift.test.ts                (modified)
src/app/components/stacks/scene/Grabbable.tsx               (modified, shared)
src/app/components/stacks/scene/ModelProp.tsx               (modified)
src/app/components/stacks/scene/units/UnitSystems.tsx       (modified)
src/app/components/stacks/scene/units/plantColliders.presentation.test.ts
src/app/components/stacks/CONTEXT.md                        (modified)
src/app/components/stacks/docs/adr/0020-*.md                (new)
docs/hover-archetypes-worklog.md                            (this file)
```

## Round 2 — census, reach, glow, shimmer, reduced motion

### What changed

**Census.** `recordArchetype` / `archetypeCensus` in `reactionArchetype.ts`.
Read it live with `window.__stacksArchetypes()`. Dev only; the map is never
populated in production. Both shells report into it, and `ModelProp`'s existing
`[stacks] floor …` log now prints the resolved band instead of just `ON`.

**Reach.** `ModelProp`'s hover floor resolves an archetype from its measured
world size. That takes the rule from 53 `Grabbable` call sites to those plus the
35 bare `ModelProp`s.

**Glow.** Oversized props are no longer dropped from the scene. `floorVerdict`
used to return `"furniture"` for anything over `HOVER_MAX_SIZE` and the prop
lost its pointer handlers entirely, which is half of "some things aren't
reactive" — the couch, floor lamp, grandfather clock and golf club were the
props a visitor points at first and the ones that did nothing at all. Size is no
longer a refusal, only a channel change.

**Two size cutoffs, honoured separately.** A prop between `HOVER_MAX_SIZE`
(0.78) and `TILT_MAX_SIZE` (1.0) may now TIP but not RISE. `interaction.ts` has
always argued the two cutoffs should differ and the floor previously collapsed
them into one refusal. New `canRise` state.

**Shimmer.** `Grabbable` takes a `metal` flag, which resolves to the `shimmer`
archetype and suppresses the tilt. Five props tagged: the About apple mark, the
AI Collective mark, the TJ medallion, and both project icons.

**Reduced motion.** `on` in the floor is now `hovered && (!still || glow)`, so a
visitor with `prefers-reduced-motion` gets the glow channel rather than nothing.

### Bugs found in existing code along the way

**The `tiltOnHover` doc described behaviour that did not exist.** It has claimed
since well before ADR 0020 that "reflective marks use shimmer instead of the
shared nod because even a small pitch can move their environment highlight off
the face". Not one metal prop set it. Harmless while the nod was 2.1 degrees on
a top-shelf prop; at 12.9 it would visibly slide the highlight off. Now derived
from the archetype so no call site has to remember it.
`metalShimmerBand.presentation.test.ts` pins it.

**Glow had to join the settle test.** Left out, the early return fires as soon
as the SWELL lands — and the swell travels 0.02 where glow travels 1.0, so it
always lands first — freezing the fade part-way and leaving every furniture prop
permanently, faintly lit after one hover. Caught by reading, not by a test.

### Judgement calls this round

**Census lives on `window.__stacksArchetypes`, not `window.__stacks`.** That
object is declared and installed in `StacksCanvas.tsx`, which the peer session
has open. A census is not worth a merge conflict in a busy shared file. Easy to
fold in later. **Shortcut, deliberate.**

**Glow's universal channel is a swell, not light.** Emissive is written only to
materials the prop OWNS. `atlasMaterial` hands one `MeshStandardMaterial` to
every atlas prop in the scene, so brightening it would brighten the mugs and
clocks too. Spot-checking the furniture found it is predominantly
`variant="atlas"`, i.e. shared — so in practice most furniture currently answers
with the swell alone and the emissive path rarely fires. **This is the biggest
gap in the round. See next phase.**

**Glow swells less than the small-prop floor** (1.02 vs 1.055) even though these
are the biggest props, because swell is proportional: 2% of a 2.4-unit
grandfather clock moves its top five centimetres.

**Glow materials are collected on hover-start, never cached across frames.**
`atlasOverride` rebuilds its clone on a parent re-render and a cached list would
point at freed materials — the trap `Glint` documents in `UnitProjects`.

**Regenerated `aboutBootSilhouettes.ts`** via `yarn generate:about-boot` after
tagging the TJ medallion. The test hashes `AuthoredProps.tsx` to guard a
pre-generated silhouette. Verified the diff is exactly one line, the guard hash;
no silhouette geometry moved, which confirms `metal` has no visual footprint.

### Owner call: the seam monstera is opted out

`Scene.tsx`, `hover={false}`. The big plant between About and Books takes no
hover reaction at all now. Worth noting WHY it stood out: at 2.71 units it is
the largest thing on screen, it is scenery rather than an Identity Prop, and its
`atlasOverride` gives it the only PRIVATE material among the furniture. So it
was the single oversized prop actually receiving the emissive half of glow,
while every shared-atlas one got the swell alone. It was, in effect, a preview
of what question 1 below would do to all the furniture. That it read wrong is
useful evidence, not just a one-off.

### Open questions for review

1. **Does furniture-by-swell read at all?** Most furniture is on the shared
   atlas so it gets a 2% swell and no brighten. If that is too quiet, the fix is
   to force a per-prop material clone (the `atlasOverride` path already does
   exactly this) at the cost of one extra material per furniture prop. Roughly
   six to ten props. **Recommend doing it; wanted eyes first.**
2. **Reduced motion currently answers with a swell**, which is still motion.
   Strictly the contract wants light only, which needs question 1 resolved.
3. **Props between 0.78 and 1.0 now tip where they used to be inert.** I believe
   no bare `ModelProp` sits in that band, but the population is only observable
   at runtime. The census answers it: look for `tip` rows with `size > 0.78`.
4. **Should `metal` be derived rather than flagged?** It is the one band that is
   not really derived. A material scan for high metalness and low roughness
   would do it, but the props concerned are bespoke components, not
   `ModelProp`s.

### Next phase — signature overrides

Not started. Each needs its own gesture and its own review, and the plan was
always one prop per commit on a working base. The shortlist, with what each
already owns to build from:

| prop        | gesture | already has                          |
| ----------- | ------- | ------------------------------------ |
| basketball  | roll    | `shape="sphere"`, `restitution 0.62` |
| tea cup     | steam   | `SteamCup … always`                  |
| shakers ×3  | slosh   | `shakerPose(elapsed)`                |
| alarm clock | tick    | `EggClock` winds to 3:45             |
| globe       | spin    | `SpinProp` / `SPIN_NODE`             |
| sailboat    | heel    | —                                    |
| harmonica   | breath  | —                                    |
| microphone  | live    | —                                    |
| phone       | wake    | —                                    |
| trophy      | glint   | `Glint` in `UnitProjects`            |

Also still unreached by the rule: the 19 `EggTrigger`-family shells. They
install their own `onPointerOver`, so `ancestorHandlesHover` makes the floor
stand down with reason `"shell"`. Their signature gestures would have to be
authored in the shells themselves.

### Verification at end of round

`yarn test`: 1342 of 1343 passing. The single failure is
`freeRoamControls.presentation.test.ts`, an untracked file belonging to the peer
session. `insectSteering.test.ts` failed once under parallel load and passes in
isolation; it is unmodified and not mine. TypeScript, ESLint and Prettier are
clean across every file I touched. `aboutBootSilhouettes.ts` fails Prettier but
is generator output and my diff to it was a single hash string, so that state is
pre-existing.

## Round 3 — springs everywhere, medals lean back, and a correction

### Correction: I was quoting props that do not exist

The measured-population census in `interaction.ts` names an **eames chair** and
a **ladder**. Neither is in the scene. Checking every `url="/models/*.glb"`
reference gives the real set:

```
alarm-clock barbell basketball cactus couch cup-tea desk-lamp dumbbell globe
golf-club golf-tee grandfather-clock harmonica headphones kettlebell lamp-floor
mac microphone monstera mug notebook open-book phone pothos potted-plant
protein-powder sailboat sansevieria soda-can succulent-pot trophy yucca-plant
```

`couch`, not eames chair. No ladder at all. I repeated that comment as current
fact across several rounds and it propagated into a test I wrote, which asserted
the glow band using prop names that are gone. That test now states the RULE
(`size > TILT_MAX_SIZE`) instead of a prop list, with a note explaining why.

**Closed 2026-08-20.** The first pass at this only half-landed: I added a
rule-based test but left a SECOND test in the same file still asserting the
eames chair and the ladder by name, used `prop:eames-chair` as a census
fixture, and wrote the ladder into a fresh `ModelProp` comment in the very
round where I reported the correction. All four are now gone.

`interaction.ts` keeps its measured rows, with a note above each block saying
which two props have since left the scene and pointing at `seated.ts` and
`UnitBooks.tsx`, which independently record the couch swap and the ladder cut.
Deleting the rows would rewrite the evidence the 0.78 and 1.0 cutoffs were
actually chosen against; the risk was never the numbers, it was reading a
point-in-time census as the current world. `window.__stacksArchetypes()` is the
live population and is now named as such in both places.

### One spring for every band

The plants were the only prop in the world on a spring; everything else used
`THREE.MathUtils.damp`, which approaches its target and never passes it. Owner
liked the springy motion, so every band rides a spring now and `Grabbable`'s two
rotation paths collapsed into one.

Bounce is treated as a MATERIAL property, so damping ratio falls as mass rises:

| band           | lean       | damping ratio | overshoot         |
| -------------- | ---------- | ------------- | ----------------- |
| flutter        | 0.300      | 0.46          | ~20%, loose       |
| tip            | 0.225      | 0.58          | ~11%, one bounce  |
| sway           | 0.165      | 0.58          | ~11%, one bounce  |
| strain heavy   | 0.090      | 0.90          | barely any        |
| strain massive | 0.053      | 1.05          | none, over-damped |
| shimmer        | **−0.125** | 0.67          | small, stiff      |

Iron genuinely does not bounce: the massive band is past critical damping. A
test asserts lean and damping ratio fall together across the ladder, so a retune
cannot quietly make the barbell springy.

### Medals lean backward

Owner call: the four flat marks on About (`DeskApple`, AI Collective mark, CR
orb, TJ medallion) and the two `ProjectIcon`s want their own backward tilt.

`shimmer` is now the only band with a NEGATIVE lean. Every other band tips its
top toward you; a medal tips away, which turns its face up toward a camera above
the shelf line. That is the gesture of tilting a coin to read it, and it is the
opposite of the failure mode `Grabbable`'s `tiltOnHover` doc has always warned
about — pitching a flat face forward rolls its environment highlight off and
puts the artwork in shadow.

An earlier cut of band 8 suppressed the tilt on these props outright. That is now
replaced by the backward lean; they shimmer AND lean.

**Assumption flagged:** the CR orb is included. The instruction read "the 4
medals on the first shelf and the 2 on projects", and the orb is one of the four
flat things on that shelf, with the parenthetical only noting that it is the one
that does not shimmer. If a sphere should not lean, it is one line in
`CoordinationGlobe`.

### Judgement calls this round

**Sign handling.** `cameraSideHoverTilt` refuses a non-positive angle, so a
backward lean passes its MAGNITUDE in and multiplies the result by the sign. The
alternative was a second solver that differs only in sign.

**Deduplicated the sway constants.** `SWAY_LEAN` / `SWAY_TWIST` briefly existed
in both `swayMotion.ts` and the new band table. `SWAY_MOTION` now imports them,
so a retune cannot change one and miss the other.

**`ModelProp`'s floor reads the same band table.** An unshelled prop and a
carryable one of the same weight now answer alike, where the floor previously
hard-coded `TIP`.

### What is left, ranked

1. **Nothing is committed.** Shared worktree, thirteen files, no landing yet.
2. **Four questions only the running scene can answer** — see below.
3. **Item 10, the ~10 signature overrides.** One prop per commit, on a base
   that has landed.
4. Small-plant lean scaling; the 19 `EggTrigger` shells; whether `metal` should
   be a material scan rather than a flag.

**A live pass answers four things at once**, and three of them gate work:

- `window.__stacksArchetypes()` — any `tip` row with `size > 0.78` is a prop
  that was inert before this round and now tips (open question 3). Also the
  fastest check that no prop landed in a band that reads wrong.
- Does furniture-by-swell read at all, with no brighten (open question 1)? This
  gates the reduced-motion contract.
- Do the six backward-leaning marks read as tilting to catch the light, and
  should the CR orb be among them?
- Do the small succulents move enough, or does the lean need scaling by height?

### Verification

`yarn test`: 1368 of 1370. Both failures belong to the peer session —
`freeRoamControls.presentation.test.ts` (untracked) and
`scenePerformance.presentation.test.ts` (their test edit, expecting a
`focusRange` line in `Effects.tsx` that is not there). TypeScript, ESLint and
Prettier clean across every file I touched.

## Round 4 — the lean had no ceiling, and stacked props paid for it

Owner report: "there are issues when we have vertically stacked books ... also
pen on paper." Both are one bug, and it is mine.

### What was actually wrong

ADR 0020 gave every prop an automatic lean and justified the amplitude with
this, in `HOVER_MOTION_SCALE`'s own doc:

> Rotation has no such ceiling: every tilt in the world is pinned to a contact
> edge by `hingeShift`, so it can be doubled without anything leaving the plank.

Half true. `hingeShift` pins the edge UNDERNEATH. Nothing was watching the
other end of the arc, and the props that stack have no room there.

The scene already knew this. Two constants apart from the flat book row:

```
// A volume inside a horizontal stack cannot rise without entering the one
// above it, so this one family retains a small forward pull.
const FLAT_LIFT: [number, number, number] = [0, 0, 0.07];
```

The RISE was banned for this family and the ROTATION was not, so ADR 0020
walked straight back into the collision the ban was written for — and with
more travel than the rise ever had.

| prop                   | depth | gap above | rise at its band's lean | verdict                                           |
| ---------------------- | ----- | --------- | ----------------------- | ------------------------------------------------- |
| flat book (row volume) | 0.240 | 0.000     | 0.052 at TIP            | punches a whole book height through its neighbour |
| Musings paper stack    | 0.465 | 0.000     | 0.137 at flutter        | sweeps the sheets through the pen lying on them   |

The About reading fan had already hit this and solved it locally, before ADR
0020 existed: `tiltOnHover={false}` plus a hand-authored lane per book, with
the comment "the shared hinged nod makes this tightly fanned trio swing through
its neighbors." So there were two independent prior findings in the tree and I
read neither before raising the angle.

### The fix

Measured, not a list of stacked call sites. The same bug `hingeShift` describes
as having "regrown in eleven places", and the twelfth would be authored by
someone who never read any of this.

- `clearanceAbove` (interaction.ts) measures the air above a prop in its own
  frame, scanning sibling subtrees up to four levels — enough to reach past a
  Grabbable's nod/impulse/carrier nesting. It stops at the first scope that
  finds anything, runs once per prop on first hover, and uses the same filters
  as `meshBoxInLocal` (visible meshes, no sprites, honours `physicsIgnore`).
- `Hinge` now carries `swingHeight`, `depth` and `headroom`.
- `leanBudget` (leanClearance.ts) fits the lean into the room: lean as asked,
  lean as far as it fits, or trade the lean for a slide toward the viewer.
  Never both.
- Applied in all three shells — `Grabbable`, `Lift`, `ModelProp`. The slide
  rides the same spring the lean would have, so a book pulled out of a stack
  overshoots and settles exactly as its neighbour in the open tips and settles.
- `ModelProp`'s vertical RISE is now gated on headroom too, for the same
  reason `FLAT_LIFT` gated it by hand.

Numbers it produces: the flat book slides 0.052 (22% of its depth); the paper
stack slides 0.070, the absolute cap, and the pen keeps its footing on the
sheets the whole way rather than being left in mid-air.

### Judgement calls this round

**"Is something RESTING on me", not "is something taller than me nearby".** An
occluder has to both reach above the prop's top face and BEGIN within 0.01 of
it. Without that second test an upright book standing beside a flat stack —
floor to well above, and overlapping through the row's stagger — reads as a lid
and silences a prop with nothing on it at all.

**The slide has two caps: a quarter of the prop's own depth, and an absolute
`0.028 * HOVER_MOTION_SCALE`.** The proportional one keeps the gesture reading
the same on props an order of magnitude apart; the absolute one exists because
a quarter of the paper stack's depth is 0.116, which would hang it well off the
front of the shelf.

**`HOVER_MOTION_SCALE` moved from `Lift.tsx` to `interaction.ts`,** re-exported
from Lift so no call site changed. `leanClearance` needs the dial and `Lift`
needs `leanClearance`; the cycle evaluated the constant to NaN, silently, and
only a test that asserted the dial relationship caught it. It now sits beside
`HOVER_MAX_SIZE` and `TILT_MAX_SIZE`, the other two scene-wide hover constants.

**The About reading fan keeps its bespoke lanes.** The derived answer pulls
straight toward the viewer; that stack peels its outer books sideways into
separate lanes, which is better for three overlapping jackets than one lane
they would all take at once. Pinned by a test so it is a decision rather than
an oversight.

**A prop that leans a REDUCED amount gets no slide to make up the difference.**
Simpler, and one gesture. It may read as slightly under-powered on a prop with
partial headroom; no such prop is known to exist yet.

### Bug the tests caught in my own work

**The rise is not monotonic.** `maxLeanForRise` inverts the rise analytically,
and a round-trip test failed on a tall prop: the rising corner climbs to a peak
and comes back down, so on a 2.7-unit monstera two different leans clear the
same height — and the larger one got there by passing THROUGH the ceiling.
`asin` returning only the principal branch is the correct behaviour, because
the whole swing has to stay clear and not just its endpoint. Documented and
pinned.

### Still open from this round

- The pen's own lean is untouched (nothing is stacked on a pen), and at
  flutter's 17.2 degrees it lifts one end about three pen-diameters off the
  paper. Not a collision. Whether a rigid pen belongs in the band designed for
  a sticker and a die is a taste call I have not made.
- The slide moves the geometry that owns hover. That is the loop the About fan
  needed a static hit volume for. It should be safe here because the travel is
  small and toward the camera, which keeps the surface under the cursor, but it
  is the thing to watch on the live scene.
- `clearanceAbove` walks up to four ancestor levels. If a future shell nests
  deeper, a stacked prop silently goes back to leaning. There is no assertion
  for that; the census would show it as a `tip` row on a stacked prop.

### Verification

`yarn test`: 1410 of 1414. All four failures belong to the peer session —
`freeRoamControls.presentation.test.ts`, `scenePerformance.presentation.test.ts`
(a `focusRange` line expected in `Effects.tsx`), `canvasCompositing.test.ts` (a
`gl={{ antialias: true }}` line expected in `StacksCanvas.tsx`) and
`BootScreen.test.tsx` (the peer's new `ABOUT_LOWER_AWARD_SCALE` moved the four
lower-shelf keepsakes 1.2x and their golden dimensions have not caught up).
TypeScript, ESLint and Prettier clean across every file I touched.

## Round 5 — the first six Signature Reactions

### The mechanism

`archetypeFor` gains a seventh value, `"signature"`, resolved BEFORE every
derived rule (an override that lost to the prop's weight would never fire).
`bandMotionFor("signature")` is zero on every channel. Call sites declare it
with `signature="<gesture>"` on the Grabbable; `SIGNATURE_REACTIONS` is the
list; `signatureReactions.presentation.test.ts` checks it against reality.

| prop        | gesture | owner                        | was                                    |
| ----------- | ------- | ---------------------------- | -------------------------------------- |
| trophy      | glint   | `Glint` (UnitProjects)       | glint **and** nod                      |
| tea cup     | steam   | `SteamCup` (eggs)            | steam **and** nod                      |
| shakers ×3  | slosh   | `ShakerProp` (AuthoredProps) | click burst, then nothing              |
| basketball  | roll    | `RollProp` (eggs, new)       | nod about an edge a sphere has not got |
| globe       | spin    | `SpinProp` (eggs)            | idle drift **and** nod                 |
| alarm clock | shiver  | `EggClock` (eggs)            | face egg **and** nod                   |

### The finding

**All six were already double-answering.** The shortlist was written as "props
that do nothing on hover" and that was wrong about every one of them. Each is a
composed registration — an egg or a character component sharing one hoverKey
with a Grabbable — so the prop did its own thing AND took the shared lean off
the same pointer.

I got this wrong twice while writing it. I filed the globe and the alarm clock
as replacing "silence"; both are Grabbables at 1.4 kg and 0.45 kg and both were
nodding 12.9 degrees. The inverse guard in the test — "anything marked as
replacing silence must not be on a Grabbable" — caught both.

Which means these six lost a reaction as well as gaining one. **If the scene
reads quieter after this round rather than more characterful, this is the list
to look at first.**

### What each does

- **glint** — untouched. It was already there and already owner-tuned; the
  only change is that the nod on top is gone. A trophy pitched toward the
  camera rolls off the very highlight the glint exists to sweep across it.
- **steam** — a held plateau term added beside the click's decaying puff, so a
  click still lands on top of a hover. Peak opacity +55%, size +20%.
- **slosh** — two slow sinusoids a fifth apart, 2.6 degrees of roll. NOT
  `shakerPose` run slowly: that curve is a hand shaking a bottle and in slow
  motion it just looks like the same gesture in treacle. The click's hard
  600 ms shake still owns the group outright while it runs.
- **roll** — new `RollProp`. Turns in place about a canted horizontal axis so
  the seams sweep across the visible face rather than around the rim.
- **spin** — the globe's authored 0.11 rad/s drift goes to 4x while hovered,
  eased in and out. A lap every fourteen seconds.
- **shiver** — two frequencies (47 and 71 rad/s) at 0.011 rad and 1.1 mm. A
  bell housing rattling in place. Gated on `faceStyle === "alarm"` rather than
  a new flag, so the grandfather clock cannot inherit it.

### Judgement calls

**Held Rate.** Four of the six answer with a changed rate rather than a changed
pose. The Held Pose contract exists because Touch Focus has no timeout, and a
rate satisfies it — parking a globe at an angle would stop the one thing a
globe does. Added to `CONTEXT.md` as its own term rather than quietly widening
Held Pose.

**The basketball does not return to its authored pose.** Alone in the scene. A
ball that rewound every time you looked away would be the one obviously fake
thing on the shelf.

**`signature` is a call-site flag, not derived.** Same honest limitation as
`metal`. There is nothing measurable about a prop that reveals it has a
character component wrapped around it.

**Signatures keep their own reaction under reduced motion.** Every one of these
components already reads `prefers-reduced-motion`; swapping a steam plume for
the generic brighten would be a downgrade rather than an accommodation.

**The shiver group now wraps the clock FACE as well as the case.** It did not
at first, which would have left the dial hanging still while the housing
trembled — and the dial is the part of a clock anyone looks at.

### Open

- None of the six has been seen running. Six gestures, all tuned by argument.
- The remaining four (sailboat heel, harmonica breath, microphone live, phone
  wake) own no machinery. Each is design work rather than wiring, and worth
  doing only after these six are judged.
- `RollProp` rotates a child node, so a ball the physics solver is carrying is
  untouched and the roll resumes at rest. Untested against a live throw.
- Regenerated `aboutBootSilhouettes.ts`; the diff was exactly one line, the
  guard hash, so `signature` has no visual footprint — same check as `metal`.

### Verification

`yarn test`: 1449 of 1453. All four failures belong to the peer session —
`canvasCompositing.test.ts`, `freeRoamControls.presentation.test.ts`,
`scenePerformance.presentation.test.ts`, and `units/aboutReadingStack.test.ts`
(their test now expects a first-book x of 0.71 where the source still gives
0.745). TypeScript, ESLint and Prettier clean across every file I touched.

## Round 6 — first live look, and one rule applied too widely

Owner ran the scene. Six notes, and the two most useful ones broke a rule I had
just written.

### The rule was too wide

> "with the trophy i can't really tell there's glint. I also want the nod"
> "I can't tell the tea cup is doing anything"

Both are the two signatures that never move the prop. Standing the nod down
left them completely still in silhouette — the inert-prop failure this whole
workstream exists to remove, reintroduced by my fix for it.

`SignatureReaction` now carries a `channel`. `motion` (spin, roll, slosh,
shiver) stands the band down, because two movements at once is genuinely
incoherent. `surface` (glint, steam) keeps it — which is what the shimmer band
already does to the medals, sweeping a highlight while tilting the face to
catch it. I had the principle right and drew the line in the wrong place.

### Amplitudes

| prop        | change                                                                         |
| ----------- | ------------------------------------------------------------------------------ |
| trophy      | envMapIntensity 3.6x → 4.6x, roughness → 0.08, **plus emissive**, nod restored |
| tea cup     | plume +55%/+20% → **+115%/+42%**, nod restored                                 |
| alarm clock | 0.011 rad → 0.026, two channels → three, one vertical                          |
| globe       | hover spin 4x → **9x**, a lap every 6.5 s                                      |
| basketball  | rebuilt, see below                                                             |

**The trophy has now been amplified three times across three rounds and the
owner still could not see it.** Worth stating plainly: every increment was a
change in what a small dark brass cup MIRRORS, competing with whatever the
probe puts behind it. Reflectance was never going to carry it. The fix is a
different channel — emissive, light the prop makes itself. Safe only because
`atlasOverride` clones the trophy's material.

**The steam is the same shape of problem.** The cup steams `always`, so a hover
is a delta on something already moving. The click's burst gets away with +70%
because it also ARRIVES; an onset is legible where a level is not.

### The basketball bug

> "it just slowly rotates into the bottom shelf haha"
> "should do a 360 spin from the center and bounce up a bit"

Exactly right, and the diagnosis was in the complaint. `RollProp` turned the
ball about a canted HORIZONTAL axis through the group's origin — which on a
Grabbable is the contact point on the plank, not the middle of the ball. So it
swung on a 0.33-unit arm. At half a turn the ball's middle sits a full radius
under the wood; the test asserts that arithmetic, because a screenshot of a
sphere cannot show it.

Rebuilt as two fixes: the pivot is the measured centre of the subtree box,
pinned with the same identity `hingeShift` uses; the axis is vertical, so every
revolution is a real 360 and a centred ball cannot sweep through anything. The
hop rides the scene's spring at flutter damping (one overshoot) and its height
is capped by `clearanceAbove` — the same measurement that keeps a stacked book
out of its neighbour.

### Round 6b — the emissive was a white cut-out

Owner screenshot: the trophy rendering as a flat cream silhouette. "wtf is this
lmao". Correct reaction; two mistakes, both of them predictable from notes
already in this repo.

**Amount.** Additive light COMPOUNDS in the scene's linear HDR pipeline — the
v4 bloom work landed on ×0.45 where ×1.3 had been assumed — so 0.55 of added
radiance is not a highlight, it is a white clip after ACES.

**Channel.** Emissive is added per-fragment regardless of the normal. It does
not brighten a form, it ERASES one. Every bit of shading that made the cup read
as a solid went with it. Whatever a glint is, it is not uniform.

Reverted to the owner-approved 1 → 3.6 / 0.35 → 0.13, no emissive. The
legibility the emissive was reaching for now comes from the nod instead, which
is the actual fix from earlier in the same round: `glint` is a SURFACE
signature, so the trophy keeps its band and moves. The complaint was that the
trophy did nothing, and reflectance was never the channel that was going to say
otherwise against a green meadow.

**The tea cup was one file away from the same bug.** Its wisps blend ADDITIVELY
in the dark theme and nine of them overlap, so the +115% opacity I had just set
was radiance that compounds. Re-split: opacity +60%, size +55%. A bigger plume
reads as more steam; a brighter one reads as a lamp and then clips.

Both are now pinned by tests, because both were caught by looking rather than
by anything automated.

### Round 6c — the spin fought the physics

> "the basketball should stop spinning pretty quickly once actually grabbed cuz
> it messes with the physics"

Real, and not cosmetic. `RollProp` writes a CHILD of the Grabbable's carrier
while the solver writes the carrier itself, and the collider is built by
walking that subtree — so a ball still turning in hand is a ball whose hull is
being remeasured mid-flight. The hop is worse: it is a vertical offset, so a
spinning, hopping ball sits proud of the hand holding it.

Two guards, because a grab is not the only way this prop leaves the shelf.
`dragging` catches the carry; a carrier quaternion away from identity catches
everything the solver owns after that — the throw, the tumble, and the landing.

Spin-down now depends on WHY it is stopping. A pointer leaving is a ball
coasting (lambda 4, ~0.75 s); a hand closing on it is a ball being stopped
(lambda 18, ~0.17 s). The hop goes past critical damping while held, because
overshooting back down through the palm is the same fight in the other axis.

**Deliberate trade, worth a second opinion.** A ball thrown across the room and
settled askew will not spin under the pointer again until it is parked back at
its authored pose. That is the safe half of the trade rather than the pretty
half: the alternative is deciding when a physics-owned prop is "at rest enough"
to animate, which is the judgement that produced this bug in the first place.

### Open

- The globe's hover spin is now nearly as fast as its click gesture. Accepted
  deliberately: it makes the click read as "again, harder" rather than as the
  only thing the globe does. Worth a look.
- The trophy's glint is back to the values that were already there before this
  workstream. If it still reads as nothing with the nod restored, the next move
  is not more amplitude on this material — three rounds have established that
  reflectance has nowhere to go here. It would be giving the cup something to
  catch, or retinting it so a highlight has contrast to appear against.
- Nothing else in this round has been seen running either.

### Verification

`yarn test`: 1469 of 1473. All four failures belong to the peer session:
`canvasCompositing`, `freeRoamControls`, `scenePerformance` and
`units/aboutReadingStack`. Their `coordinationGlobe` pair went green during the
round and the reading-stack one came back — they are landing as they go. TypeScript,
ESLint and Prettier clean across every file I touched.

## Landing this: why there is still no commit

The tree cannot be split. The peer session has ~80 modified files and several
new untracked ones, and the overlap is inside individual files rather than
beside them:

- `ModelProp.tsx` +389/-34, of which a 184-line `deskLampShadeGlow` /
  `articulateDeskLampHead` block is theirs.
- `Grabbable.tsx` +297/-41, carrying their `hoverTiltAngle` and `onDragIntent`
  work interleaved with mine.
- `UnitAbout.tsx`, `interaction.ts`, `eggs.tsx`, `UnitProjects.tsx`,
  `UnitBlog.tsx` all mixed.
- `units/ProjectArtifacts.tsx` is an untracked file of theirs that I added
  `metal` to.

`git add` stages whole files, and interactive staging is unavailable here. So
any commit I make either sweeps in a large amount of half-finished peer work
(including the four failing tests above) or omits the files that make my own
change compile. Neither is a commit worth having.

Instead the work is backed up whole, outside the repo:

```
~/Desktop/Agents/stacks-hover-archetypes/2026-08-20-round4/
  base-commit.txt        the HEAD it applies to
  modified-files.patch   my diff to the twelve shared files
  new/                   the eleven files that are only mine
```

Refreshed as of round 5. The real fix is for the peer session to land its work
first; then mine applies cleanly on top.
