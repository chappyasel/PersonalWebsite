# Green baseline, 2026-08-21

Task ledger for restoring a truthful delivery baseline on `site-green-baseline`,
branched from `main` at `3055138`. Amended after review; the amendments are
called out where they changed an earlier decision.

## Objective and scope

Get the repository back to a state where a green local run and a green CI run
mean the same thing, without redesigning anything a visitor can see.

In scope: the six failing unit tests, the lint warning, the generated artifacts
the repository's own freshness checks demand, verification entry points, and the
workflows that report on all of it.

Out of scope: visual or product changes, branch-protection settings, the wider
source-shape test problem (that belongs to the test-contract branch), anything
that needs a production build to be honest.

## Baseline evidence

Reproduced in this worktree, not taken on trust. Fresh `yarn install
--frozen-lockfile` first; the worktree had no `node_modules`.

| Check | Result at `3055138` |
| --- | --- |
| `yarn test` | 6 failed, 1531 passed (195 files) |
| `yarn tsc --noEmit` | 8 × TS2307 before typegen, clean after |
| `yarn lint` | 8 errors before typegen, 1 warning after |
| `yarn check:home-og` | fail: input digest moved |
| `yarn check:meadow` | pass, 115942 assertions, 0 failures |
| `yarn build` | cannot run here: no `.env` |

### The eight TypeScript errors were an environment artifact, not a code defect

`yarn tsc --noEmit` reported `Cannot find module 'public/images/about/profile.jpg'`
and seven siblings in `Projects.tsx`. Those modules are declared by
`next/image-types/global`, which reaches the compiler through `next-env.d.ts`.
That file is gitignored, written by `next dev` or `next build`, and therefore
absent in a fresh worktree and present in one that has been run. The same
absence turned the same imports into eight
`@typescript-eslint/no-unsafe-assignment` errors, because the type-aware rules
were reading `error`-typed values.

So the coordinator's baseline ("TypeScript passes; lint has one unused-import
warning") was measured on a worktree that had already run the dev server, and
mine was measured on one that had not. Both readings were correct. The
disagreement was the finding.

`next typegen` writes `next-env.d.ts` and `.next/types/routes.d.ts` in about two
seconds without a build. It loads `next.config.js`, which validates env, so it
needs `SKIP_ENV_VALIDATION=1`.

### The six test failures

| Suite | Test | Diagnosis |
| --- | --- | --- |
| `aboutBootSilhouettes` | stays synchronized with the exact source GLBs | False contract |
| `canvasCompositing` | keeps the scene backdrop reachable through the canvas alpha channel | Brittle expectation |
| `freeRoamControls` | hides the mobile sheet on entry and lets H toggle it | Brittle expectation |
| `scenePerformance` | isolates browser glass and each expensive post effect | Brittle expectation |
| `aboutReadingStack` | authors three grounded books turned 40 degrees toward the lamp | Wrong literal, committed wrong |
| `musingsPaperPhysics` | fast tilted release on the lower shelf | Behavior drift, a real tunnelling bug |

Five of the six were introduced by one commit, `489c84e feat(stacks): ship
complete scene update`. Four of those five have never passed: I checked out
`489c84e` in a scratch worktree and ran them there.

**canvasCompositing.** Asserted the literal string `gl={{ antialias: true }}`.
`489c84e` added `stencil: true` inside that literal for the composer's stencil
buffer. The test's own comment says what it is defending: the context keeps its
alpha channel so the CSS backdrop shows through a missed composite. Antialiasing
is incidental and the stencil buffer is irrelevant to it.

**freeRoamControls.** Asserted `PlacardLayer.tsx` contains
`setStacksSheetDismissed(`. `489c84e` changed the call site
`setDismissed={setMobileDismissed}` to `setDismissed={setStacksSheetDismissed}`,
handing the store setter down as a value. Same store, same behavior, no open
paren.

**scenePerformance.** Asserted `focusRange={golfFocused ? 16.5 : 2.2}`. The
shelf falloff moved behind `SHELF_DEPTH_OF_FIELD_FALLOFF_RANGE`, which is
`2.2 - SHELF_DEPTH_OF_FIELD_CLEAR_RADIUS`. That is 1.15 of falloff after a 1.05
clear band, still 2.2 units to full blur, and the look did not change.

