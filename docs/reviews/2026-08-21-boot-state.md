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

| Check              | Result                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| `npx tsc --noEmit` | clean, no output                                                       |
| `yarn lint`        | 0 errors, 1 warning (`reactionArchetype.test.ts` unused `LIFT_LAMBDA`) |
| `yarn test`        | 6 failed / 1531 passed, 195 files                                      |

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

| Was                                                   | Now                                      |
| ----------------------------------------------------- | ---------------------------------------- |
| `WORLD_BOOT_SCRIPT` template in `page.tsx`            | `worldBootPrepaintScript()`              |
| 4 effects + 4 `useState` in `StacksHome`              | `useWorldBoot()` plus 3 signal callbacks |
| `canUseStacksWorld` in `webglProbe.ts`                | `worldEligible` in the machine           |
| `browserCanUseStacksWorld()`, called twice            | one `start`, read once                   |
| asset/meadow/vignette globals in `loading.ts`         | machine state                            |
| `setWorldPhase`, `isWarmBoot`, `rememberWarmBoot`     | session                                  |
| `HANG_BACKSTOP_MS`, `ASSET_SETTLE_MS`, `420`, `20000` | policy record                            |

`loading.ts` keeps only the load-progress observable, which is what its header
comment always said it was for. `webglProbe.ts` keeps only
`isWebGLContextUsable`, a context-health question rather than a boot decision.

Also added ADR 0021 under the scene's own `docs/adr/`, and five glossary terms
to `stacks/CONTEXT.md` (World Boot, Handshake Phase, Reveal Gate, Warm Boot,
Demotion), per the repo's domain-map convention.

### Review round: lifecycle defects

A review of the first commit found six real defects, all in the seams rather
than the machine. Every one is fixed here.

**1. Signals outlived their world.** A queued `requestAnimationFrame`, a
`webglcontextlost` on a dying canvas, or a loading manager draining its last
batch would land after an SPA re-entry had already started the next boot. A
stale `contextLost` demoted a healthy world; a stale `firstFrame` opened the
reveal gate on a canvas that had not painted. Every boot now has an epoch.
`firstFrame`, `assetLoad`, `meadowReady`, `runtimeError`, `contextLost`, and
`exit` carry the generation they were produced under, and the machine drops
anything older. Producers take a scoped sender at mount (`useWorldBootScope`);
the event types make an unscoped send a compile error. `tick` is deliberately
left unscoped — deadlines are absolute times in the current state, so a stale
tick can only ask "is anything due", which is always a fair question.

`exit` is scoped too, though the review did not ask for it: a cleanup that runs
after a newer boot has begun would otherwise unmount the live world.

**2. The canvas never unwound its own signals.** `onCreated` left a double
`requestAnimationFrame` and a `webglcontextlost` listener running with no
cleanup. Both are now captured in refs and unwound by an unmount effect. The
epoch guard is the second line of defence, not the first.

**3. The pre-paint timeout was not handed to hydration.** The timer only
removed `data-world`. A bundle slow enough to trip the twenty-second fail-open
gave the visitor the document, and then hydration at twenty-five seconds read
the bare attribute as a cold start and put the boot screen back for up to forty
seconds more. The timer now records `{ token, timedOut }` on a window global;
`start` consumes it once, and only while the token still matches, and goes
straight to `failed("hang")`. A later deliberate re-entry boots normally,
because the outcome speaks for one document load.

**4. The vignette lifecycle was wrong across `exited`.** Its `started` and
`completed` signals were dropped by the terminal-state guard, so a pass that
began after a route change was invisible; and `start` preserved a `ready` flag
that belonged to the page that had just left. Vignette signals now bypass the
terminal guard, and `exit` clears the flag, because `exit` is what ends the
page instance a pass belongs to. Both orderings the review named are tested,
plus `exit -> start` with no vignette signal between them.

**5. A vacuous ordering assertion.** `pagePresentation.test.ts` asserted that
`indexOf("<script ... WORLD_BOOT_SCRIPT ... />")` came before `<React.Suspense`.
That string stopped existing when the script became generated, so `indexOf`
returned -1, and -1 is less than every real index. It passed no matter what the
route did. It now asserts both needles are present before comparing them.

