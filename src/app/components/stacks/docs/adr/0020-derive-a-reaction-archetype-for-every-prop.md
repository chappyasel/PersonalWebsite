# Derive a Reaction Archetype for every prop

Every prop in the scene answers a pointer with the same gesture: a 0.12 radian
camera-facing nod about its supporting edge, on one damping curve, whatever the
object is. That uniformity was deliberate and it is undocumented outside a
comment in `Lift.tsx`, which records that it replaced an earlier state where
each call site invented its own response and the resulting set looked
arbitrary. It over-corrected. A 60 kg barbell nods exactly as far and as fast
as a 6 g sticker, a basketball tilts about a support edge a sphere does not
have, and the props that already own a characteristic behavior, the tea cup's
steam and the shakers' shake and the alarm clock's face, ignore it in favor of
the shared nod.

Every prop will instead have a Reaction Archetype, derived in order from data
the prop already carries: foliage collider profile, then metal material, then
measured world size against the furniture cutoff, then authored mass. A call
site may override the derived archetype by name, and that override is a
Signature Reaction, reserved for a gesture no rule could infer. Every
archetype, derived or signature, resolves to a Held Pose.

Deriving rather than declaring is the part that matters. It is what keeps this
from decaying back into the arbitrary set the shared nod was built to fix: the
rule reaches every prop including ones nobody thought about, a new prop is
right by default, and the overrides stay a short reviewable list rather than
the mechanism. This is the same shape as `DRAGGABLE_RULE`, and for the same
stated reason.

## Considered options

- **Keep the one shared gesture and only raise its amplitude.** Cheapest, and
  it fixes the separate complaint that the response is too subtle. Rejected
  because a louder wrong gesture is still the wrong gesture, and the objects
  that read worst under it are the ones with the most character.
- **Declare an archetype at all ~95 call sites with no derived default.**
  Rejected: this is the hand-authored list the draggability rule already
  rejected once, and it makes forgetting a prop the default outcome.
- **Derive with no overrides at all.** Rejected: mass cannot tell a basketball
  from a book. Both sit at 0.62 kg. Without overrides the four props that
  prompted this stay generic.
- **Fire a one-shot gesture and return to rest.** More physically honest, and
  rejected anyway: Touch Focus has no timeout, so a prop would sit visibly
  inert while it is still the selected prop.
- **Split behavior by pointer type,** one-shot on a fine pointer and held under
  Touch Focus. Rejected: two paths and two test sets per archetype, and ADR
  0011 keeps presentation and interaction deliberately independent.

## Consequences

- Mass mis-sorts foliage, so foliage is classified before mass is consulted.
  Eight plants carry `colliderProfile="foliage-base"`; the Systems sansevieria
  does not, and either gains the tag or the rule needs a fallback.
- `HoverResponseSpec.kind` in the interaction registry stops being metadata
  nothing reads and becomes the override channel.
- Archetypes are CPU-side per-frame work, so they scale on the content axis of
  ADR 0019, not on resolution or effects.
- Reduced motion collapses an archetype to its non-motion channel rather than
  to nothing, so the affordance survives `prefers-reduced-motion`.
- Holding a static pose rather than animating is what preserves the settled
  hover suspension; an archetype that never settles would hold the frame loop
  open for every hovered prop.
- Every band states its peak rotation as a base times `HOVER_MOTION_SCALE`.
  The scene has one legibility dial and a band written as a bare number
  silently opts out of it, which is a bug that has now happened twice: both
  the sway band and the first cut of the mass bands hardcoded their angles, so
  turning the world up moved the books and left the plants and the iron where
  they were. Rotation scales with the dial; the damping lambdas do not,
  because the dial's contract is that props move further, not more abruptly.