**aboutReadingStack.** `CURRENT_READING_BASE[0]` is
`ABOUT_BOOT_LANDMARKS["reading-stack"].x - 0.21`. `489c84e` moved that landmark
from 0.51 to 0.955, making the value 0.745, and in the same commit wrote
`toBeCloseTo(0.71, 10)` into the test. 0.71 corresponds to no landmark value
this file has ever held. The composition is right: a passing assertion further
down the same file requires the three-book fan's mean x to equal the landmark,
and it does.

**aboutBootSilhouettes** and **musingsPaperPhysics** each get their own section.

## The silhouette contract was false in both directions

First pass, I regenerated the file and moved on. That was wrong, and the review
was right to send it back.

The generator hand-recreated the TJ medallion in `tjMedallion()`: a barrel
cylinder, two struts, a rim disc, a yaw and a scale, all typed out a second time
from `TJMedallionBody` in `AuthoredProps.tsx`. It then hashed the whole of
`AuthoredProps.tsx` and stored that as the silhouette's freshness key. That
fails both ways:

- Edit any unrelated prop in `AuthoredProps.tsx`, which is 385 lines holding
  several props, and a medallion test fails for a shape nobody touched. This is
  what actually happened, and my first pass "fixed" it by writing down the new
  hash.
- Edit the medallion's numbers in only one of the two places and nothing fails
  at all. The runtime and the traced outline drift apart silently, which is the
  failure mode the check was supposed to exist for.

`src/app/components/stacks/scene/tjMedallionGeometry.js` now holds the shape
once: `TJ_MEDALLION_SOLIDS`, `TJ_MEDALLION_FACES`, `TJ_MEDALLION_POSE`, a
`tjMedallionSpecSignature()` over all of it, and `tjMedallionSolidGroup(THREE)`
which builds the posed group. `AuthoredProps.tsx` renders from the same arrays
and keeps only the finishes, which cannot change an outline. The generator
imports the builder rather than retyping it. Freshness is keyed to the
signature, so it tracks the numbers and ignores comments, formatting, and
neighbouring props.

The builder takes `THREE` as an argument instead of importing it, so the scene
bundle gets the numbers without the builder pulling anything in.

Evidence that this is a real derivation and not a rename:

- Regenerating from the shared spec reproduced every committed silhouette byte
  for byte. All seven traced paths and all seven viewBoxes are identical to the
  hand-copied output, which is what proves the extraction is faithful.
- Changing one number in the spec (rim radius 0.15 to 0.19) moves the generated
  output: viewBox `[0,0,187,222]` becomes `[0,0,211,222]` and the traced path
  goes from 271 characters to 223. Three tests fail on that change: the
  freshness digest, the medallion-specific digest check, and the envelope
  prediction. Restoring the number restores the exact committed output.
- Running Prettier across the spec file changed its bytes and did not change the
  digest, because the signature covers values rather than text.
- Rewriting `AuthoredProps.tsx` to consume the spec, a substantial edit to that
  file, left the medallion digest untouched. The false trigger is gone.

`tjMedallionGeometry.test.ts` carries the regression the review asked for. It
predicts the committed viewBox from the specification through the same raster
envelope the generator uses, then widens the rim and asserts the prediction
moves. It also asserts both coplanar faces sit inside the rim's circle, which is
what licenses the generator to trace the solids alone and still be complete.
`aboutBootSilhouettes.test.ts` now branches on a `sourceKind` field the generator
emits: `file` entries hash their bytes, the one `spec` entry hashes the
signature, and a dedicated test asserts the medallion's digest is not a hash of
`AuthoredProps.tsx`.

The generator also self-checks: it throws if its rasterised envelope ever
disagrees with the front elevation the shared module derives.

### The pose was still duplicated

