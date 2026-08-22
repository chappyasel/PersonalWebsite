# Task ledger: boot-state

Task id: boot-state
Branch: site-boot-state
Worktree: `/Users/chappyasel/.superset/worktrees/07a1f5cb-07af-473a-b3b5-a07b3f772c20/site-boot-state`
Base commit: 3055138

## Objective and scope

Model the homepage world boot, reveal, fallback, and cleanup as one
deterministic state machine, then integrate it without changing visual timing
or visitor policy.

In scope: the inline pre-paint script in `src/app/page.tsx`, the boot, reveal,
and demotion effects in `StacksHome.tsx`, the boot half of `loading.ts`, the
eligibility half of `webglProbe.ts`, and the readiness reporters in
`StacksCanvas.tsx`, `Meadow.tsx`, `SceneEnvironment.tsx`, and `BootScreen.tsx`.

Out of scope: the visual design of the boot vignette, scene quality policy,
placard and input layers, and the six test failures already present on this
commit.

## Baseline evidence

Facts, measured on 3055138 before any edit.

Fresh Superset worktrees have no `node_modules` and no `next-env.d.ts`. After
`yarn install --silent` (exit 0), `npx tsc --noEmit` reported 8 `TS2307` errors
for static image imports in `About.tsx` and `Projects.tsx`, and `yarn lint`
reported 8 matching `no-unsafe-assignment` errors. Both disappear after
`SKIP_ENV_VALIDATION=1 npx next typegen`, which writes the gitignored
`next-env.d.ts`. The coordinator confirmed this is a clean-checkout
prerequisite; see "Overlap with other tasks".

Baseline after typegen:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean, no output |
| `yarn lint` | 0 errors, 1 warning (`reactionArchetype.test.ts` unused `LIFT_LAMBDA`) |
| `yarn test` | 6 failed / 1531 passed, 195 files |

The six baseline failures, all pre-existing and none boot-related:

- `scene/aboutBootSilhouettes.test.ts` — generated silhouettes vs source GLBs
- `scene/canvasCompositing.test.ts` — canvas alpha channel
- `scene/freeRoamControls.presentation.test.ts` — mobile sheet on entry
- `scene/musingsPaperPhysics.test.ts` — paper settle
- `scene/scenePerformance.presentation.test.ts` — bokeh `focusRange`
- `scene/units/aboutReadingStack.test.ts` — reading fan pose

## Implementation summary

One deep module under `src/app/components/stacks/boot/`. Its interface is a
state, an event union, a reducer, and a view; everything that touches a browser
sits outside it as an adapter.

`worldBootMachine.ts` is pure. Time arrives as `at` on every event, so the
whole transition table runs on a fake clock. Seven states — `unstarted`,
`ineligible`, `booting`, `revealing`, `live`, `failed`, `exited` — and ten
events covering initial capability, reduced motion, Save-Data, WebGL
availability, warm cache, world mount, asset/meadow/vignette readiness, first
painted frame, hang timeout, runtime error, context loss, and route exit.
`worldBootView` projects the state onto what a visitor can observe: which
homepage is mounted, what the handshake attribute says, whether the world is
revealed, which deadline is armed.

`worldBootPolicy.ts` holds every constant in one JSON-serializable record: both
attribute names, both storage keys, the warm TTL, all three timeouts, the
settle window, and the two window globals the pre-paint timer uses.

`worldBootPrepaint.ts` generates the inline script from that record instead of
restating it in a template literal. `worldBootSession.ts` runs the single live
instance, does the browser probes, and writes the document attributes.
`useWorldBoot.ts` is React: one mount effect, one timer keyed on the armed
deadline, one frame loop while the reveal gate is open.

What each of the old owners became:

| Was | Now |
| --- | --- |
| `WORLD_BOOT_SCRIPT` template in `page.tsx` | `worldBootPrepaintScript()` |
| 4 effects + 4 `useState` in `StacksHome` | `useWorldBoot()` plus 3 signal callbacks |
| `canUseStacksWorld` in `webglProbe.ts` | `worldEligible` in the machine |
| `browserCanUseStacksWorld()`, called twice | one `start`, read once |
| asset/meadow/vignette globals in `loading.ts` | machine state |
| `setWorldPhase`, `isWarmBoot`, `rememberWarmBoot` | session |
| `HANG_BACKSTOP_MS`, `ASSET_SETTLE_MS`, `420`, `20000` | policy record |

