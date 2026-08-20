# iOS Safari homepage performance

Date: 2026-08-19
Repository snapshot: `5c4f769` plus the current uncommitted homepage work
Scope: source review and primary-source research; no product changes and no live-device capture

## Recommendation

This is mostly a rendering-budget problem, not evidence of a Safari-specific
bug. The homepage asks a phone to render a large, continuously animated 3D
scene, run several full-frame effects, and blur the live canvas again through
the mobile sheet. Safari already runs WebGL 2 over Metal. The main opportunity
is to ask the GPU to do much less work per frame and to stop asking for frames
when the visitor is not moving.

The largest absolute lever is to make the flat page the mobile default and put
the 3D room behind an explicit "Enter 3D" control. If automatic 3D entry is a
product requirement, the best compromise is a strict mobile profile that
starts cheap instead of waiting for the adaptive ladder to discover a slow
device.

For automatic 3D on phones, I would ship this order:

1. Use sampled or flat placard glass on narrow viewports. Remove live
   `backdrop-filter` from the mobile sheet.
2. Start without N8AO, depth of field, tilt-shift, or the rest of the full
   postprocessing chain. Add back one measured finishing effect only if the
   frame budget permits it.
3. Cap the initial mobile DPR at 1.5 to 2.0. Regress it further during travel.
4. Stop the 60 fps loop at rest, or use a 30 fps mobile idle cadence if the
   ambient motion must remain visible.
5. Mount and simulate the active unit and its neighbors, not all seven units.
   Load later unit code and assets as the visitor approaches.
6. Audit decoded texture and render-target memory on a real iPhone.

The first four should produce much larger gains than React memoization, small
CSS cleanups, or a WebGPU migration.

## What the current implementation asks of an iPhone

The stack is Next.js 16, React 19, Three.js 0.185, React Three Fiber 9, Drei,
`@react-three/postprocessing`, N8AO, and Cannon.

### It starts expensive

Automatic quality starts at `balanced` unless the same session has already
learned a lower profile. On a 390 by 844 CSS-pixel iPhone at device DPR 3, the
balanced plan resolves to DPR 2.75, about 2.49 million drawing-buffer pixels.
The safety plan resolves to DPR 2, about 1.32 million pixels. That is 47%
fewer pixels before counting any extra postprocessing targets or passes.

The balanced profile still enables:

- a full composer;
- half-resolution, low-quality N8AO;
- six-level bloom at half resolution;
- depth of field at half resolution;
- tilt-shift, vignette, tone mapping, the custom grade, noise, adaptive
  sharpening, and SMAA.

The canvas also requests an antialiased WebGL context. The composer uses
non-multisampled targets on the normal profiles, but the antialiased context
remains part of the direct-render fallback.

