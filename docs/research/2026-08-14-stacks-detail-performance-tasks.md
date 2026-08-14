# Stacks detail and performance implementation checklist

Date: 2026-08-14
Source: `2026-08-14-stacks-detail-performance-options.md`
Selected scope: M0, P0, P1, P2, P4, P5, V1, V2, P8

## Ground rules

- [x] Preserve native-looking 3x iPhone still-frame quality when sustainable.
- [x] Keep desktop postprocessing out of the touch bundle.
- [x] Keep the initial homepage bundle at or below 180 KB gzip.
- [x] Make every durable and temporary quality state deterministic in tests.
- [x] Measure a target cost before calling an optimization successful.
- [x] Reject detail that is visible only in artificial close-ups.

## M0 — measurement harness

- [x] Capture refresh estimate, frame-time p50/p95/p99, dropped-frame ratio,
      and sample count over a bounded window.
- [x] Include renderer calls, triangles, points, lines, textures, geometries,
      programs, DPR, framebuffer size, and active quality state.
- [x] Record quality-transition timestamps and reasons.
- [x] Expose deterministic start/read/reset controls through a query-gated
      optimized-build harness while retaining the route budget.
- [x] Add fixed-checkpoint Playwright coverage for units 0, 3, 6 and travel.
- [x] Add a development-only live HUD beside the wordmark for rolling FPS,
      p50/p95, auto/forced rung, motion, FX mode, DPR/framebuffer, and renderer
      counters.

## P0/P1/P2 — adaptive quality

- [x] Keep quality state out of the seven content-unit render props.
- [x] Stabilize model customization objects that would otherwise clone on a
      quality-only render.
- [x] Derive DPR from device DPR, tier cap, CSS area, and a physical-pixel
      budget.
- [x] Preserve a real 3x tier and add sustained fallbacks below 2.5x.
- [x] Separate temporary movement quality from durable device quality.
- [x] Keep travel bookkeeping separate from visual quality so movement cannot
      mutate the world or restore a durable rung.
- [x] Allow at most one conservative recovery after a long stable interval.
- [x] Prevent oscillation and quality changes caused by a single fast fling.

## P4 — meadow spatial culling

- [x] Partition near grass, far grass, and flowers into bounded tiles.
- [x] Preserve the deterministic distribution and rung-major density order.
- [x] Preserve wind, pointer poke, lamp pools, fog, seated view, and boot gust.
- [x] Verify no tile seams, empty bands, or incorrect culling during travel.
- [x] Demonstrate lower submitted instances/triangles at representative views.

## P5/P8 — postprocessing and shader transitions

- [x] Separate expensive spatial effects from the cheap photographic finish.
- [x] Remove N8AO before DPR changes that retain a composer.
- [x] Retain tilt shift, tone mapping, grade, vignette, noise, and antialiasing
      while their
      measured cost remains acceptable.
- [x] Preserve exposure/tone-map parity when the composer mounts or unmounts.
- [x] Idle-precompile only the quality/theme variants that can actually appear.
- [ ] Verify no first-transition shader hitch or render-target leak.

## V1 — role-sized image textures

- [x] Generate local mobile/supporting variants at build time.
- [x] Size hero portraits and large project frames by projected physical pixels.
- [x] Keep small desk photos and covers below their source dimensions.
- [x] Update current/adjacent preload ordering for the selected variants.
- [x] Define and test full-traverse texture residency.
- [x] Compare decoded-pixel estimates before and after.

## V2 — cloud quality tiers

- [x] Shape full-quality clouds as macro mass plus edge erosion.
- [x] Give clouds soft tops, flatter/darker bodies, and restrained sun rims.
- [x] Compile unused high-detail cloud work out of lower tiers.
- [x] Keep simplified clouds recognizable instead of deleting them.
- [x] Keep cloud structure stable during movement; reject temporary erosion
      switching after owner review exposed visible morphing.
- [x] Capture deterministic light/dark, opening/middle/end, and seated views.

## Shared verification

- [x] Unit tests.
- [x] TypeScript.
- [x] ESLint.
- [x] Prettier.
- [x] `check:meadow`.
- [x] Route/model budget checks.
- [x] Existing and new Playwright coverage.
- [ ] Light/dark screenshots at 2048x613, 1440x900, and 390x664 @3x.
- [x] Ordinary travel, maximum-speed fling, theme flip, and seat transition.
- [ ] Full-traverse texture/memory snapshot and repeated theme-flip leak check.
- [ ] Real iPhone visual/performance review with the owner.

## Evidence log

- Production iPhone emulation: 390×844 CSS, 1170×2532 framebuffer, DPR 3,
  durable rung 0, touch postprocessing off.
- Production browser harness: 3/3 Playwright checks pass, including travel,
  forced rung changes, renderer counters, and zero page/console errors.
- Static gates: 40 test files / 217 tests, TypeScript, Prettier, and ESLint pass
  (one pre-existing weightlifting warning remains outside this scope).
- Meadow: 21 focused tests plus 30,893 headless boundary assertions pass.
  Representative full-scene totals are about 332k–394k triangles versus the
  previous uncullable meadow alone at about 592k triangles; draw calls rise as
  expected in exchange for the vertex reduction.
- Photos: selected variants total 3.69 MP / ~18.7 MiB estimated mipmapped
  residency / 686.8 KiB transfer, down from 20.43 MP / ~103.7 MiB / ~2.0 MiB.
- Production homepage entry: 177.3 KB gzip against a 180 KB budget.
- The development HUD uses whole-frame multi-pass renderer counters and is
  absent from production chunks; it adds zero bytes to the production entry.
- Regression found during owner review: travel changed meadow density and made
  grass pop. A red/green unit test now locks density to durable quality only;
  a second red/green test locks cloud structure too. Movement no longer changes
  grass, clouds, DPR, postprocessing, or any other visual quality tier.
- Owner review also rejected removing flowers, Golden Gate/city linework, and
  the approved side tilt shift before cheaper costs. Flowers and landmark
  details now persist at every rung; tilt shift persists through full and
  finish modes. The ladder sheds N8AO, bloom/DoF, DPR, dust, grass geometry,
  analytic grounding, and finally the composer first.
