# Stacks frame pacing: hidden illustration and false resizes

This follows the production style-invalidation fix in `88f46c1f`. Further work
is on `perf/stacks-frame-pacing-2026-09-15`; it must not merge to `main` during
the overnight investigation.

## Two confirmed sources of unnecessary work

### Hidden illustration remains active during 3D travel

`IllustratedRoom` previously remained subscribed to the selected section while
invisible. Changing sections decoded the newly selected illustration and read
its geometry. `IllustratedTraverse` also read `clientWidth` in a layout effect.
Those reads could force pending panel style calculation into the React commit.

A React `Activity` boundary now pauses the illustrated subtree's effects and
subscriptions while 3D owns presentation. The DOM and scroll state remain
resident. Returning to 2D resumes the same row at the current section. A latch
outside the boundary retires the initial Golf entrance even while the inner
effects are paused. Cleanup removes the previous artwork-ready marker.

Recovery can wake the row without a manual dimension handoff. Its mount effect
resets the retained navigation refs, so that wake snaps to the selected shelf
and clears interrupted travel before geometry is measured. Two regressions
caught the original wake behavior: a smooth sweep to the new shelf and a stale
mid-scroll position. Ordinary visible 2D navigation still scrolls smoothly.

The regression test initially observed three image decodes during hidden 3D
travel. It now observes zero decodes, geometry reads, or readiness reports, and
confirms that decoding resumes for the selected section on return.

### Canvas reconfiguration publishes unchanged dimensions

The installed `@react-three/fiber` version is 9.7.0. Its `Canvas` forwards a full
measured rectangle to `configure()`: width, height, top, left, x, y, right, and
bottom. The renderer stores only width, height, top, and left. The comparison
rejects the extra keys, so an ordinary parent commit calls `setSize()` again
with exactly the same four values.

That setter creates new `size` and `viewport` objects. Subscribers rerender,
and Drei's `ScrollControls` effect reconnects because its `size` dependency has
changed identity. Reconnection reads `scrollWidth`, forcing pending styles.
A browser probe recorded repeated `setSize(2036, 1270, 0, 0)` calls with an
already identical size. The production browser regression recorded 14 scroll
listener reconnections across five section changes before the guard and zero
after it. A real resize still changes the framebuffer and permits travel.

`CanvasSizeBoundary` installs an idempotent setter for this renderer's lifetime.
It compares all four dimensions against the current state and forwards real
size or position changes. It survives retained-room pauses and repeated effect
setup. It changes no camera pose, pixel budget, effect setting, or animation. This is
a local workaround for the installed R3F version. Same-bounds calls also stop
recomputing camera-relative viewport values; scene consumers use only the
unchanged viewport DPR. The Golf label does not enable the Html occlusion mesh
that reads viewport.factor. Remove this workaround when upstream compares the
measured and stored bounds consistently.

The regression uses the actual R3F `createRoot()` and `configure()` functions.
Eight reconfigurations initially produced eight false resize publications;
they now produce zero. A real portrait resize still changes camera aspect and
calls the renderer's resize method once. Repositioning also publishes normally.
Changing DPR to 1.5 at unchanged CSS bounds still updates the renderer's pixel
ratio and backing size once, without publishing a false CSS-size change.

R3F already guards its renderer resize subscription by numeric dimensions.
This bug causes React and DOM work; it is **not** evidence that unchanged sizes
were reallocating GPU render targets.

## Reduced motion comparison

Startup and live toggles are different paths. The boot policy declines WebGL
when reduced motion is enabled at startup and presents the illustrated room.
Toggling the preference after WebGL starts preserves the live renderer.
`CameraRig` reads the live media query; CSS media queries also respond live.
Several ambient effects instead snapshot the preference at mount. Therefore a
startup comparison alone cannot isolate the cost of motion within the same
renderer.

The benchmark runs no-preference, live reduced motion, and live restoration in
one context, then creates a separate startup-reduced context. Every result
records the actual renderer/presentation and resolved quality. It also records
which panels were visited, so an input simulation that fails to move cannot
silently pass as fast scrolling.

## Reproduction

Use a production build. Run builds and browser commands through the shared
`benchmark_lock.py --author frame-pacing-codex -- <command>` wrapper. Inside
the slot, run the shared `tools/preflight.py` before and after every capture.
A contended gate permits functional checks with `--warn-only`, but disqualifies
timing claims.

The focused browser command is:

```sh
pnpm exec playwright test tests/e2e/stacks-canvas-sizing.spec.ts \
  tests/e2e/stacks-illustration-residency.spec.ts \
  tests/e2e/stacks-style-invalidation.spec.ts --workers=1
```

For a same-build motion matrix, run this inside the gated slot:

```sh
node scripts/stacks-frame-pacing-benchmark.mjs \
  --out /tmp/stacks-frame-pacing.json --trace
```