`loading.ts` keeps only the load-progress observable, which is what its header
comment always said it was for. `webglProbe.ts` keeps only
`isWebGLContextUsable`, a context-health question rather than a boot decision.

Also added ADR 0021 under the scene's own `docs/adr/`, and five glossary terms
to `stacks/CONTEXT.md` (World Boot, Handshake Phase, Reveal Gate, Warm Boot,
Demotion), per the repo's domain-map convention.

## Shortcuts taken

One, stated plainly: the pre-paint script still writes its eligibility and warm
rules out by hand. It cannot import the machine, so there is no way to have it
literally call the same code. I closed the gap with a test rather than leaving
it on trust — see "Judgement calls".

Nothing else was skipped. No `TODO`, no stubbed branch, no test disabled.

## Issues found but not fixed

1. `src/styles/globals.css` still selects on the literals `data-world` and
   `data-og-capture`. Those names now live in the policy record, but CSS cannot
   read it. A rename means editing both. ADR 0021 records this.
2. The pre-paint script and the hydrated path diverge when storage throws
   outright. The script's outer `try/catch` swallows the failure and leaves the
   document; `webglAvailable()` in the session catches and probes the canvas
   directly, so a capable browser with storage disabled still gets the world at
   hydration. This is the behavior that was already shipping. It is now visible
   in one file instead of two, but I did not change it.
3. `scenePerformance.presentation.test.ts:223` still asserts `LitImage` does not
   contain `subscribeWorldPhase`. That function no longer exists anywhere, so
   the assertion is now vacuous. It passes; I left it for test-contracts.
4. The six baseline failures above are untouched.

## Ambiguities

1. "Without changing visual timing" — I read this as no change a visitor could
   perceive, not bit-identical scheduling. One scheduling detail did shift; see
   "Potential regressions", item 1.
2. Whether the boot machine should own `data-og-capture` at all. It is not a
   boot decision, but `StacksHome`'s cleanup effect already owned it and the
   OG capture does change boot behavior (it suppresses the hang backstop). I
   kept it on the machine so one place clears it on route exit.
3. Whether to delete `loading.test.ts`. DEEPENING.md is explicit — replace,
   don't layer — so I deleted it and rewrote its coverage at the new interface.
   Flagged under overlap because test-contracts may have plans for that file.

## Judgement calls

**A pure reducer, not a stateful object.** The machine could have been a class
with `send()`. A reducer plus a view function is equally deep at the interface
and strictly more testable: the transition table is driven with literal event
arrays and fake `at` values, with no instance to reset between cases.

**Effects are derived, not returned.** The reducer returns state only. The two
one-shot side effects at the reveal (write the warm record, normalize published
progress) fire in the session on the `false → true` edge of `view.revealed`.
Returning an effect list would have widened the interface for two calls.

**The prepaint equivalence test compiles the generator's own output.**
`worldBootPrepaint.test.ts` runs the real script through `new Function` with
every global it touches shadowed by a fake, across an 18-case input matrix, and
asserts it lands on the same `documentPhase` and the same armed deadline as the
machine. This required one `eslint-disable` for `no-implied-eval`, which is
annotated at the call site. Executing a transcription would have proved
nothing; this catches a rule changed on only one of the two paths.

**Two clocks, kept apart.** Machine time is monotonic (`performance.now()`).
The warm record's age is wall-clock, because the record survives a reload. The
machine never reads a clock itself, which is what makes the tests deterministic.

**The reveal gate is still sampled on a frame loop.** One of its four
conditions is a quiet window, not a signal, so an event cannot carry it. The
loop runs only between the first painted frame and the reveal, exactly as
before. The three long deadlines moved to a single `setTimeout` keyed on
`view.deadlineAt`.

**`start` preserves the vignette's completed pass.** The vignette ships in the
initial entry and can finish before the streamed homepage data resolves and
`StacksHome` mounts. Had `start` cleared it like the other three readiness
flags, a fast server would deadlock the reveal until the 40-second backstop
took the room away. `bootVignetteStarted` is the vignette's own reset. There is
a test named for this.

**Reveal beats the hang backstop on a tie.** An asset landing in the same
millisecond the backstop comes due reveals the room rather than discarding it.
Arbitrary but defensible, and now written down and tested.

**`ineligible` and `failed` are separate states** even though both project the
same flat document. A visitor who set Save-Data was never promised the world;
a visitor whose context was lost was. Diagnostics can tell them apart, and
`view.failure` carries the cause.

