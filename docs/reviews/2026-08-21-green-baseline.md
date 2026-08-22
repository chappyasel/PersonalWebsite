# Green baseline, 2026-08-21

Task ledger for restoring a truthful delivery baseline on `site-green-baseline`,
branched from `main` at `3055138`.

## Objective and scope

Get the repository back to a state where a green local run and a green CI run
mean the same thing, without redesigning anything a visitor can see.

In scope: the six failing unit tests, the lint warning, the generated artifacts
the repository's own freshness checks demand, one verification entry point, and
the workflows that report on all of it.

Out of scope: visual or product changes, branch-protection settings, anything
that needs a production build to be honest.

## Baseline evidence

Reproduced in this worktree, not taken on trust. Fresh `yarn install --frozen-lockfile`
first; the worktree had no `node_modules`.

| Check | Result at `3055138` |
| --- | --- |
| `yarn test` | 6 failed, 1531 passed (195 files) |
| `yarn tsc --noEmit` | 8 × TS2307 before typegen, clean after |
| `yarn lint` | 8 errors before typegen, 1 warning after |
| `yarn check:home-og` | fail: input digest moved |
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
| `aboutBootSilhouettes` | stays synchronized with the exact source GLBs | Stale artifact |
| `canvasCompositing` | keeps the scene backdrop reachable through the canvas alpha channel | Brittle expectation |
| `freeRoamControls` | hides the mobile sheet on entry and lets H toggle it | Brittle expectation |
| `scenePerformance` | isolates browser glass and each expensive post effect | Brittle expectation |
| `aboutReadingStack` | authors three grounded books turned 40 degrees toward the lamp | Wrong literal, committed wrong |
| `musingsPaperPhysics` | fast tilted release on the lower shelf | Behavior drift, a real tunnelling bug |

Five of the six were introduced by one commit, `489c84e feat(stacks): ship
complete scene update`. Four of those five have never passed: I checked out
`489c84e` in a scratch worktree and ran them there.

**aboutBootSilhouettes.** The generated file pins a SHA-256 of each silhouette's
source. `authored:TJMedallionBody` traces its outline out of
`AuthoredProps.tsx`, and that file changed. Regenerating produced a one-line
diff: the hash moved, the traced path and viewBox did not. So the medallion's
shape never changed. The check keys on the whole file, so any edit anywhere in
`AuthoredProps.tsx` demands a regeneration run. Noted below as a sharp edge, not
fixed.

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

**musingsPaperPhysics.** The only one where the code was wrong.

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

The scratch harness that produced these numbers was deleted before commit.

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
verifies and wrote the reasoning above it.

## Implementation summary

- `physics.ts`: thin-body step 1/240 × 4 substeps, with the measurement in the comment.
- `physics.test.ts`: new expected policy, plus an assertion on the catch-up ceiling.
- `musingsPaperPhysics.test.ts`: renamed and annotated. Assertions unchanged.
- `canvasCompositing.test.ts`: match the `gl` options as a set, not as authored text.
- `freeRoamControls.presentation.test.ts`: assert both halves of the store wiring.
- `scenePerformance.presentation.test.ts`: assert the branch, import the constants, check they still sum to 2.2.
- `aboutReadingStack.test.ts`: 0.71 → 0.745.
- `reactionArchetype.test.ts`: dropped the unused `LIFT_LAMBDA` import.
- `aboutBootSilhouettes.ts`: regenerated with `yarn generate:about-boot`.
- `scripts/verify.mjs` + `yarn verify`, `yarn typegen`, `yarn typecheck`.
- `yarn lint` gained `--max-warnings 0`.
- `stacks-safety-budget.yml` runs `yarn verify` instead of `yarn test`.
- `warm-og-cache.yml` stands down instead of failing when the deploy failed.
- `CLAUDE.md` documents the entry point and the typegen prerequisite.

### The verification entry point

`yarn verify` runs, in order: `next typegen`, `tsc --noEmit`, `eslint
--max-warnings 0`, the unit suite, and the homepage OG freshness check. It prints
a pass/fail line per step and exits non-zero if any failed. It stops early if
typegen fails, because everything after it reads what typegen wrote.

It works from a clean checkout with one prerequisite it cannot provision:
`node_modules`. It checks for that directory and tells you to run `yarn install`
rather than failing five steps deep in a confusing way. Installing dependencies
on someone's behalf is a side effect a verification command should not have.

Route budgets are deliberately excluded, and the summary says so on its own line:
`check:budgets` reads gzipped chunk sizes out of
`.next/server/app/**/page_client-reference-manifest.js`, so in a fresh checkout it
reports nothing and in a stale one it reports the last build. It stays on
`postbuild`, where a fresh build produced its input.

### The cache warmer