Caught on the second review pass. Solids and faces were shared, and the pose
was not. `ABOUT_TJ_LIGHT_YAW` in `aboutCoordinationLayout.ts` was its own
`-0.28`, and the `tj-medallion` landmark's `sceneScale` was its own
`0.66 * ABOUT_AWARD_SIZE_INCREASE`. `UnitAbout.tsx` reads both. So the scene
could have been turned or resized with the outline still traced at the old
pose, which is the same false contract in smaller print: signing a pose nothing
in the runtime reads.

They had already drifted. `0.66 * 1.1` is 0.7260000000000001 and the
specification claimed 0.726, which is why the existing landmark assertion used
`toBeCloseTo` rather than `toBe`.

`TJ_MEDALLION_POSE` is now the single source. `ABOUT_TJ_LIGHT_YAW` is
`TJ_MEDALLION_POSE.yaw` and the landmark's `sceneScale` is
`TJ_MEDALLION_POSE.scale`. The scale keeps its award-group meaning: the
specification carries the two factors, and a test pins the product to the live
`ABOUT_AWARD_SIZE_INCREASE` with `toBe`, so resizing the award group fails there
and forces a retrace rather than drifting quietly.

Regenerating moved only the digest, from `abdd865b` to `bdffd478`, because the
signed scale is now the exact runtime float. The traced path and viewBox are
unchanged, as expected: the raster normalises to its own bounding box, so a
uniform scale cancels. The yaw does not cancel, and a test shows that too.

Four tests carry it, each verified by breaking the tie and watching them fail:

| Perturbation | Result |
| --- | --- |
| `ABOUT_TJ_LIGHT_YAW` back to its own literal | "poses the scene from the same values the digest signs" fails |
| Landmark `sceneScale` back to its own expression | same test fails |
| `ABOUT_AWARD_SIZE_INCREASE` 1.1 to 1.2 | "keeps the medallion sized with the other lower-shelf awards" fails |
| Either half of the pose changed in the signature | digest no longer matches the committed one |

## The physics bug

The test releases the Musings paper stack downward at 4 u/s, the module's
`DEFAULT_MAX_THROW` ceiling, and expects it to settle on the lower shelf. It
settled at local y = -0.2747 instead: the room floor. The paper had gone through
the shelf.

`physics.ts` already knows about this class of failure. `freeBodyStepPolicy`
exists to give a thin fast body a smaller step, and its comment says so: "Cannon
has no continuous collision detection. Bodies thinner than this moving more than
a metre per second need a smaller step so one integration cannot cross an
authored shelf plank before the narrowphase sees contact." The policy simply was
not small enough. At 4 u/s a 1/120 step advances 0.0333 units; the lower plank is
0.055 thick. The narrowphase got one contact frame, took about 1 u/s off the
body, and the next step put it clear underneath.

I measured it rather than reasoning about it. A sweep over 462 reachable release
states (seven hold heights × six tilts × eleven speeds, each driven through
`moveHeld` so only poses the held-collision probe actually accepts are tested)
tunnelled 27 states at a 1/60 frame delta and 28 at 1/120. Failures were
scattered, not thresholded. Drop 0.5 at 3.5 u/s fell through while the same drop
at 3.8 and 4.0 did not. That rules out a release-speed clamp as the fix.

The fix halves the thin-body step to 1/240 and doubles its substep budget to 4.
The sweep goes to 0/462 at both frame deltas. The thin tier's catch-up ceiling is
unchanged at 4 × 1/240 = 1/60 s of simulated time per frame, exactly what 2 ×
1/120 bought, so a late frame cannot spiral any further than it already could;
`physics.test.ts` now asserts that product directly. The cost is four narrowphase
passes instead of two, and only while a body thinner than 0.03 is moving faster
than 1 u/s, which is the fraction of a second after a throw.

### The committed regression matrix

The exploratory sweep was a scratch harness and is gone.
`musingsPaperTunnelling.test.ts` replaces it with eight release poses crossed
with both frame deltas: sixteen simulations, about 170 ms of test time. Every
row is a state measured to fall through under the old policy, and they span the
reachable range: resting height up to the full 0.81 of headroom under the top
plank, flat through 120° of tilt, and 2.5 u/s up to the 4 u/s ceiling.