## Files changed

New:

- `src/app/components/stacks/boot/worldBootPolicy.ts`
- `src/app/components/stacks/boot/worldBootMachine.ts`
- `src/app/components/stacks/boot/worldBootMachine.test.ts`
- `src/app/components/stacks/boot/worldBootPrepaint.ts`
- `src/app/components/stacks/boot/worldBootPrepaint.test.ts`
- `src/app/components/stacks/boot/worldBootSession.ts`
- `src/app/components/stacks/boot/useWorldBoot.ts`
- `src/app/components/stacks/docs/adr/0021-model-the-world-boot-as-a-state-machine.md`
- `docs/reviews/2026-08-21-boot-state.md`

Modified:

- `src/app/page.tsx` — 67-line inline script replaced by `worldBootPrepaintScript()`
- `src/app/components/stacks/StacksHome.tsx` — 4 effects and 4 `useState` replaced by `useWorldBoot()`
- `src/app/components/stacks/loading.ts` — boot state removed, progress observable kept
- `src/app/components/stacks/webglProbe.ts` — eligibility removed, context health kept
- `src/app/components/stacks/StacksCanvas.tsx` — `assetLoad` signal, imports rerouted
- `src/app/components/stacks/dom/BootScreen.tsx` — vignette signals, `isBootingPhase`
- `src/app/components/stacks/scene/Meadow.tsx` — `meadowReady` signal
- `src/app/components/stacks/scene/SceneEnvironment.tsx` — `meadowReady` signal
- `src/app/components/stacks/scene/Wildlife.tsx` — reads `isWorldRevealed()` instead of the raw attribute
- `src/app/components/stacks/scene/sceneFirstVisitReset.ts` — `WARM_KEY` import moved
- `src/app/components/stacks/CONTEXT.md` — five glossary terms
- `src/app/pagePresentation.test.ts` — the eligibility-proxy assertion replaced
- `src/app/components/stacks/webglProbe.test.ts` — moved-out cases removed

Deleted:

- `src/app/components/stacks/loading.test.ts` — replaced by the machine tests

Not committed: `next-env.d.ts` (gitignored, generated).

## Automated checks

Run from the worktree root, after `yarn install` and
`SKIP_ENV_VALIDATION=1 npx next typegen`.

| Command | Baseline | After | Verdict |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | clean | clean | unchanged |
| `yarn lint` | 0 errors, 1 warning | 0 errors, 1 warning | unchanged |
| `yarn test` | 6 failed / 1531 passed (195 files) | 6 failed / 1626 passed (196 files) | same six failures, by name |
| `npx vitest run src/app/components/stacks/boot` | n/a | 102 passed | new |
| `npx prettier --check` on changed files | n/a | clean after `--write` | formatted |

The six failures after the change are byte-identical in name to the six at
baseline. Net test delta: +95 passing (102 new, minus the 7 in the deleted
`loading.test.ts`).

Not run: `yarn build` (CLAUDE.md says avoid unless asked), `yarn check:budgets`
(needs a build), and `yarn test:performance` (Playwright, and AGENTS.md
forbids browser automation here).

## Manual review steps

I could not exercise these without a browser, which AGENTS.md rules out. They
are the checks a human should make before merging.

1. Cold load with an empty profile: boot vignette, then the room. `data-world`
   goes `pending` then `ready`; the flat page unmounts about 420ms later.
2. Reload within three days: `data-world` starts at `warm`, and the handoff is
   the shorter one. The vignette still plays.
3. `prefers-reduced-motion: reduce` and Save-Data: no attribute, flat document,
   no world chunk fetched.
4. `?og-capture`: `data-og-capture` on `<html>`, chrome hidden, no hang
   backstop.
5. Navigate to `/books` and back: both attributes cleared on exit, a fresh boot
   on return, no overscroll lock on the document route.
6. Force a context loss (`WEBGL_lose_context`) after reveal: the flat document
   comes back animated.
7. With JS blocked or the bundle 404ing: the boot screen retires after 20
   seconds and the document appears.
8. Scene Diagnostics and the performance trace: both `<Profiler>` wrappers and
   `recordPerformanceCommit` are unchanged, but confirm the panel still reads.
9. `yarn check:budgets` after a build: the entry bundle gains the boot module
   (~4KB of dependency-free TS) and loses the eligibility half of
   `webglProbe.ts`. Expected to be roughly neutral, but unmeasured.