The prepaint stale-timer test was worse than vacuous: it built two isolated
harnesses and compared them, proving nothing about a stale timer. The harness
now keeps one window, document, and pair of storages across repeated runs, and
the two cases the review named are real: a world that reaches `ready` after the
timer was scheduled, and an old timer firing after a newer token claimed the
document.

**6. Storage denial disagreed with hydration.** The script wrapped everything
in one `try`/`catch`, so a browser that refuses `sessionStorage` fell out to
the document pre-paint while hydration probed the canvas and ran the world a
second later. Storage access now has its own guard on both read and write, and
three storage-denied cases joined the equivalence matrix.

**7. The store's `mode` was not write-only.** Repository-wide verification found
one consumer I had missed on the first pass: the dev-hooks `state()` reporter in
`StacksCanvas.tsx`. Diagnostics must keep reporting it, so it now reads
`worldBoot.getView().mode` — one owner, no second copy. `mode`, `setMode`, and
`StacksMode` are gone from the store.

## Shortcuts taken

One, stated plainly: the pre-paint script still writes its eligibility and warm
rules out by hand. It cannot import the machine, so there is no way to have it
literally call the same code. I closed the gap with a test rather than leaving
it on trust — see "Judgement calls".

Nothing else was skipped. No `TODO`, no stubbed branch, no test disabled.

The instruction to use `apply_patch` could not be followed: no such tool is
available in this harness. Edits were made with the Write/Edit tools and small
Python rewrites, which is the same thing by a different name, but it is a
deviation and belongs here.

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

**`tick` is not epoch-scoped.** Every other producer signal is. A tick carries
no claim about the world — it asks whether a deadline held in the current state
has come due — so scoping it would add ceremony without removing a failure
mode. Written down because the asymmetry looks like an oversight otherwise.

**`exit` clears the vignette flag; `start` preserves it.** These look
contradictory and are not. A pass belongs to the page instance: it survives the
gap between the vignette finishing and the streamed homepage data resolving
(which is why `start` preserves it), and it dies with the page (which is why
`exit` clears it). Getting only one of the two right produces either a boot
that waits forever or a boot that reveals on a pass the visitor never saw. Four
orderings are tested.

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
- `src/app/pagePresentation.test.ts` — eligibility-proxy assertion replaced; the
  vacuous ordering check fixed
- `src/app/components/stacks/webglProbe.test.ts` — moved-out cases removed
- `src/app/components/stacks/store.ts` — `mode`, `setMode`, `StacksMode` removed

Deleted:

- `src/app/components/stacks/loading.test.ts` — replaced by the machine tests

Not committed: `next-env.d.ts` (gitignored, generated).

## Automated checks

Run from the worktree root, after `yarn install` and
`SKIP_ENV_VALIDATION=1 npx next typegen`.

| Command                                           | Baseline                           | After                              | Verdict                    |
| ------------------------------------------------- | ---------------------------------- | ---------------------------------- | -------------------------- |
| `npx tsc --noEmit`                                | clean                              | clean                              | unchanged                  |
| `yarn lint`                                       | 0 errors, 1 warning                | 0 errors, 1 warning                | unchanged                  |
| `yarn test`                                       | 6 failed / 1531 passed (195 files) | 6 failed / 1648 passed (196 files) | same six failures, by name |
| `npx vitest run src/app/components/stacks/boot`   | n/a                                | 124 passed                         | new                        |
| `npx vitest run src/app/pagePresentation.test.ts` | 4 passed                           | 5 passed                           | new case                   |
| `npx prettier --check` on changed files           | n/a                                | clean                              | formatted                  |

The six failures after the change are identical by name to the six at baseline.
Net test delta: +117 passing (124 in the boot module, one added to
`pagePresentation`, minus the 7 in the deleted `loading.test.ts`, minus the
single eligibility case moved out of `webglProbe.test.ts`).

New coverage added in the review round:

- Stale readiness from an older generation: `firstFrame`, `assetLoad`,
  `meadowReady` — each asserted to return the _same state object_, not merely
  an equal one.