Checked both ways. Against the shipped policy all sixteen pass. Against the old
`1/120 × 2` policy fifteen of the sixteen fail, the one survivor being hold 0.8 /
tilt 45° / 3.8 u/s at 60 Hz, which fell only at 120 Hz. The matrix is load
bearing rather than decorative.

The Playwright performance harness (`yarn test:performance:safety`) is not part
of this. It needs a build and a browser, so it stays an owner or manual
prerequisite.

### What the musings test actually drives

Its name promised a "fast tilted release": `moveHeld` to 0.3 above the plank at
120°, then a throw. One `moveHeld` call cannot get there. The held-collision
probe caps a call at twelve conservative steps, so the accepted pose is about
0.02 up and four degrees of tilt, a near-flat slab shoved straight down from
resting height. That is the case that broke, and it is worth keeping.

Driving the pose the name described (looping `moveHeld` to convergence) lands the
paper on the shelf at every speed, asleep, but face **down**. That is correct
for a sheet released past 90°, and a direct contradiction of the test's
`printedSide.y > 0.9`. There is no righting rule in `physics.ts`; the only one in
the codebase lives in `Grabbable.tsx`'s non-physics settling phase. Rather than
invent a contract the module does not own, I renamed the test to what it
verifies and wrote the reasoning above it. The new matrix carries the pose
coverage the old name implied.

## Two gates, and what each one means

The review's first amendment. `yarn verify` was folding a blocked artifact into
a code gate, which meant it could never go green on a correct branch, which
would have trained everyone to ignore it.

**`yarn verify` is the code gate.** `next typegen`, `tsc --noEmit`, `eslint
--max-warnings 0`, the unit suite, and `yarn check:meadow`. All deterministic,
no credentials, no build output. It is green on this branch. A red result means
someone broke the code. It prints a pass/fail line per step, stops early if
typegen fails because everything after it reads what typegen wrote, and closes
by naming what it does not cover.

The meadow check joined it on the review's instruction: 3.2 seconds, 115942
assertions, no I/O beyond the repository.

**`yarn verify:artifacts` is the artifact gate.** Homepage OG freshness, on its
own, because it asks whether a committed binary still matches the source it was
captured from. It is red, for reasons in the next section.
`.github/workflows/refresh-home-og.yml` stays the single precise CI signal for
it and runs the check directly with node, no install needed.

Route budgets are in neither, and `yarn verify` says so on its own line.
`check:budgets` reads gzipped chunk sizes from
`.next/server/app/**/page_client-reference-manifest.js`, so in a fresh checkout
it reports nothing and in a stale one it reports the last build. It stays on
`postbuild`, where a fresh build produced its input.

`yarn verify` needs one prerequisite it will not provision: `node_modules`. It
checks for the directory and says to run `yarn install` rather than failing five
steps deep. Installing dependencies on someone's behalf is a side effect a
verification command should not have.

## One stale artifact remains, pending an authorized capture

`yarn verify:artifacts` fails at HEAD of this branch and will keep failing until
someone with credentials regenerates the capture. This is the one acceptance
criterion not met, and it is now isolated behind its own command so it cannot be
mistaken for a code failure.

What is actually wrong, measured field by field: the committed JPEG is
internally consistent. Its own embedded provenance digest, the manifest's
recorded image digest, and the file on disk all agree. The single mismatch is
between the manifest's input digest and the current one, because the visual
source tree moved after the last capture. `489c84e` added
`src/app/components/stacks/scene/reactionEngagement.ts` and changed other watched
files without refreshing the image. This branch's edits to `physics.ts`,
`AuthoredProps.tsx`, the new `tjMedallionGeometry.js`, and
`aboutBootSilhouettes.ts` moved it further.

Regenerating means `yarn generate:home-og:local`, which runs a full `next build`,
starts `next start`, and captures the WebGL frame through headless Chromium. The
build fails here: there is no `.env` in this worktree, and `src/env.js` requires
`DATABASE_URL`, `NOTION_API_KEY`, `AWS_BUCKET_NAME` and nine others.
`SKIP_ENV_VALIDATION=1` would get past the validator and straight into a real
failure, because `src/app/page.tsx` calls `getDefaultBooks()` and
`getCachedWeightliftingPlacard()` against Postgres at build time. A capture taken
without that data would be a photograph of an empty shelf, stamped with a digest
claiming it came from this code. That is worse than a stale image: it is a
convincing one.