Three.js's own responsive-rendering guide explains the underlying multiplier:
a DPR 3 phone has nine physical pixels for every CSS pixel, and heavy scenes
usually should not render at full device resolution. It recommends a maximum
drawing-buffer pixel count to avoid excessive GPU load, low frame rates, and
high power consumption. The current site has a pixel budget, but its balanced
mobile ceiling is still high and its minimum DPR floors are generous.
[Three.js responsive rendering](https://threejs.org/manual/en/responsive.html)

Relevant code:
`src/app/components/stacks/StacksCanvas.tsx` and
`src/app/components/stacks/scene/quality.ts`.

### The canvas and browser both postprocess the same frame

The mobile sheet applies a live `backdrop-filter` over the changing canvas:
42px blur in light mode and 32px in dark mode. The sheet's nested cards
correctly disable their own blur, but the viewport-width sheet remains a live
backdrop surface. The default performance setting is `placardGlassMode:
"native"`, even though the repository already has sampled and flat modes.

WebKit documents the mechanism directly. It must capture the content behind
the element, filter it, and composite the result. WebKit warns that backdrop
filters force additional rendering passes and should be used only where
necessary. It specifically notes that the backdrop may be WebGL or other
dynamic content. [WebKit backdrop filters](https://webkit.org/blog/3632/introducing-backdrop-filters/)

That means an ordinary mobile frame currently pays for the 3D scene, the WebGL
effect composer, and a browser-level blur of the resulting live scene under
the sheet. This is the highest-confidence avoidable stack in the current
source.

Relevant code:
`src/app/components/stacks/dom/PlacardLayer.tsx`,
`src/app/components/stacks/scene/Effects.tsx`, and
`src/app/components/stacks/scene/scenePerformance.ts`.

### It renders continuously

The canvas does not specify `frameloop`, so React Three Fiber uses its normal
continuous loop. There are legitimate moving elements, including camera
damping, meadow motion, wildlife, steam, petals, hover motion, physics, and
ambient effects. The result is still a full canvas render while the visitor
is reading or idle.

WebKit says the CPU and GPU should return to idle quickly after interaction.
It calls continuous animation and unnecessary canvas drawing out directly,
and advises developers not to draw a canvas when its content is not changing.
[WebKit power guidance](https://webkit.org/blog/8970/how-web-content-can-affect-power-usage/)

React Three Fiber says the same thing from the framework side. Its official
guide describes the 60 fps loop as a major battery cost, documents
`frameloop="demand"`, and recommends temporarily reducing resolution and
skipping effects such as ambient occlusion during movement.
[R3F performance scaling](https://r3f.docs.pmnd.rs/advanced/scaling-performance)

The room has some good local suspension work already, but it lacks a single
frame-policy decision such as:

- travel or direct interaction: up to 60 fps at regressed quality;
- brief settle: 30 or 60 fps until damping completes;
- idle reading: no frames unless state changes, or a capped 20 to 30 fps if a
  small amount of ambient life is required;
- expanded sheet or modal: pause most world animation and render only on
  changes.

### The first visit learns too late

The adaptive policy waits for a two-second rolling frame window. A decline
must persist for 1.75 seconds, transitions have cooldowns, and direct render
arrives only after the safety profile remains severely slow for another eight
seconds. The learned profile is stored in session storage, so it helps later
loads in the same session, not the first impression on that phone.

The policy is thoughtful about avoiding false downgrades, but it is tuned to
protect visual quality. On a device that needs direct rendering, the first
visit can remain expensive for roughly ten seconds before reaching it. Travel
also queues quality declines until after the camera settles, which protects
the transition from visible changes but does not make the expensive travel
itself cheaper.

R3F's guidance recommends the opposite shape for motion: regress resolution,
effects, textures, and shadows while movement is happening, then restore them
after a debounce. [R3F movement regression](https://r3f.docs.pmnd.rs/advanced/scaling-performance#movement-regression)

### All seven units exist in the scene

`Scene.tsx` statically imports and mounts all seven unit components. Texture
loading is staged and role-sized, which is good, but every unit's geometry and
behavior code still enters the scene chunk and scene graph. `useUnitLod`
latches textured content once a unit has been approached, so memory grows as a
visitor crosses the room and does not shrink again.

Next.js recommends lazy loading Client Components and imported libraries to
reduce the JavaScript needed for a route. The top-level canvas already follows
that advice. Splitting unit implementation code at the same boundary would
reduce the work between "Enter the room" and the first useful frame, while
leaving the server-rendered flat content intact.
[Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading)

R3F recommends reducing draw calls, using instancing and level of detail, and
avoiding unnecessary object construction. The repository already applies
several of those ideas. The next larger step is neighborhood ownership: keep
the active unit and adjacent units live, use a very cheap shell for the rest,
and suspend simulations that cannot affect the current camera.
[R3F performance scaling](https://r3f.docs.pmnd.rs/advanced/scaling-performance)

This will matter most if a Safari trace shows main-thread or vertex pressure
after the full-frame effects are removed. It should not precede the simpler
blur, composer, and DPR experiments.

### Texture work is better than it used to be, but memory still matters

The scene now selects 256px and 512px variants for most local photos instead
of decoding every 768px to 1024px master. It also stages current and adjacent
unit textures. Those are real improvements.

There are still 27 local photo textures, remote covers and stills, model
atlases, procedural canvas textures, and composer render targets. Three.js
estimates ordinary texture memory at `width * height * 4 * 1.33` bytes with a
full mip chain, regardless of the JPEG or WebP download size. It also notes
that render targets allocate textures, framebuffers, and renderbuffers.
[Three.js texture memory](https://threejs.org/manual/en/textures.html),
[Three.js disposal guidance](https://threejs.org/manual/en/how-to-dispose-of-objects.html)

KTX2 can reduce GPU texture memory for suitable scene assets because Three's
loader transcodes Basis Universal data to a compressed format supported by
the device. It is worth a later experiment for reusable atlases and opaque
scene textures, not the first response to a full-frame fill-rate problem.
[Three.js KTX2 loader](https://threejs.org/docs/pages/KTX2Loader.html)

## Ranked levers

| Rank | Change | Expected effect | Confidence | Product cost |
| ---: | --- | --- | --- | --- |
| 1 | Flat mobile default with explicit 3D entry | Removes almost all 3D startup and runtime cost until requested | Very high | High |
| 2 | Sampled or flat mobile glass, no full mobile composer | Removes stacked browser and WebGL full-frame work | Very high | Medium |
| 3 | Mobile DPR 1.5 to 2.0, lower during travel | Cuts fragment work and render-target memory quadratically | Very high | Low to medium |
| 4 | Demand or reduced idle cadence | Reduces sustained CPU, GPU, battery, and thermal pressure | High | Medium because ambient motion needs a policy |
| 5 | Active-neighborhood scene and simulation | Cuts JavaScript, physics, draw submission, and shader work | High if traces show CPU or vertex pressure | High |
| 6 | Split unit code and stop background prewarming on phones | Improves cold start and first interaction | Medium to high | Medium |
| 7 | Texture-memory audit and selective KTX2 | Reduces memory pressure and context-loss risk | Medium | Medium |
| 8 | Small React, CSS, and listener cleanup | Helps isolated long tasks and scrolling | Low until measured | Low |

The first rank is a product decision. Ranks two through four are the best path
if the room must open automatically.

## A practical mobile profile

A conservative first implementation would preserve the room and its identity
props while changing the rendering policy:

- Select the profile from viewport and observed performance, not user-agent
  sniffing.
- Start narrow viewports at DPR 1.5 or 1.75. Permit a measured recovery to 2.0.
- Use `placardGlassMode: "sampled"` or `"flat"` below 1200px.
- Start with direct rendering. If direct rendering has enough headroom, add a
  small finishing composer with tone mapping and grade only. Test bloom last.
- Keep ambient occlusion, depth of field, tilt-shift, noise, SMAA, and adaptive
  sharpening off on mobile until each earns its frame cost.
- During travel, reduce DPR and suspend distant wildlife, meadow detail,
  physics prewarming, and nonessential `useFrame` work immediately.
- After settling, render on demand. If the room feels dead, schedule a limited
  ambient burst or cap idle animation at 30 fps.
- When the sheet is expanded or a modal is open, freeze the world except for
  changes the visitor can see through the remaining exposed area.

This is more reliable than treating WebGL limits such as `MAX_TEXTURE_SIZE`
and `MAX_SAMPLES` as proof that the device is fast. Those values describe
capability, not the sustainable cost of this scene under Safari's current
thermal and memory conditions.

## Measurement plan

The repository already has a useful scene trace. It records frame-time
distributions, travel versus settled frames, renderer calls and triangles,
texture, geometry and program counts, physics time, quality transitions,
resource timing, and supported long-task signals. Production diagnostics can
be loaded with `?debug=1` and can switch the glass mode among native, sampled,
and flat.

Run the following on the affected physical iPhone, connected to Safari Web
Inspector. Apple documents remote inspection for iOS and iPadOS, and Safari's
Timelines view separates JavaScript, layout, paint, composite, CPU, memory,
and per-frame cost.
[Apple iOS inspection](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios),
[WebKit Timelines reference](https://webkit.org/web-inspector/timelines-tab/)

Capture at least 15 seconds for each case. Apple's CPU-usage guidance says a
15-second or longer recording gives a more useful sample.
[Apple WWDC19 CPU profiling](https://developer.apple.com/videos/play/wwdc2019/513/)

1. Cold load, then leave the first unit idle.
2. Full traverse from the first unit to the last.
3. Scroll inside the expanded mobile sheet.
4. Leave the page untouched for 30 seconds.
5. Repeat in light and dark mode because the glass filters differ.

Use the existing switches to establish causality:

| Variant | Purpose |
| --- | --- |
| `/?quality=balanced&nopostfx&debug=1` | Isolate the full WebGL composer |
| `/?quality=safety&debug=1` | Test the lower-DPR scene with finishing effects |
| `/?quality=safety&nopostfx&debug=1` | Test the lower-DPR direct scene |
| `/?quality=balanced&nodof&notiltshift&debug=1` | Test the two spatial focus effects |
| Diagnostics glass: native, sampled, flat | Isolate the browser backdrop pass |

For each variant, record:

- cold time to the first useful room frame;
- frame-time p50, p95, p99, and dropped-frame ratio;
- settled and travel results separately;
- Safari Frames and CPU timelines;
- layer memory and paint count for the mobile sheet;
- `renderer.info` calls, triangles, textures, geometries, and programs;
- memory before travel, after reaching unit seven, and after returning;
- context loss or tab reload;
- device model, iOS version, theme, viewport, and device DPR.

Do not start with a broad refactor. If `nopostfx` plus sampled glass fixes the
phone, the bottleneck is already identified. If safety plus `nopostfx` is
still slow, inspect CPU, physics, submitted triangles, and the seven-unit
scene. If frames are good but cold entry is bad, split unit code and tighten
asset scheduling.

## Lower-priority ideas

### WebGPU

Safari 26 added WebGPU on iPhone and iPad. WebGPU can reduce API overhead and
maps better to modern GPUs, but a renderer migration does not remove excess
pixels, continuous animation, live blur, or expensive effects. Treat it as a
later prototype after the WebGL scene has a sane mobile budget.
[WebKit Safari 26 features](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)

### OffscreenCanvas

Safari 17 added WebGL in OffscreenCanvas, which can move canvas work away from
the main thread. It may help if profiling shows main-thread submission or
simulation pressure. It does not reduce GPU fill rate, and moving the current
R3F scene to a worker would be a substantial architecture change.
[WebKit Safari 17 features](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/)

### Flat-page `content-visibility`

Safari 18 supports `content-visibility`. It can skip layout and painting for
large offscreen sections of the flat fallback when that fallback is the active
experience. It will not fix the live 3D scene and should not distract from the
canvas budget.
[WebKit Safari 18 features](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)

### Generic layer promotion

Do not add blanket `will-change` or `translateZ(0)` as a Safari fix. WebKit
notes that layers can avoid repaints but cost memory, and too many layers can
be disastrous on memory-constrained devices. Use Safari's Layers view to find
the expensive surfaces first.
[WebKit Layers guidance](https://webkit.org/blog/8262/visualizing-layers-in-web-inspector/)

## Bottom line

The source already contains good groundwork: dynamic scene loading, adaptive
quality, a physical-pixel budget, role-sized photo variants, staged texture
warming, sampled glass, renderer counters, and a detailed trace. The problem
is that the default mobile path still chooses the expensive versions of the
largest effects.

The fastest credible experiment is not a rewrite. On one affected iPhone,
compare normal, `nopostfx`, sampled glass, safety, and safety plus `nopostfx`.
If the likely result holds, ship sampled mobile glass, direct or finish-only
mobile rendering, and a DPR no higher than 2. Then tackle idle cadence and
active-neighborhood simulation.