- Stale failure from an older generation: `contextLost`, `runtimeError`.
- Stale `exit` from an older generation.
- Signals stamped with a generation that does not exist yet.
- Pre-paint timeout then hydrate; timeout then deliberate re-entry; timeout on
  a visitor who was never eligible.
- Vignette `exit -> started -> completed -> start` and
  `exit -> started -> start -> completed`, plus `exit -> start` with nothing
  between, and vignette signals arriving after a demotion.
- Pre-paint stale timer on a shared window: `ready` after scheduling, and an
  old timer after a newer token; plus the retire-then-fire case.
- Three storage-denied rows in the equivalence matrix.
- The totality sweep now runs every event in every state at three generations
  (stale, live, future) rather than one.

Not run: `yarn build` (CLAUDE.md says avoid unless asked), `yarn check:budgets`
(needs a build), and `yarn test:performance` (Playwright, and AGENTS.md forbids
browser automation here).

## Manual review steps

These matter more after the review round than before it. The machine is proven
at its interface; **the adapters are not tested at all**, because this
repository has no DOM test environment (no jsdom, no testing-library, and
vitest runs on the default node environment). `useWorldBoot`,
`useWorldBootScope`, the canvas cleanup, and the window-global handoff between
the pre-paint script and hydration are covered by review and by the checks
below, and by nothing else.

AGENTS.md forbids browser automation here, so I ran none of these.

1. Cold load with an empty profile: boot vignette, then the room. `data-world`
   goes `pending` then `ready`; the flat page unmounts about 420ms later.
2. Reload within three days: `data-world` starts at `warm`, shorter handoff,
   vignette still plays.
3. `prefers-reduced-motion: reduce` and Save-Data: no attribute, flat document,
   no world chunk fetched.
4. `?og-capture`: `data-og-capture` on `<html>`, chrome hidden, no hang
   backstop.
5. **SPA re-entry.** Navigate to `/books` and back, repeatedly and quickly.
   Both attributes clear on exit, a fresh boot on return, no overscroll lock on
   the document route, and the room reveals every time. This is the path the
   epoch work exists for; watch for a boot that hangs behind the vignette,
   which would mean a readiness signal is being dropped as stale when it should
   not be.
6. **Epoch check in the console.** `window.__stacks?.state().mode` still
   reports `flat`/`world` (it now reads the boot machine, not the store).
7. Force a context loss (`WEBGL_lose_context`) after reveal: the flat document
   comes back animated. Then re-enter from `/books` and confirm the new boot is
   unaffected.
8. **Pre-paint timeout then hydration.** Throttle to a crawl or delay the
   bundle past twenty seconds. The document should come back at twenty seconds
   and _stay_. Before this round it was covered again by the boot screen when
   React finally arrived. Then navigate away and back: that visit should boot
   normally.
9. Storage disabled (Safari "Block All Cookies", or a locked-down private
   window) on a WebGL-capable browser: the world should run, and should not
   flash the document first.
10. With JS blocked or the bundle 404ing: the boot screen retires after twenty
    seconds and the document appears.
11. Scene Diagnostics and the performance trace: both `<Profiler>` wrappers and
    `recordPerformanceCommit` are unchanged, and the dev-hooks `state()`
    reporter still returns every field it used to.
12. `yarn check:budgets` after a build — see the bundle note below.

## Potential regressions and edge cases

1. **The flat-retire timer is scheduled one effect later.** It used to be a
   `setTimeout` inside the `revealed` effect. It is now a `setTimeout` in the
   deadline effect, which React runs after the commit that carried the reveal.
   The deadline is absolute (`reveal + 420ms`) and the timer is computed as
   `deadlineAt - performance.now()`, so the target time is identical; only the
   moment of scheduling moves, by at most one frame. Not visible.
2. **Epoch 0 exists and nothing may address it.** `StacksHome` derives its
   scope from `boot.epoch`, which is 0 on the first render. Nothing inside the
   world shell exists at epoch 0, so no epoch-0 signal can be produced — but
   this is an argument, not a test. If the world shell ever renders before
   `start`, first-frame reporting would silently stop.