The manifest-only escape is closed on purpose. `writeHomeOgManifest` throws
unless the JPEG's embedded digest already matches the current inputs, precisely
so that nobody can bless an old capture by rewriting the JSON. I did not go
around it.

To clear it: from a checkout with production credentials, run
`yarn generate:home-og:local` and commit `public/images/stacks/home-og-scene.jpg`
and `home-og-scene.inputs.json`. It has to be the last commit on the branch,
because any later edit to a watched path invalidates it again.

## The cache warmer now reads the deployment it depends on

The review pushed back on the first attempt, correctly. That version still read
the aggregate commit status and stood down on any `failure`, so an unrelated
check reporting a status on main would have skipped the warm.

I inspected the real signals read-only with `gh api` before changing anything.
Across the twenty most recent `main` commits, every commit carrying any status
has exactly one context, `Vercel`, so the aggregate cannot distinguish a
production deploy from anything else that might later report. Two older commits
carry no statuses at all. The GitHub Deployments API is more precise:
`vercel[bot]` creates deployments with an explicit `environment`, and `4ab4d70`
carries both a `Production` and a `Preview` deployment for the same sha.

The warmer now polls the production deployment for the pushed sha and reads that
deployment's own latest status:

```
[.[] | select((.environment // "") | ascii_downcase == "production")] | first | .id
```

then `/deployments/{id}/statuses?per_page=1` for `.state`. I replayed exactly
that shell and jq against real data: `3055138` resolves to production deployment
`6028174564` with state `failure`, and `4ab4d70`, the sha that also has a
preview, resolves to `6018523518` with state `success`, skipping its preview.

It stands down with a `::warning::` and exit 0 only on that deployment's
`failure` or `error`. Nothing else can cause a skip, because nothing else is
read. A timeout still fails the job, since that one is the warmer's own. The
workflow gained `deployments: read`. No job names or ids changed, so nothing a
branch-protection rule references moved.

## Implementation summary

- `tjMedallionGeometry.js`: new shared shape specification, signature, and posed group builder.
- `AuthoredProps.tsx`: renders the medallion from that spec; keeps only finishes.
- `aboutCoordinationLayout.ts`: `ABOUT_TJ_LIGHT_YAW` derives from `TJ_MEDALLION_POSE.yaw`.
- `aboutBootComposition.ts`: the `tj-medallion` landmark's `sceneScale` derives from `TJ_MEDALLION_POSE.scale`.
- `generate-about-boot-silhouettes.mjs`: imports the builder, keys the digest to the signature, emits `sourceKind`, self-checks its raster envelope against the derived front elevation, and shares `viewBoxFor`.
- `aboutBootSilhouettes.ts`: regenerated. Every traced path unchanged.
- `aboutBootSilhouettes.test.ts`: branches on `sourceKind`; asserts the medallion is not keyed to `AuthoredProps.tsx`.
- `tjMedallionGeometry.test.ts`: new. Envelope prediction, shape-change regression, face containment, signature coverage, and the runtime pose tie.
- `physics.ts`: thin-body step 1/240 × 4 substeps, with the measurement in the comment.
- `physics.test.ts`: new expected policy, plus an assertion on the catch-up ceiling.
- `musingsPaperTunnelling.test.ts`: new. Eight poses × two frame deltas.
- `musingsPaperPhysics.test.ts`: renamed and annotated. Assertions unchanged.
- `canvasCompositing.test.ts`, `freeRoamControls.presentation.test.ts`, `scenePerformance.presentation.test.ts`: assertions made robust and labelled as source-shape checks.
- `aboutReadingStack.test.ts`: 0.71 to 0.745.
- `reactionArchetype.test.ts`: dropped the unused `LIFT_LAMBDA` import.
- `scripts/verify.mjs` plus `yarn verify`, `yarn verify:artifacts`, `yarn typegen`, `yarn typecheck`.
- `yarn lint` gained `--max-warnings 0`.
- `stacks-safety-budget.yml` runs `yarn verify` instead of `yarn test`, and its comment names what that covers: types, lint, unit suite, meadow.
- `warm-og-cache.yml` reads the Vercel production deployment.
- `CLAUDE.md` documents both gates and the typegen prerequisite.