- The nod leans a prop's top TOWARD the camera by its full authored angle,
  using `cameraSideHoverTilt`. It previously used `cameraFacingHoverTilt`,
  which is a face-showing solver: it returns the camera's ELEVATION over the
  prop with the constant as a ceiling. On this camera (y 0.25, z 5.8) that
  meant a top-shelf prop tilted 2.1 degrees whatever the constant said, a
  lower-shelf one 10.9, and only floor props ever reached the cap, so two
  rounds of raising the constant moved almost nothing. It also leaned the top
  AWAY from a camera sitting above, pivoting on the rear edge so the front
  lifted off the plank, which reads as recoiling rather than answering.
  `cameraFacingHoverTilt` is kept for a signature reaction on a flat prop that
  genuinely wants to show its face.
- Rotation and translation are raised by different amounts on purpose. A
  translation can walk a prop off its plank: the lower shelf's front edge sits
  at z = 0.22 and the largest authored push is the flat book row's 0.07, which
  the dial multiplies. Rotation was raised further on the grounds that a tilt
  pinned to a contact edge by `hingeShift` has no ceiling. **That was wrong,
  and it is corrected below.**
- **A lean has a ceiling too, and it is measured.** `hingeShift` pins the edge
  UNDERNEATH; nothing was watching the rising end of the arc, and the props
  that stack have no room there. A flat book row carries each volume on the
  one below it with a gap of exactly zero — `FLAT_LIFT` beside it had already
  banned the vertical rise on this family for that reason — and 12.9 degrees
  on a 0.24-deep board lifts the rear corner 0.052, a whole book height,
  through its neighbour. The Musings paper stack does the same to the pen
  lying on it, with 0.137 of sweep. `hingeFor` now measures the air above a
  prop (`clearanceAbove`) and `leanBudget` fits the lean into it.
- **A lean with nowhere to go becomes a pull toward the viewer**, of the same
  travel, rather than nothing. Silence is the failure this ADR exists to
  remove, so a blocked prop changes channel instead of going quiet: it slides
  out of its stack the way a person pulls a book out, along the one axis a
  prop on a shelf reliably has air in. This is not invented — `FLAT_LIFT`
  chose exactly this substitution in translation, and the About reading fan
  chose it bespoke (`tiltOnHover={false}` plus a hand-authored lane per book)
  when its trio "swing[s] through its neighbors". The rule is those two
  answers, derived. A prop never leans AND slides; that would read as two
  effects rather than one gesture.
- The clearance test asks "is something RESTING on me", not "is something
  taller than me nearby". Without that distinction an upright book standing
  beside a flat stack silences a prop with nothing on it at all.

## Signature Reactions, first six (2026-08-20)

`archetypeFor` gains a seventh value, `"signature"`, resolved BEFORE every
derived rule — an override that lost to the prop's weight would never fire.
`bandMotionFor("signature")` is zero on every channel: the prop's own component
is the whole answer, not a second one layered under the shared nod. Call sites
declare it with `signature="<gesture>"` on the Grabbable, and
`SIGNATURE_REACTIONS` in `reactionArchetype.ts` is the list, checked by
`signatureReactions.presentation.test.ts` against the props that actually
exist.

| prop        | gesture | owner                        | was                                    |
| ----------- | ------- | ---------------------------- | -------------------------------------- |
| trophy      | glint   | `Glint` (UnitProjects)       | glint **and** nod                      |
| tea cup     | steam   | `SteamCup` (eggs)            | steam **and** nod                      |
| shakers ×3  | slosh   | `ShakerProp` (AuthoredProps) | click burst, then nothing              |
| basketball  | roll    | `RollProp` (eggs)            | nod about an edge a sphere has not got |
| globe       | spin    | `SpinProp` (eggs)            | idle drift **and** nod                 |
| alarm clock | shiver  | `EggClock` (eggs)            | face egg **and** nod                   |

**Every one of the six already had a nod.** The shortlist was written as "props
that do nothing on hover" and that was wrong about all of them: each is a
composed registration, an egg or a character component sharing one hoverKey
with a Grabbable, so the prop was doing its own thing AND taking the shared
lean off the same pointer. The globe and the alarm clock were both filed as
silent and both were nodding. An inverse guard in the test — "a signature
marked as replacing silence must not be on a Grabbable" — is what found it.