`warm-og-cache.yml` polls the commit status, and on `failure` or `error` it
exited 1. The warmer then showed red next to the deploy that actually broke,
which reads as two problems. It now prints the deploy's own statuses, emits a
`::warning::` naming the deploy as the failure, and exits 0 with the two warming
steps gated behind `steps.deploy.outputs.deployed == 'true'`. A timeout still
fails the job, because that failure is the warmer's own.

No job names or job ids changed, so nothing a branch-protection rule references
moved.

## Shortcuts taken

None on the test fixes, the lint warning, the silhouettes, the verification
entry point, or the workflows.

One thing was not done at all, and it is not a shortcut so much as a wall: the
homepage OG image was not regenerated. See below.

## The homepage OG image is still stale

`yarn check:home-og` fails at HEAD of this branch and will keep failing. This is
the one acceptance criterion I did not meet.

What is actually wrong, measured field by field: the committed JPEG is internally
consistent. Its own embedded provenance digest, the manifest's recorded image
digest, and the file on disk all agree. The single mismatch is between the
manifest's input digest and the current one, because the visual source tree moved
after the last capture. `489c84e` added
`src/app/components/stacks/scene/reactionEngagement.ts` and changed other watched
files without refreshing the image. My own edits to `physics.ts` and
`aboutBootSilhouettes.ts` moved it further.

Regenerating means `yarn generate:home-og:local`, which runs a full `next build`,
starts `next start`, and captures the WebGL frame through headless Chromium. The
build fails immediately here: there is no `.env` in this worktree, and
`src/env.js` requires `DATABASE_URL`, `NOTION_API_KEY`, `AWS_BUCKET_NAME` and nine
others. `SKIP_ENV_VALIDATION=1` would get past the validator and straight into a
real failure, because `src/app/page.tsx` calls `getDefaultBooks()` and
`getCachedWeightliftingPlacard()` against Postgres at build time. A capture taken
without that data would be a photograph of an empty shelf, stamped with a digest
claiming it came from this code. That is worse than a stale image: it is a
convincing one.

The manifest-only escape is closed on purpose. `writeHomeOgManifest` throws
unless the JPEG's embedded digest already matches the current inputs, precisely
so that nobody can bless an old capture by rewriting the JSON. I did not go
around it.

To finish this: from a checkout with production credentials, run
`yarn generate:home-og:local` and commit `public/images/stacks/home-og-scene.jpg`
and `home-og-scene.inputs.json`. It has to be the last commit on the branch,
because any later edit to a watched path invalidates it again.

## Issues discovered and not fixed

**The OG freshness contract will keep going red.** Its input set is every
non-test file under `src/app/components/stacks`, `src/components/ui`,
`src/styles`, `public/data`, `public/models`, three image directories, and both
root layout files, 402 files today. A change to physics stepping, to the
diagnostics panel, to a DOM overlay that never appears in the frame: all of them
demand a full WebGL re-capture. Nothing regenerates automatically;
`refresh-home-og.yml` only checks. So the repository is structurally destined to
go red after most scene commits, and the only cure is a capture that needs a
database. Narrowing the input set would make the check pass by making it mean
less, so I left it alone. Worth a real decision.

**Boot silhouettes key on whole source files.** `authored:TJMedallionBody`
watches all of `AuthoredProps.tsx`. Today's regeneration changed the hash and
nothing else, which is the tell: any edit to that file, to any prop in it, breaks
a test about the medallion's outline.

**`freeBodyStepPolicy` takes a boolean.** The right quantity is
`speed × step < thinnest static extent`, and 1/240 is a value that satisfies it
for today's 0.055 plank and 4 u/s ceiling with room to spare. A thinner plank or
a higher throw ceiling would need this revisited. Making it a computed function
of speed and the thinnest static extent is the better shape and a bigger change
than this task should make.

**Three source-text tests remain fragile in kind.** `canvasCompositing`,
`freeRoamControls`, and `scenePerformance` read component files with `fs` and
assert on substrings. I made these three assertions robust; the pattern is still
there, across many more assertions, and it will keep producing failures that look
like behavior regressions and are not.

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
shelf. That is a bug with a test that found it.

**Renamed the musings test instead of making it reach its named pose.** Reaching
it requires the assertions to accept a face-down landing, which contradicts the
test's stated intent, for a righting rule `physics.ts` does not implement.

**Excluded route budgets from `yarn verify` and said so in its output.** A
verification command that silently reports on last week's build output is worse
than one that admits a gap.

**Kept `yarn lint` as the name and added `--max-warnings 0` to it,** rather than
adding a second strict variant. Two lint commands with different thresholds is
how the warning survived in the first place.

**Left `refresh-home-og.yml` in place** even though `yarn verify` now covers the
same check in CI. It runs without `yarn install` in about ten seconds and names
the problem precisely; the duplication costs nothing.

**Did not rename the "Check Stacks quality contracts" workflow** even though it
now runs more than Stacks quality contracts. Renaming the job would move a name
that branch protection may reference.

## Files changed