## Shortcuts taken

None. The one thing not done is the homepage OG capture, which is blocked on
credentials rather than skipped; it has its own section above and its own
command so it cannot hide inside a green run.

## Issues discovered and not fixed

**The OG freshness contract will keep going red.** Its input set is every
non-test file under `src/app/components/stacks`, `src/components/ui`,
`src/styles`, `public/data`, `public/models`, three image directories, and both
root layout files, 403 files as of this branch. A change to physics stepping, to
the diagnostics panel, to a DOM overlay that never appears in the frame: all of
them demand a full WebGL re-capture. Nothing regenerates automatically;
`refresh-home-og.yml` only checks. So the repository is structurally destined to
go red after most scene commits, and the only cure is a capture that needs a
database. Narrowing the input set would make the check pass by making it mean
less, so I left it alone. Worth a real decision.

**`freeBodyStepPolicy` takes a boolean.** The right quantity is
`speed × step < thinnest static extent`, and 1/240 is a value that satisfies it
for today's 0.055 plank and 4 u/s ceiling with room to spare. A thinner plank or
a higher throw ceiling would need this revisited. Making it a computed function
of speed and the thinnest static extent is the better shape and a bigger change
than this task should make.

**Source-shape tests, deliberately left to the test-contract branch.** Three
assertions in this diff read component files with `fs` and match on text. I made
those three robust and labelled each one at its call site as a source-shape
check, so nobody reads them as behavior contracts. The pattern appears across
many more assertions in these files. Reworking it is the test-contract branch's
job and this branch does not touch it.

**The boot silhouette generator is still a script, not a library.**
`tjMedallionGeometry.test.ts` mirrors the generator's raster envelope constant
(`MAX_EDGE = 220`) rather than importing it, because the generator is a top-level
`await` script with side effects. The generator's own self-check keeps the two
honest: it throws if its raster disagrees with the derived elevation. Making the
generator importable would remove the mirror.

## Ambiguities

Whether the About reading-stack should sit at 0.745 or the test's 0.71 was the
one place where "which side is stale" needed an argument rather than a lookup.
Resolved toward the code: the passing mean-x assertion in the same file ties the
fan to the landmark, `aboutCoordinationLayout.test.ts` independently checks the
landmark's spacing on the lower shelf, and 0.71 matches no landmark value in the
file's history.

## Judgement calls

**Fixed the physics rather than the assertion.** The test was authored in the
same commit as the code and never passed, which is usually a sign of a wishful
expectation. Not here: the module has a named policy whose stated purpose is to
prevent exactly this, and 27 of 462 reachable releases still fell through the
shelf.

**Renamed the musings test instead of making it reach its named pose.** Reaching
it requires the assertions to accept a face-down landing, which contradicts the
test's stated intent, for a righting rule `physics.ts` does not implement. The
new matrix covers the poses instead.

**Put the shape spec in `.js` rather than `.ts`.** The generator is plain node,
so it cannot import a `.ts` module without a loader. A `.js` module under `src`
is typechecked anyway (`allowJs` and `checkJs` are both on) and linted by the
same glob, so nothing is lost.

**Passed `THREE` into the builder rather than importing it.** Keeps the shared
module free of a runtime dependency while letting the generator and the tests
use their own copy.

**Chose the Deployments API over the `Vercel` status context.** Both were on
offer. Only the deployment carries `environment`, and one sampled commit
demonstrably has both a Production and a Preview deployment.

**Kept `refresh-home-og.yml` as the artifact signal in CI** rather than adding
`verify:artifacts` to the quality-contracts job. One precise red mark for one
problem.

**Did not rename the "Check Stacks quality contracts" workflow** even though it
now runs the whole code gate. Renaming the job would move a name that branch
protection may reference.

## Files changed