3. **`useWorldBootScope` captures at first render, not at mount.** With
   `useState(initializer)` that is the same moment in practice. Under a future
   concurrent render that is discarded and retried, a scope could be taken for
   a generation the component never actually mounted under; the signal would
   then be dropped rather than misapplied, which is the safe direction.
4. **The pre-paint outcome is consumed by whoever starts first.**
   `consumePrepaintTimeout` deletes the global. If a second boot owner ever
   existed on one page, the second would not see the timeout. Nothing mounts
   two `StacksHome`.
5. **A stale `exit` is now ignored.** That is the fix, but it means an
   unmount whose cleanup is delayed past a newer `start` leaves the attribute
   set. That is correct — the newer boot owns it — and it is tested.
6. **React StrictMode double-mount** (dev only) produces start(1), exit(1),
   start(2). Each is correctly scoped, and the vignette flag is cleared by the
   exit and re-established by the vignette's own signals. Dev-only, unrun.
7. **`applyDocument` writes `data-og-capture` on every state change** rather
   than once at mount. `BootScreen`'s `MutationObserver` filters on
   `data-world` only, so it is not woken by this.
8. **`useSyncExternalStore` snapshot identity.** The session's initial snapshot
   and `SERVER_WORLD_BOOT_VIEW` are the same object, so hydration does not
   schedule a spurious re-render. Worth keeping that way.
9. **Crawler behavior is unchanged by construction.** `flatMounted` is
   `status !== "live"`, so the semantic document is in the DOM through every
   state except a fully revealed world, and CSS still does the hiding.
10. **Bundle size is still unmeasured, and the module grew.** The review round
    added the epoch plumbing, the outcome handoff, and `useWorldBootScope` to
    the boot module, and `useWorldBoot.ts` is now imported by `Meadow` and
    `SceneEnvironment` — which pulls a `"use client"` React hook module into
    the lazy scene chunk that previously imported only the session. My earlier
    "roughly neutral, ~4KB" estimate was a guess and remains one; I have run no
    build and no `check:budgets`. Treat it as unknown, not as neutral.

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

**journey-analytics.** The scene store no longer has a `mode` field. Anything
that needs to know which homepage is on screen must read it from the boot view
— `useWorldBoot().mode` inside React, or `worldBoot.getView().mode` outside it.
Do not add a `mode` back to the store to make an analytics hook convenient:
that is the duplicate ownership this task removed, and the dev-hooks reporter
in `StacksCanvas.tsx:358` is the worked example of reading it from the machine.
`worldBoot.subscribe()` is available for anything that needs to observe
transitions, and `view.status` / `view.failure` distinguish a policy decision
(`ineligible`) from a demotion (`failed`, with `hang` / `runtimeError` /
`contextLost`).

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

The review round added one new window global, `__stacksWorldBootOutcome`. It is
per-document-load and never persisted, so a rollback simply leaves it unread.

Two commits now: the first builds the machine, the second fixes the lifecycle
defects. Reverting only the second restores the shipped behavior of the first,
including its stale-signal bugs — so if a revert is needed, revert both.

## Recommended next steps

1. Walk the twelve manual checks above, in one browser session, with steps 5
   and 8 first. They are the two the review round exists for, and they are the
   two with no automated coverage.
2. Consider whether this repository should gain a DOM test environment. Three
   of the six defects the review found live in React adapters that no test in
   this repository can currently reach. A vitest `environment: "jsdom"` plus
   `@testing-library/react` would let `useWorldBoot`, `useWorldBootScope`, and
   the canvas cleanup be tested at the same standard as the machine. That is a
   toolchain decision, not mine to make here.
3. Run `yarn build && yarn check:budgets`. The bundle claim in this ledger is
   an estimate and should be replaced with a number.
4. Surface `worldBoot.getState()` in Scene Diagnostics. The machine now knows
   the epoch, the status, and exactly why the document came back; nothing shows
   it. That was the failure mode the `CanvasBoundary` comment says cost a
   teammate an afternoon.
5. Decide with test-contracts whether `pagePresentation.test.ts` should keep
   reading source at all. Its ordering assertion silently rotted once already.