```
.github/workflows/stacks-safety-budget.yml
.github/workflows/warm-og-cache.yml
CLAUDE.md
docs/reviews/2026-08-21-green-baseline.md
package.json
scripts/verify.mjs
src/app/components/stacks/scene/aboutBootSilhouettes.ts
src/app/components/stacks/scene/canvasCompositing.test.ts
src/app/components/stacks/scene/freeRoamControls.presentation.test.ts
src/app/components/stacks/scene/musingsPaperPhysics.test.ts
src/app/components/stacks/scene/physics.test.ts
src/app/components/stacks/scene/physics.ts
src/app/components/stacks/scene/reactionArchetype.test.ts
src/app/components/stacks/scene/scenePerformance.presentation.test.ts
src/app/components/stacks/scene/units/aboutReadingStack.test.ts
```

## Automated checks

Run in this worktree after deleting `.next/` and `next-env.d.ts`, so the results
describe a clean checkout.

| Command | Outcome |
| --- | --- |
| `yarn install --frozen-lockfile` | pass |
| `yarn verify` → `next typegen` | pass |
| `yarn verify` → `tsc --noEmit` | pass, no errors |
| `yarn verify` → `eslint --max-warnings 0` | pass, no errors, no warnings |
| `yarn verify` → `vitest run` | pass, 1537 tests, 195 files |
| `yarn verify` → `check:home-og` | **fail**, stale capture, see above |
| `yarn generate:about-boot` | pass, one-line hash diff |
| `npx prettier --check` on changed files | pass |
| `yarn build` | not run: no `.env` |
| `yarn check:budgets` | not run: needs a fresh build |

`yarn verify` exits 1 overall on the OG check alone.

## Manual review steps

1. `rm -rf node_modules .next next-env.d.ts && yarn install --frozen-lockfile && yarn verify`. Expect four passes and the OG failure.
2. Read the `freeBodyStepPolicy` diff against the sweep numbers in this ledger.
3. Load the homepage, grab the Musings paper stack, and flick it straight down as hard as the throw ceiling allows. It should land on the shelf. Before this change it sometimes landed on the floor.
4. Throw a few other props hard, say the golf ball, a book, and the medallion, and check nothing feels slower or stickier. Only bodies thinner than 0.03 moving above 1 u/s take the new path, but that is the claim to test.
5. On the next `main` push after a failed deploy, confirm the OG warmer finishes with a warning instead of a red X.

## Potential regressions and edge cases

**Physics stepping.** Four substeps instead of two for thin fast bodies. Bounded,
brief, and the simulated-time ceiling is unchanged, but it is more solver work
per frame during a throw on a page that already watches its frame budget. The
Playwright safety-triangle harness (`yarn test:performance:safety`) was not run
here; it needs a build.

**Determinism.** Changing the step changes every thin-body trajectory. Props will
come to rest in slightly different places than before. No test pins those
positions, and the sweep found no new tunnelling, but the motion is not
bit-identical to `main`.

**`--max-warnings 0`.** Any new ESLint warning now fails `yarn lint` and CI.
Intended, and it will surprise someone.

**`yarn verify` in CI.** The quality-contracts job now fails on a stale OG image,
which it did not before. Truthful, and it means that job stays red until the
capture is regenerated.

**The gated warmer.** If the Vercel status API reports `failure` for a reason
unrelated to the deploy, the warmer now skips silently-ish rather than failing.
The warning in the log is the only signal.

## Rollback notes

- Physics only: revert `physics.ts` and `physics.test.ts` and re-apply the old `{ fixedStep: 1/120, maxSubSteps: 2 }`. `musingsPaperPhysics.test.ts` fails again, exactly as it did at `3055138`.
- Verification entry point only: drop `scripts/verify.mjs`, revert the four `package.json` script lines, and put `yarn test` back in `stacks-safety-budget.yml`.
- Lint strictness only: remove `--max-warnings 0` from the `lint` script.
- Workflow clarity only: revert `.github/workflows/warm-og-cache.yml`.
- Everything: `git revert` the single commit on this branch. It touches no generated binary and no migration.

## Recommended next steps

1. Regenerate the homepage OG capture from a checkout with credentials, as the last commit on this branch. Until then `yarn verify` and the quality-contracts job stay red.
2. Decide what the OG freshness contract should actually watch. Every non-test file under `src/app/components/stacks` guarantees a red baseline after most scene work, and the fix is a capture that needs a database. Either narrow the input set to files that can change the frame, or automate the capture in CI with credentials, or accept the check as advisory.
3. Give `freeBodyStepPolicy` the quantity it is really about: `speed × step < thinnest static extent`, computed, rather than a boolean and a tuned constant.
4. Key the boot silhouettes on the traced geometry instead of the whole source file, so editing an unrelated prop in `AuthoredProps.tsx` stops failing a medallion test.
5. Run the Playwright safety-triangle harness against a real build to confirm the extra substeps cost nothing measurable.