```
.github/workflows/stacks-safety-budget.yml
.github/workflows/warm-og-cache.yml
CLAUDE.md
docs/reviews/2026-08-21-green-baseline.md
package.json
scripts/generate-about-boot-silhouettes.mjs
scripts/verify.mjs
src/app/components/stacks/scene/AuthoredProps.tsx
src/app/components/stacks/scene/aboutBootComposition.ts
src/app/components/stacks/scene/aboutBootSilhouettes.test.ts
src/app/components/stacks/scene/aboutBootSilhouettes.ts
src/app/components/stacks/scene/aboutCoordinationLayout.ts
src/app/components/stacks/scene/canvasCompositing.test.ts
src/app/components/stacks/scene/freeRoamControls.presentation.test.ts
src/app/components/stacks/scene/musingsPaperPhysics.test.ts
src/app/components/stacks/scene/musingsPaperTunnelling.test.ts
src/app/components/stacks/scene/physics.test.ts
src/app/components/stacks/scene/physics.ts
src/app/components/stacks/scene/reactionArchetype.test.ts
src/app/components/stacks/scene/scenePerformance.presentation.test.ts
src/app/components/stacks/scene/tjMedallionGeometry.js
src/app/components/stacks/scene/tjMedallionGeometry.test.ts
src/app/components/stacks/scene/units/aboutReadingStack.test.ts
```

## Automated checks

Run after deleting `.next/` and `next-env.d.ts`, so the results describe a clean
checkout.

| Command | Outcome |
| --- | --- |
| `yarn install --frozen-lockfile` | pass |
| `yarn verify` | **pass**, exit 0 |
| `yarn verify` → `next typegen` | pass |
| `yarn verify` → `tsc --noEmit` | pass, no errors |
| `yarn verify` → `eslint --max-warnings 0` | pass, no errors, no warnings |
| `yarn verify` → `vitest run` | pass, 1564 tests, 197 files |
| `yarn verify` → `check:meadow` | pass, 115942 assertions, 0 failures |
| `yarn verify:artifacts` | **fail**, stale capture, see above |
| `yarn generate:about-boot` | pass; all seven traced paths byte-identical |
| `npx prettier --check` on changed source files | pass |
| `yarn build` | not run: no `.env` |
| `yarn check:budgets` | not run: needs a fresh build |
| `yarn test:performance:safety` | not run: needs a build and a browser |

`aboutBootSilhouettes.ts` and this ledger are outside that check. The first is
generated by `JSON.stringify` and carries a do-not-hand-edit banner, so
formatting it would be undone on the next run; the second is prose. Both were
already non-conforming before this branch.

Targeted evidence, each measured rather than asserted:

| Probe | Outcome |
| --- | --- |
| Silhouette tests at HEAD | 8 pass |
| Spec perturbed, rim 0.15 to 0.19 | 3 tests fail; viewBox 187×222 to 211×222; path 271 to 223 chars |
| Spec restored and regenerated | committed output reproduced exactly |
| Spec reformatted by Prettier | digest unchanged |
| Runtime yaw decoupled to its own literal | pose-tie test fails |
| Landmark `sceneScale` decoupled to its own expression | pose-tie test fails |
| `ABOUT_AWARD_SIZE_INCREASE` 1.1 to 1.2 | award-group test fails |
| Pose change re-signed | digest no longer matches the committed one |
| Tunnelling matrix at HEAD | 16 pass, 167 ms |
| Tunnelling matrix against the old `1/120 × 2` policy | 15 of 16 fail |
| Warmer selector replayed on `3055138` | production deployment 6028174564, state `failure` |
| Warmer selector replayed on `4ab4d70` | production deployment 6018523518, state `success`, preview skipped |
| Status contexts across 20 `main` commits | `Vercel` only, or none |

## Manual review steps