The benchmark uses headed system Chrome, a 2036 × 1270 desktop viewport at
DPR 2, and a 393 × 852 touch viewport at DPR 3. The latter simulates touch input
and viewport behavior on the host GPU; it is not a physical iPhone benchmark.
Blank-page rAF samples establish the browser's cadence before CPU throttling
and before navigation. The artifact retains raw intervals, p95/p99, maximum,
counts above 25/50 ms, and intervals longer than 1.5 observed refresh periods.
These measure main-thread rAF delivery, not display-presented frames or
compositor drops. Style tracing runs separately from frame-time trials.

The URL pins the Safety profile and uses `harness=1`. Results compare that
instrumented workload only; they do not establish ordinary-visit absolute FPS.
Each window checks framebuffer dimensions, resolved DPR/pixels, quality axes,
and transition history. Input delivery counts and focus/visibility checks
reject misleading workloads. The runner also requires travel across at least
two panels, rejects runtime errors and paused overlay/ride workloads, and
checks that presentation state stays consistent within each window. Failed
cases retain their state and a screenshot before cleanup. Independent later
cases continue, but the command exits nonzero if any case fails.

Early exploratory timing samples overlapped other lanes' browsers/builds after
the portfolio started. They are excluded from performance claims. Operation
counts from those probes remain useful for diagnosing the dependency chain.

## Verification and limits

Product commit: `1c97c93a184af5526078171af543ddd3e7dd4cd0`, following the
shared CDP test-typing prerequisite `ba4781172e38c5988cc3697cfb280782a59e2407`.
The dependency lock SHA-256 is
`0fd44b43ac3e6dccac95a1942e3f396fe62d9add3081f09a638dcafcda465bf1`.

- Full lint and TypeScript checks passed. The repository's `pnpm test` passed
  563 files / 4,749 tests, with 24 tests skipped.
- A fresh Next production build generated 605 pages. Search and weight-log
  privacy boundary checks passed.
- All four production browser regressions passed: canvas sizing, hidden
  illustration residency with actual WebGL context loss, and style
  invalidation with UI visible and hidden. Recovery landed on the selected
  shelf using the retained illustrated row.
- The subsequent DPR-only regression passed against the real R3F renderer
  store. The auditor accepted the exact product commit; an independent Claude
  review found no remaining structural blocker.

The first browser build included a separate mobile material draft. A fresh
clean build of structural branch `eaf1588c` now passes the standard `pnpm build`
workflow and both privacy boundaries. Its build ID is
`ZMCKTs03vniQTnG13h5Ir`. PR #79 also passed quality-contracts, check, and the
Vercel preview build at that commit. Material source remains on a separate
branch and is excluded from this PR.

The clean-build failures were in verification setup. Direct `next build`
skipped the standard prebuild, leaving the fresh checkout without its private
search index. The standard `pnpm build` workflow passed after the checkout's
ignored input was restored. The next attempt failed during Playwright test
collection because its temporary config imported another checkout and loaded
`@playwright/test` twice. Binding the config to the tested checkout fixed
collection. These failures are retained with their original logs.

The clean native run passed canvas sizing and both UI style tests. Its
illustration test reached the selected 2D row, then failed on the second R.
A differential probe reproduced the same failure on baseline and candidate:
the illustration is visible during the 420 ms flattening transition, while
`request3D()` still rejects the request because the world remains mounted.
Both stayed illustrated for the entire ten-second observation. Rapid second-R
input during flattening remains ignored; this change does not fix it.

The residency regression now waits for completed `data-boot-status=illustrated`
before requesting 3D again. That focused native retry passed on the clean
build, including return to section 6 and actual WebGL context-loss recovery
to section 3. Together with the earlier three passes, all four focused cases
passed on the clean structural product. The follow-up changes only test
sequencing, benchmark metadata, and this report; product bytes are unchanged.

The first native Chrome baseline matrix completed all four desktop cases and
mobile no-preference. The focused mobile follow-up completed no-preference
and startup reduced motion. Startup selected the illustrated room on both
desktop and mobile. Live desktop toggles kept WebGL and butterflies mounted.

The mobile live-reduce case opened Search during rapid reverse travel. The
updated workload check caught `searchOpen=true` and rejected the changed
presentation. Live restoration was then correctly rejected while Search
remained open. Search pauses the renderer, leaving its movement flag latched
until rendering resumes. This explains the earlier movement-settle timeout;
it supplies no measurement of whole-scene motion cost. The follow-up retained
both failed states and screenshots, then completed the independent startup
case across all seven panels. A quiet-host comparison needs a controlled
travel path that excludes Search activation.

The auditor accepted the strengthened runner. Its subsequent metadata change
serializes the existing 120 Hz calibration verdict without changing any gate.
The standalone mobile runner reached its explicit two-case failure, then
waited indefinitely for the browser-close acknowledgment after contexts and
the browser process had exited. Its owned process was terminated and the
wrapper recorded exit 143. This cleanup failure is retained with the raw
results; it is not a successful benchmark command.

Every bracketing preflight was contended. No timing result from these overnight
runs is accepted, and smooth 120 fps has not been established. Raw logs and
captures are retained in the shared overnight coordination artifacts.

No Field Note is added: this changes implementation cost of an existing
experience and introduces no visitor discovery or semantic success.
