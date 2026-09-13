# Projects boot prototype comparison

Status: both six-case capture matrices reviewed. The visual direction is unapproved.

The subsequent complete composition is documented in
[`Projects boot design review`](2026-09-11-projects-boot-design.md) and available
in the [full Projects preview](http://127.0.0.1:3322/admin/projects-boot-prototype?viewport=desktop).

Live review: <http://localhost:3330/admin/boot-comparison>. The development-only
page reads the worktrees directly and refreshes their available captures. It
includes both themes, three viewports, original and reduced-palette detail
choices, artwork payloads, and a frozen live-shelf reference.

The first owner response to this page was "looks pretty mid at best dawg".
There is no visual approval. I agree that the partial drawings do not establish
the quality required for a visitor-facing loading screen.

Both agents started at `f54e6e2`, using the same Codex configuration. The scope
is a Projects specimen: Mac, couch photograph and frame, trophy, two circuit
boards, and shelf structure. The rest of the shelf is intentionally omitted.
Neither prototype changes the production boot presentation or ships an OG card.

| Approach                                   | Worktree branch               | Preview                                                   |
| ------------------------------------------ | ----------------------------- | --------------------------------------------------------- |
| A, exported geometry and CPU rendering     | `prototype/boot-geometry`     | <http://127.0.0.1:3321/admin/boot-prototype-geometry>     |
| B, Three masks and projected detail images | `prototype/boot-render-masks` | <http://127.0.0.1:3322/admin/boot-render-masks-prototype> |

The coordinator state and exact worktree paths are in
[`boot-prototype-run.json`](boot-prototype-run.json). Each worktree contains its
own `docs/reviews/boot-prototype-RESULT.md`, raw measurements, and capture code.

## Comparison contract

- Headless Chromium with explicit SwiftShader, DPR 1, one capture at a time.
- Light and dark at 1440 by 900, 2056 by 1290, and 390 by 844 CSS pixels.
- Generated SVG and image bytes count toward the visitor payload. Exported
  triangle/pixel snapshots are generator inputs and are reported separately.
- Computed anchor equality, mask-to-vector boundary error, and alignment with
  the live scene are separate measurements.
- Canonical-camera transfer must include per-part anchor and depth correction.
  A whole-image scale alone does not test the proposed boot stage.
- Initial-size comparison frames the shelf itself, not the entire viewport.
- Every hand-authored exception and intentionally missing detail is recorded.

## What the prototypes have already established

Both approaches need more than a list of geometry and material colors. A added
UVs, texture pixels, material groups, depth testing, and perspective-correct
sampling to preserve photos and canvas details. B uses Three for those operations
and traces the resulting masks and color regions in Node.

Both needed a capture-runner correction before browser validation. Their initial
reduced-motion setting made the site choose its flat document, so the expected
3D-ready condition could never arrive. The runners now boot with normal motion
and freeze capture state separately.

The first mounted A image exposed a missing wood-color adapter and camera motion
between geometry export and the reference screenshot. These defects passed the
initial source tests and would have contaminated a visual comparison. Final
measurements must use the corrected captures.

One correction to the original review is also confirmed. Projects `DeskFrame`
passes `grade=0`, so those photos are not necessarily canvas-backed at default
settings. Treated images, actual canvas details, rounded covers, and crop
transforms still require a richer contract than a URL and four vertices.

## Measured comparison

Both approaches completed light and dark captures at all three viewports. The
compact raw measurements are in
[`boot-prototype-measurements.json`](boot-prototype-measurements.json).

| Case               | A, original details | B, original details | B, reduced palette |
| ------------------ | ------------------: | ------------------: | -----------------: |
| Light 1440 by 900  |              31,502 |              29,523 |             10,320 |
| Light 2056 by 1290 |              57,791 |              49,427 |             13,926 |
| Light 390 by 844   |              11,139 |              10,026 |              4,453 |
| Dark 1440 by 900   |              31,582 |              29,451 |             10,437 |
| Dark 2056 by 1290  |              57,820 |              52,601 |             17,549 |
| Dark 390 by 844    |              11,150 |              10,342 |              4,748 |

All values are bytes: gzipped SVG plus every referenced detail image, excluding
the preview UI. A uses PNG details and B's original-colour variant uses lossless
WebP. Their cameras also differ slightly. This is useful artifact sizing, not a
controlled compression benchmark. B's reduced palette visibly posterizes the
photo and screen; its smaller size is a quality choice available to either
pipeline.

A's roughly 868 KB gzipped triangle snapshot is a generator input, not visitor
payload. Its Node rendering took 33 to 235 ms after capture; its capture protocol
took 35 to 43 seconds including startup and readiness. B's private render passes
took 2.5 to 10.3 seconds and its Node package-and-audit stage took 3.0 to 9.9
seconds. The timing boundaries differ, so they do not rank the implementations.
None measures production visitor boot time, HTML/RSC transfer or JavaScript.

I inspected A's actual initial-size artwork against its frozen live reference.
The photograph and boards remain recognizable. The Mac preserves its screen and
small rainbow mark. The trophy is a flat gold silhouette; the wood uses a shared
palette adapter. The parts are recognizable, but this does not establish the
quality of a complete Projects loading illustration.

A's independent GPU owner-mask audit puts the canonical outer boundaries within
1 CSS pixel and the phone boundaries within 1.42 pixels. Wide desktop has shelf
outliers of 5 pixels in light and 4.47 pixels in dark. Those results compare
artwork generated for each viewport with a matching camera; they do not establish
that one canonical drawing can serve every viewport.

For A's canonical transfer test, with each
owner's anchor projected again and its scale corrected for depth, the mounted
Mac still has computed vertex drift up to 3.72 pixels on phone, and the trophy
3.62 pixels. The entire shelf treated as one part drifts 18.13 pixels. That last
number argues for projecting furniture separately or splitting its planes; it
does not prove that all responsive reuse is impossible.

These are frozen mounted camera samples. Neither world readiness nor a stable
asset inventory proves that CameraRig's damped aim has reached its neutral rest
pose. Under SwiftShader, a long wall-clock wait can contain relatively few
animation frames. The transfer numbers can therefore include residual motion;
they are not a clean measurement of viewport effects alone. The production
capture contract must establish the intended rest pose explicitly.

The origin audit cannot decide the requested 0.5 pixel gate: its native GPU
marker has a worst-case pixel-grid uncertainty of about 0.707 pixels. Computed
origin equality is a separate algebra check. Repeated Node runs and repeated
exports within one frozen page match; A has not proved repeatability across
independent browser loads.

B corrected a different set of defects before its final matrix. A one-shot
capture-enable event could race bridge initialization. Depth-only blockers drawn
after a coloured mesh failed to remove that mesh's pixels, making a support cover
the Mac and hiding the Arduino. An explicit bridge handshake and a depth prepass
fixed those failures. Separate specimen-only and full-scene visibility masks
prevent omitted props from punching holes in this partial drawing.

B also confirmed the camera issue. Its redundant instant jump reset the look
target, producing about 97 pixels of origin discrepancy. Skipping that jump when
already at Projects and waiting for measured look lag to converge reduced the
canonical analytic-to-live discrepancy to about 0.10 pixels. That is a computed
comparison, not the unmeasured optical origin gate. The analytic phone diagnostic
still omits the mounted camera's view offset; the actual capture retains it.

Across all six final B cases, isolated and assembled contours, including
projected detail alpha, measure within 1 CSS pixel of their corresponding
renderer reference masks. Its separate mounted-transform/camera mask checks also
stay within 1 pixel. These checks establish coverage at those captures; they do
not validate final lighting, About's style, or an integrated boot handoff.

Canonical B artwork transferred with per-part anchors and depth scale still
misses the 3 pixel gate: shelf maximum error is 5.39 pixels on light wide desktop,
7 pixels on dark wide desktop, and 10.77 pixels on phone. The trophy reaches 3.61
pixels on dark phone; other prop maxima remain at or below 3 pixels. Projecting
furniture faces directly remains the sensible next step. Neither prototype earns
a universal responsive-alignment pass.

B's six independent reload pairs have identical decoded image pixels under a
camera contract saved from the first capture. Five exact capture signatures
match; the sixth differs only by about 1.14e-13 pixels in one anchor coordinate.
The first comparator mistakenly included a descriptive profile label that
changes on reload. Its reported all-case failure was not an image failure.
Independently settled live cameras still vary slightly between loads, so fixed
camera repeatability does not prove a completely deterministic capture profile.
Same-input Node output matches in every case. Chromium also rendered all four
clipped detail images in every case; no raster-erasure failure was observed.

My engineering preference is B's division of work: keep sampling, depth and alpha
coverage in Three. A is also technically viable, and its extra sampler support
is the maintenance cost I would avoid. This preference does not select B as a
visual winner. The owner's response and the incomplete composition keep that
decision open.

## What I would change after seeing the result

The six-object scope was useful for texture and projection problems, but too
narrow for the most important design question. It leaves the upper shelf empty,
reduces the trophy to a plain silhouette, and removes most of Projects' identity.
Presenting that as the visual comparison put too much weight on a feasibility
specimen. I would not approve either drawing for production from these results.

The current About composition has varied silhouettes, a large focal photograph,
recognizable personal objects, and a populated upper and lower shelf. I captured
its current DOM for reference in
[`about-light-1440x900.png`](boot-prototype-evidence/about-light-1440x900.png) and
[`about-dark-1440x900.png`](boot-prototype-evidence/about-dark-1440x900.png).
Those are forced-visible, reduced-motion style references, not animation or
live-alignment tests.

My revised implementation proposal is:

1. **Establish the complete Projects composition first.** Include the actual
   shelf's defining objects, using mounted transforms. Show the drawing in the
   existing boot background, typography and reveal sequence at its real size.
   This is the next visual gate. Generating more partial shelves would not answer
   it.
2. **Choose a representation per object.** Use projected polygons for furniture
   and frame faces, traced silhouettes for simple organic forms, and cropped
   projected images for photographs, icons, screens and boards. Give the trophy
   a few controlled tonal regions so its form survives. About already mixes
   images, silhouettes and selective gradients in `BootScreen.tsx`. Automatic
   tracing should be one tool within that model. Preserve restrained contrast;
   reproducing all scene lighting would be another untested visual direction.
3. **Keep geometry authoritative in the scene.** Use stable part IDs and
   semantic capture metadata beside objects, with no copied pose list. Project
   furniture planes through the shared stage helper. Keep full-object coverage
   separate from assembled visibility so the reveal sequence cannot expose
   permanent holes where another object should appear later.
4. **Choose the rendering machinery after that visual gate.** Both approaches
   can preserve texture details with modest payloads. My engineering preference
   remains Three for masks and projected details, then Node for tracing and
   packaging. That avoids owning a second sampler and depth renderer. It is
   not a claim that B's current drawing looks better.
5. **Integrate one route before expanding.** Confirm About stays unchanged,
   production boot timing and route transfer stay acceptable, and desktop and
   phone handoffs work. Then add other units. Keep pure Books row layout,
   immutable hash-entry selection, freshness manifests and OG cards as distinct
   follow-on tasks, as described in the original review.

The original plan's 3 pixel gate should remain a geometry check. A complete,
readable composition needs its own acceptance decision before six-shelf rollout.
These prototypes demonstrate why those two checks cannot substitute for one
another.

This keeps the part's pose in the live scene while making its illustration
treatment explicit. It avoids both a second pose list and the assumption that
one automatic tracing rule can supply the art direction.

## Scope and remaining product work

The prototype comparison does not implement the production route selector,
hash-entry lifecycle, streaming Books data, artifact freshness pipeline, or
per-route OG cards. Results will inform that implementation proposal.

The coordinator added `src/app/admin/boot-comparison/` as a development-only,
read-only viewer of the two worktrees. It returns 404 outside development. Its
page and images were inspected in the live Superset pane; TypeScript and targeted
ESLint passed. Both workers' targeted checks also passed: A reported 116 tests,
B reported 41 Vitest tests and 3 Node tests. These overlapping checks should not
be added together as a unique coverage count.

The original plan still matches the copies supplied to both workers. No
production boot implementation, build, merge or deployment was performed.

No Field Note is added. The loading presentation has no qualifying visitor
action and fails achievement quality-bar test 2.