1. `rm -rf node_modules .next next-env.d.ts && yarn install --frozen-lockfile && yarn verify`. Expect exit 0.
2. `yarn verify:artifacts`. Expect the stale-capture failure, and nothing else.
3. Change a number in `TJ_MEDALLION_SOLIDS` and run `npx vitest run src/app/components/stacks/scene/tjMedallionGeometry.test.ts src/app/components/stacks/scene/aboutBootSilhouettes.test.ts`. Expect failures. Run `yarn generate:about-boot` and expect a different traced path. Revert both.
4. Edit a comment in `AuthoredProps.tsx` and rerun the same tests. Expect no failures.
5. Replace `ABOUT_TJ_LIGHT_YAW` with a literal that differs from `TJ_MEDALLION_POSE.yaw` and rerun `tjMedallionGeometry.test.ts`. Expect the pose-tie test to fail. Revert.
6. Read the `freeBodyStepPolicy` diff against the sweep numbers above.
7. Load the homepage, grab the Musings paper stack, and flick it straight down as hard as the throw ceiling allows. It should land on the shelf. Before this change it sometimes landed on the floor.
8. Throw a few other props hard, say the golf ball, a book, and the medallion, and check nothing feels slower or stickier. Only bodies thinner than 0.03 moving above 1 u/s take the new path, but that is the claim to test.
9. Look at the medallion in the About unit against `main`. The render is spec-driven now and should be pixel-identical.
10. On the next `main` push after a failed deploy, confirm the OG warmer finishes with a warning instead of a red X.

## Potential regressions and edge cases

**Physics stepping.** Four substeps instead of two for thin fast bodies.
Bounded, brief, and the simulated-time ceiling is unchanged, but it is more
solver work per frame during a throw on a page that already watches its frame
budget. The Playwright safety-triangle harness was not run here; it needs a
build.

**Determinism.** Changing the step changes every thin-body trajectory. Props will
come to rest in slightly different places than before. No test pins those
positions, and the matrix found no new tunnelling, but the motion is not
bit-identical to `main`.

**The medallion render.** `TJMedallionBody` now maps over an array instead of
listing three meshes. Same geometry, same order, same finishes, and React keys
moved from `-1`/`1` to part ids. Its scene scale also moves by one float ulp,
from 0.726 to 0.7260000000000001, because the runtime value is now the signed
one; that is below any visible threshold but it is a real change. Worth the
visual glance in step 9.

**`--max-warnings 0`.** Any new ESLint warning now fails `yarn lint` and CI.
Intended, and it will surprise someone.

**The gated warmer.** If the production deployment status reports `failure` for a
reason unrelated to the deploy itself, the warmer skips with a log warning as its
only signal. A repository that stops using Vercel deployments would hit the
20-minute timeout instead, which fails loudly.

**Two commits with no statuses at all** appear in the sampled history. Under both
the old and new warmer those would poll to the timeout. Unchanged behavior,
noted because the sampling turned it up.

## Rollback notes

- Physics only: revert `physics.ts`, `physics.test.ts`, and delete `musingsPaperTunnelling.test.ts`. `musingsPaperPhysics.test.ts` fails again, exactly as it did at `3055138`.
- Silhouette contract only: revert `tjMedallionGeometry.*`, `AuthoredProps.tsx`, `aboutCoordinationLayout.ts`, `aboutBootComposition.ts`, the generator, and `aboutBootSilhouettes.*`. The whole-file hash and its false trigger come back, along with the duplicated pose.
- Verification only: drop `scripts/verify.mjs`, revert the five `package.json` script lines, and put `yarn test` back in `stacks-safety-budget.yml`.
- Lint strictness only: remove `--max-warnings 0` from the `lint` script.
- Warmer only: revert `.github/workflows/warm-og-cache.yml`.
- Everything: `git revert` the commits on this branch. They touch no binary and no migration.

## Recommended next steps

1. Regenerate the homepage OG capture from a checkout with credentials, as the last commit on this branch. Until then `yarn verify:artifacts` and `refresh-home-og` stay red, and that is the repository's one known stale artifact.
2. Decide what the OG freshness contract should watch. Every non-test file under `src/app/components/stacks` guarantees a red artifact check after most scene work. Either narrow the input set to files that can change the frame, or automate the capture in CI with credentials, or make it advisory.
3. Give `freeBodyStepPolicy` the quantity it is really about: `speed × step < thinnest static extent`, computed, rather than a boolean and a tuned constant.
4. Hand the wider source-shape test pattern to the test-contract branch. Three assertions here are labelled; many more are not.
5. Run the Playwright safety-triangle harness against a real build to confirm the extra substeps cost nothing measurable.
