# Stacks scrolling stalls: DOM style invalidation

## Diagnosis

The captures show substantial main-thread style work even with meadow and
postprocessing disabled. Scene complexity alone does not explain these stalls.

| Supplied capture | Overall FPS | Frame p95 | Forced style/layout within attributed script time |
| --- | ---: | ---: | ---: |
| `03-22-04.577Z` | 21.6 | 80.5 ms | 3,904 / 4,938 ms |
| `03-32-25.579Z`, UI hidden during capture | 58.4 | 47.6 ms | 1,839 / 2,519 ms |

The second capture spends much of its stationary time near 120 FPS, but travel
still stalls. Shader program counts stay constant within each capture. Physics
is negligible in the first capture. These observations do not rule out every
GPU bottleneck, but they direct this investigation to the main thread.

Chrome tracing against a local production build identified document-wide CSS
invalidation. These selectors were responsible:

```css
[data-stacks-desktop-panel] :has(> [data-placard-surface]) > :not([data-placard-surface])
html:has(.PhotoView-Portal) .stacks-og-ui *
```

Ordinary descendant additions and removals made Chrome reconsider thousands of
elements. Navigation then forced that pending work through geometry reads,
including the hidden `IllustratedTraverse` component's `clientWidth` read.
The read explains where the cost was charged, while the selectors explain why
so much style work was pending. Local traces showed expensive style
recalculation and comparatively cheap layout computation.

`H` applies `visibility: hidden`. It preserves the DOM and its geometry, so it
does not remove this work. Lowering resolution or turning off grass also does
not reduce DOM style calculation.

## Changes

- Match card foregrounds through their preceding surface sibling. All 42
  mounted foreground elements match the same set before and after the change.
  The declarations for glass, entrances, fades, and reduced motion remain intact.
- Replace the document-wide photo-viewer lookup with `data-photo-view`. A
  homepage observer watches direct children of `body` for PhotoView portals and
  their closing class. Unrelated nested content updates do not update the root.
- Stop the boot controller from rewriting unchanged `data-world` and
  `data-room-view` values when hidden illustration readiness changes.

This removes broad coupling between content updates and the scene's frame loop.
It does not require changing the renderer or reducing production visual quality.

## Verification

The new Playwright regression test performs synchronous, local DOM updates in
a real production page and counts affected elements in Chrome's trace. It
failed before the fix with 3,530 elements restyled for one update. It passes
with both visible UI and UI hidden using `H`. The assertion measures affected
elements rather than wall time so it also works with software WebGL.

The boot-controller regression observed two root-attribute mutations before the
guard and zero afterward. Photo-viewer tests include the real `PhotoSlider`
open, closing-animation, and unmount lifecycle. A browser check also confirmed
that opening a scene photo hides the navigation and closing it restores it.

```sh
pnpm exec next build
pnpm exec playwright test tests/e2e/stacks-style-invalidation.spec.ts --workers=1
```

Local timing experiments used Chrome 152, a 2036-by-1270 viewport, and scripted
wheel input. Removing the broad selectors reduced the worst observed scrolling
style recalculation from 90 ms to 22 ms in production-build samples. A separate
hidden-UI experiment reduced the remaining worst style recalculation from
31 ms to 14 ms by suppressing unchanged root writes. These are separate
experiments, not additive savings or production FPS guarantees.

The final production build, after reloading to remove all temporary probes,
averaged 117 FPS with a 9.2 ms frame p95 during six seconds of hidden-UI wheel
travel with postprocessing and meadow off. Its largest style recalculation was
27.7 ms, so the 14 ms experimental result is not a worst-case guarantee.
The isolated local-content probe went from 4,657 affected elements and 30.6 ms
before the selector changes to 268 elements and 2.3 ms in the final build.
Validation finished with 63 targeted unit tests, both Playwright cases,
targeted ESLint, and the production build passing.

The supplied production captures use different viewport sizes and Chrome 153.
Local timing therefore supports the mechanism and the fix, but cannot establish
the exact improvement on that production session. Occasional section-change
stalls remain worth measuring after deployment; average FPS alone will hide them.

## Guardrails

Keep frequently changing state local to the elements that consume it. Avoid
document-wide relational selectors combined with wildcard descendant rules in
the resident room. Keep root attributes for actual presentation transitions,
and make writes idempotent. Performance checks need DOM invalidation coverage
alongside draw calls, triangles, and shader counts.

No Field Note was added. This change optimizes existing behavior and introduces
no visitor discovery or semantic achievement.