So the removal is the point, not a side effect. A trophy pitched toward the
camera rolls off the very highlight its glint exists to sweep across it, which
is the same argument the shimmer band makes about the medals.

**Held Rate.** Four of the six answer with a changed rate rather than a changed
pose: the globe turns four times faster, the cup steams harder, the shaker
rocks, the clock trembles. The Held Pose contract is about a prop still reading
as selected when Touch Focus has no timeout, and a rate satisfies it. Parking a
globe at an angle would stop the one thing a globe does. `CONTEXT.md` carries
the term.

**The basketball does not return to its authored pose.** Alone in the scene. A
ball that rewound to where it started every time you looked away would be the
one obviously fake thing on the shelf, so it keeps whatever angle it reached.

**Signatures keep their own reaction under reduced motion** rather than
collapsing to the generic brighten. Every one of these components already reads
`prefers-reduced-motion` — they had to, they were all animating before this ADR
— and swapping a steam plume for a brighten would be a downgrade rather than an
accommodation.

### Correction: surface signatures keep their band (2026-08-20)

The first cut stood the nod down for all six, on the principle that a prop
should answer once. Owner review found the hole immediately: "with the trophy i
can't really tell there's glint. I also want the nod", and "I can't tell the
tea cup is doing anything" — precisely the two signatures that never move the
prop.

The principle was right and applied too widely. Two MOTIONS at once is
incoherent. A surface change plus a lean is not; it is what the shimmer band
already does to the medals, sweeping a highlight while tilting the face up to
catch it. So `SignatureReaction` carries a `channel`:

- `motion` (spin, roll, slosh, shiver) — the band stands down.
- `surface` (glint, steam) — the prop keeps its band. Without it the prop has
  nothing to say in silhouette, which is the inert-prop failure this ADR exists
  to remove, reintroduced by the fix for it.

`archetypeFor` resolves the channel by gesture name, so a call site declares
one thing and the consequence is decided in the list. An unlisted gesture is
treated as motion: a quiet prop is a smaller failure than two gestures
fighting.

### Amplitudes after the first live look

| prop        | change                                                           |
| ----------- | ---------------------------------------------------------------- |
| trophy      | envMapIntensity 3.6x → 4.6x, roughness → 0.08, **plus emissive** |
| tea cup     | plume +55%/+20% → **+115%/+42%**, and the nod is back            |
| alarm clock | 0.011 rad → 0.026, two channels → three, one of them vertical    |
| globe       | hover spin 4x → **9x** (0.99 rad/s, a lap every 6.5 seconds)     |
| basketball  | rebuilt: see below                                               |

The trophy is the instructive one. Its glint has now been raised three times
across three rounds and the owner still could not see it, because every
increment was a change in what a small dark brass cup MIRRORS — competing with
whatever the environment probe puts behind it. The fix was a different channel:
emissive, light the prop makes itself. Safe only because `atlasOverride` clones
the trophy's material; the `userData.shared` guard is what stops the same write
reaching the mugs and clocks.

The steam is the same shape of problem. That cup steams `always`, so a hover is
a DELTA on something already in motion, and a half-again denser plume is
invisible beside one already rolling. The click's burst gets away with +70%
because it also ARRIVES — an onset is legible where a level is not.

### The basketball rotated itself into the shelf

The first `RollProp` turned the ball about a canted horizontal axis through the
group's origin — which on a Grabbable is the contact point on the plank, not
the middle of the ball. So it did not roll in place, it swung on a 0.33-unit
arm and buried itself in the wood. At half a turn the middle of the ball sits a
full radius UNDER the plank, which is asserted in the test as arithmetic.

Rebuilt as two separate fixes. The pivot is the measured centre of the
subtree's box, pinned by the same identity `hingeShift` uses. The axis is
vertical, so every revolution returns the ball exactly where it started —
continuous spin IS repeated 360s, legible while hovered and holding no strange
pose when it stops, and a vertical axis cannot sweep a centred ball through
anything. The hop rides the scene's spring at flutter damping so it overshoots
once, and its height is capped by `clearanceAbove` — the same measurement that
keeps a stacked book out of its neighbour.