## Potential regressions and edge cases

1. **The flat-retire timer is scheduled one effect later.** It used to be a
   `setTimeout` inside the `revealed` effect. It is now a `setTimeout` in the
   deadline effect, which React runs after the commit that carried the reveal.
   The deadline itself is absolute (`reveal + 420ms`) and the timer is computed
   as `deadlineAt - performance.now()`, so the target time is identical; only
   the moment of scheduling moves, by at most one frame. This is the one timing
   change I know of, and it is not visible.
2. **Preload ordering.** The preload effect reads `worldBoot.getView()`
   imperatively rather than the rendered `boot` view, because the render that
   produced `boot` happened before `useWorldBoot`'s mount effect ran. Hook
   effects run in declaration order, so `useWorldBoot`'s start has already
   fired. If that effect is ever reordered, preload silently stops. Commented
   at the call site.
3. **The session is module-scoped.** It has to be: the vignette is in the entry
   bundle and the renderer is in the lazy chunk. A second `StacksHome` mounted
   at once would share it. Nothing mounts two.
4. **React StrictMode double-mount** (dev only) produces start, exit, start.
   `start` from `exited` resets, and the vignette's pass is preserved, so this
   is correct — but it is a dev-only path I could not run.
5. **`applyDocument` writes `data-og-capture` on every state change** rather
   than once at mount. `BootScreen`'s `MutationObserver` filters on
   `data-world` only, so it is not woken by this.
6. **`useSyncExternalStore` snapshot identity.** The session's initial snapshot
   and `SERVER_WORLD_BOOT_VIEW` are the same object, so hydration does not
   schedule a spurious re-render. Worth keeping that way.
7. **Crawler behavior is unchanged by construction.** `flatMounted` is
   `status !== "live"`, so the semantic document is in the DOM through every
   state except a fully revealed world, and CSS still does the hiding.

## Overlap with other tasks

**green-baseline.** The six pre-existing failures and the `next-env.d.ts`
prerequisite belong to that task, not this one. I did not touch the failing
tests. The coordinator's finding is recorded under "Baseline evidence": a clean
worktree needs `SKIP_ENV_VALIDATION=1 npx next typegen` before lint or type
checks, and green-baseline or toolchain should decide which command owns it.

**test-contracts.** Three collisions, all in source-reading tests:

- I deleted `src/app/components/stacks/loading.test.ts` (its subject moved).
- I rewrote one case in `src/app/pagePresentation.test.ts`. The old assertion
  counted `browserCanUseStacksWorld()` occurrences in `StacksHome` as a proxy
  for "mount and preload agree". That function is gone and the property is now
  structural, so I replaced it with two cases that read the same source file.
  If test-contracts is removing source-reading tests, these two are candidates:
  the machine tests already cover the behavior.
- `scenePerformance.presentation.test.ts:223` is now a vacuous assertion
  (see "Issues found but not fixed", item 3). I left it alone.

My own new tests read no source files. `worldBootPrepaint.test.ts` executes the
generator's output, which is a value, not a file.

## Rollback notes

Self-contained in one commit on `site-boot-state`. `git revert <sha>` restores
every old owner, because nothing outside the boot path changed shape: the
signal producers went from calling a named function to calling
`worldBoot.send`, and the revert puts the named function back.

Partial rollback is not useful. The pre-paint script, `StacksHome`, and
`loading.ts` were three views of one decision; reverting any one of them alone
leaves the handshake with two owners, which is the bug this replaces.

Nothing was migrated, generated into the repo, or written to storage, so there
is no data to undo. Storage keys and attribute names are byte-identical to
before, so a rollback does not invalidate any visitor's warm record or cached
capability answer.

## Recommended next steps

1. Walk the nine manual checks above, in one browser session. The state machine
   is proven; the wiring between it and Chrome is not.
2. Run `yarn build && yarn check:budgets` and confirm the entry bundle did not
   grow. My expectation is neutral, but I have not measured it.
3. Consider surfacing `worldBoot.getState()` in Scene Diagnostics. The machine
   now knows exactly why the document came back (`hang`, `runtimeError`,
   `contextLost`) and nothing displays it. That was the failure mode that cost
   a teammate an afternoon, per the comment in `CanvasBoundary`.
4. Decide with test-contracts whether `pagePresentation.test.ts` should keep
   reading source at all.
