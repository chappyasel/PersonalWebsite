# Touch Focus reaction parity worklog

## Goal

Give an authored prop under Touch Focus the same Reaction Archetype or
Signature Reaction it gives a fine pointer, without copying unrelated desktop
hover behavior into touch input.

## Agreed behavior

- Touch parity applies to authored prop Reaction Archetypes and Signature
  Reactions.
- A new touch contact shows the Pickup Cue compression only.
- The full prop reaction starts after a stationary release establishes Touch
  Focus.
- An already focused prop keeps its reaction during the second activation tap.
- Carrying suppresses the prop reaction so animation transforms do not compete
  with the carry or physics paths.
- Environmental easter eggs, wildlife disturbance, Portal Labels, cursor
  feedback, and pointer arbitration keep their existing behavior.

The Stacks glossary and ADR 0020 already define Touch Focus, Reaction
Archetype, Signature Reaction, Held Pose, and Pickup Cue consistently with
these decisions. No new domain term or ADR is needed.

## Task list

- [x] Audit every scene read of `hovered` and classify its role.
- [x] Add one tested rule for prop-reaction engagement.
- [x] Migrate the generic `Lift` reaction.
- [x] Migrate the generic `Grabbable` reaction bands.
- [x] Migrate the six Signature Reactions.
- [x] Migrate authored prop reactions outside the signature list.
- [x] Confirm excluded hover behavior remains unchanged.
- [x] Run focused interaction and presentation tests.
- [x] Run TypeScript and ESLint checks.
- [x] Record final issues, shortcuts, and follow-up work.

## Audit inventory

| Area                                   | Classification                  | Intended change                                                                    |
| -------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| `Lift`                                 | Generic prop Reaction Archetype | Use hover or Touch Focus; keep press as scale compression only                     |
| `Grabbable` reaction bands             | Generic prop Reaction Archetype | Use hover or Touch Focus at rest; keep Pickup Cue separate                         |
| Trophy glint                           | Signature Reaction              | Add Touch Focus                                                                    |
| Tea steam                              | Signature Reaction              | Add Touch Focus                                                                    |
| Shaker slosh                           | Signature Reaction              | Add Touch Focus                                                                    |
| Basketball roll                        | Signature Reaction              | Add Touch Focus while preserving its carry and solver guards                       |
| Globe spin                             | Signature Reaction              | Add Touch Focus and suppress while carried                                         |
| Alarm clock shiver                     | Signature Reaction              | Add Touch Focus                                                                    |
| Metal desk-mark shimmer                | Authored prop reaction          | Add Touch Focus                                                                    |
| About reading-book fan                 | Authored prop reaction          | Add Touch Focus while preserving authored-pose and carry guards                    |
| Coordination globe                     | Existing bespoke prop system    | Already supports hover and Touch Focus; leave its deliberate carry behavior intact |
| Skyline eggs                           | Environmental easter eggs       | Excluded                                                                           |
| Butterflies and wildlife               | Ambient dependent response      | Excluded                                                                           |
| Pointer-over/out and click arbitration | Input ownership                 | Excluded                                                                           |
| Portal Labels and cursor changes       | Outcome and pointer feedback    | Excluded                                                                           |

## Judgement calls

1. The shared rule excludes `pressedInteraction`. The Pickup Cue already owns
   a new contact. Including press would flash the full reaction during a swipe
   that later wins Touch Arbitration.
2. A second tap does not stop the reaction because the prop remains under
   Touch Focus until activation resolves. Press may compress its scale, but it
   does not restart the held reaction.
3. The shared rule excludes the prop while it is `dragging`. The coordination
   globe remains a local exception because its network activity deliberately
   continues during carry and already implements that behavior explicitly.
4. Reduced-motion behavior remains owned by each existing reaction. This
   change only unifies the interaction signal and does not add a new visual
   effect or quality path.

## Issues found

- Generic `Lift` and `Grabbable` reactions currently include
  `pressedInteraction`, so a first touch starts more than compression.
- Several reaction comments promise Touch Focus behavior while their code
  reads `hovered` only.
- The settled-prop performance guard names its input `hovered`, although the
  relevant condition is whether a prop reaction is engaged. The name can
  remain local if the call passes the correct combined state; renaming the
  performance API would add unrelated churn.
- `Lift` stops its frame work after settling. Once press and reaction became
  separate channels, a long press could settle at the compressed scale and
  fail to wake on release. It now tracks press and reaction as separate bits,
  so the press-to-focus handoff always wakes the full reaction.

## Shortcuts and constraints

- No browser or screenshot inspection will be performed. Project instructions
  require explicit approval for browser-based testing, so verification is
  source-based and test-based.
- No new debug control is planned because this is parity for existing effects,
  not an optional rendering path.
- No ADR is planned because ADR 0020 already records the hard-to-reverse
  decision. This change repairs implementation drift.

## Verification

- `yarn tsc --noEmit`: passed.
- ESLint on every changed TypeScript file: passed with no warnings.
- Full `yarn lint`: passed with no errors. It reports one existing warning in
  untouched `reactionArchetype.test.ts` for an unused `LIFT_LAMBDA` import.
- Focused touch, architecture, signature, shimmer, and About interaction set:
  98 tests passed across 7 files.
- Focused Lift, clearance, reaction-archetype, and sway set: 84 tests passed
  across 7 files.
- Broader Stacks run with known baseline failures excluded: 1,335 tests passed
  across 155 files.
- `git diff --check`: passed.

The unfiltered Stacks run has six failures in untouched code. Inspection
against `HEAD` confirms the asserted source was already out of sync before
this change:

1. `scenePerformance.presentation.test.ts` expects a literal `2.2`, while
   `Effects.tsx` uses `SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE`.
2. `freeRoamControls.presentation.test.ts` expects
   `setStacksSheetDismissed` in `PlacardLayer.tsx`.
3. `canvasCompositing.test.ts` expects `gl={{ antialias: true }}`, while
   `StacksCanvas.tsx` also specifies `stencil: true`.
4. `aboutReadingStack.test.ts` expects an x position of `0.71`, while the
   authored `HEAD` value resolves to `0.745`.
5. `aboutBootSilhouettes.test.ts` reports a stale TJ medallion source hash.
6. `musingsPaperPhysics.test.ts` reproducibly settles below its expected shelf
   height. It exercises the physics world directly and does not enter the
   reaction-engagement path.

## Follow-up review

- Decide whether to repair the six unrelated baseline failures in a separate
  change. They were not changed here because doing so would mix test and scene
  maintenance into touch parity.
- A visual pass on a real touch device remains useful for judging reaction
  amplitude and second-tap target stability. It requires a separate explicit
  request under the repository's browser-testing rules.
- If the settled-prop API is edited later, rename its local `hovered` input to
  `reactionEngaged`. The current call is correct, but the old name now hides
  the combined hover and Touch Focus meaning.
