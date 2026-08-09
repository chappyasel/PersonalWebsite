# The Stacks v2 research — fidelity, mobile, atmosphere

Date: 2026-08-09 · Branch context: `feat/stacks-home` (commit a72952b)
Method: three parallel research agents against primary sources (docs, license
pages, package registries, shader references), plus live Playwright probes of
reference sites under iPhone emulation. Every claim below carries a source;
where something could not be verified it is flagged rather than assumed.

Follows: `2026-08-08-home-redesign-inspo-survey.md` (the design process that
produced v1).

---

## Finding 0 — two defects are hiding what the current design actually looks like

Fix both before making any aesthetic judgment; they change every subsequent
decision.

**1. The sky has never rendered its authored colors.** The sky dome
`ShaderMaterial` (`scene/SceneEnvironment.tsx`) writes `gl_FragColor` without
`#include <tonemapping_fragment>` / `#include <colorspace_fragment>`, so it
skips the ACES tone mapping + sRGB encode every other material receives
([three.js color management](https://threejs.org/manual/en/color-management.html);
drei's own `Stars` material ends with exactly those includes —
[source](https://github.com/pmndrs/drei/blob/master/src/core/Stars.tsx)).
Computed consequence: dark-theme horizon `#6b4426` displays as `#250f05`
(near-black), collapsing the dark sky into a `#020101→#250f05` smear, with a
visible value seam where fogged geometry (`#422611`) meets dome; the light sky
is the only surface skipping ACES desaturation, hence the oversaturated
"generic peach." Fix is two shader includes; sky/fog hexes in `theme.ts` must
be re-tuned afterward because they will finally mean what they say.

**2. There is no environment map.** 37 `meshStandardMaterial`s are lit by one
hemisphere light + one directional only. Standard materials without IBL have
nothing to reflect and read as flat plastic regardless of geometry quality.
Curated GLB props dropped into this lighting would look as flat as the boxes
do. Fix before buying any fidelity elsewhere.

---

## Track A — prop fidelity (assets agent)

### Ordered plan (hybrid beats wholesale replacement)

1. **Environment map + Lightformers.** Self-host the HDRI —
   [drei docs](https://drei.docs.pmnd.rs/staging/environment) warn `preset`
   "is not meant to be used in production" (CDN dependency). Use
   [`@pmndrs/assets`](https://github.com/pmndrs/assets) (Poly Haven EXRs at
   512², ~100–200 KB, base64 JS modules that lazy-import cleanly), plus
   `<Lightformer>` to place warm dusk light deliberately. Upgrades all 37
   materials at once.
2. **`RoundedBox` for the 19 `boxGeometry` props**
   ([drei](https://drei.docs.pmnd.rs/shapes/rounded-box)). Edge highlights are
   the cheapest "crafted vs primitive" signal; perfect 90° corners are the
   strongest primitive tell.
3. **`AccumulativeShadows` + `RandomizedLight`**
   ([drei](https://drei.docs.pmnd.rs/staging/accumulative-shadows)) — bakes
   soft AO-like ground contact with zero per-frame cost after accumulation
   (scene is static; only the camera moves). Likely retires the per-frame
   2048² directional shadow map.
4. **Then swap ~7–10 GLBs where silhouette carries meaning**: lamp, mug, alarm
   clock, dumbbell, open book, plant, pen cup. **Keep procedural**: shelf
   planks, book spines/covers (data-driven — real covers are the feature),
   picture frames, weight plates, quote cards.

### Source-of-truth findings

- **pmndrs Market (market.pmnd.rs) is dead** — all paths return Vercel
  `DEPLOYMENT_NOT_FOUND`. Its surviving half is the `@pmndrs/assets` npm
  package.
- **[Poly Pizza](https://poly.pizza/) is the best source**: per-model CC0
  available, served as ready GLB. **Nine coherent CC0 props by one author,
  [CreativeTrio](https://poly.pizza/u/CreativeTrio)** (lamp, books, shelf, mug,
  clock, dumbbell, plant, painting, pen cup) — single-hand style coherence,
  each 1 material + 1 palette atlas. Verified sample: Desk Lamp = CC0, 450
  tris, 41 KB GLB (HTTP 200).
- **Sketchfab**: free downloads are CC-BY at best (attribution forever); its
  "Standard" license forbids serving the file as a downloadable stand-alone —
  which a `/public/*.glb` is. Avoid unless maintaining a credits page.
- **Quaternius**: genuinely CC0, but furniture/interior packs ship
  FBX/OBJ/Blend only — consume his models via Poly Pizza GLBs instead.
- **Kenney**: CC0, GLB, but blocky game-jam style — the exact look to avoid.
- **No honest CC0 exists** for weight plates (keep procedural — correct shape
  anyway) or notebooks (use a closed Quaternius book).

### Pipeline (current versions verified on npm)

`gltfjsx` 6.5.3 · `@gltf-transform/cli` 4.4.2 · drei 10.7.8 · fiber 9.7.0.

```bash
gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 512
```

**Skip Draco**: drei's default decoder fetch is ~336 KB — larger than the
entire prop set. Meshopt's decoder is small and `useGLTF` enables it by
default. Skip KTX2 at this scale (needs custom `extendLoader`;
[drei #2639](https://github.com/pmndrs/drei/issues/2639)).

**Budget**: ~380 KB raw for 11 props → est. 200–250 KB optimized (estimate,
not measured) + 130–270 KB lazy HDRI ⇒ **~350–500 KB total, all lazy**.

**Skip**: `Outlines` (doubles draw calls, reads toon),
`MeshTransmissionMaterial` (extra full scene pass), N8AO postprocessing on
mobile (no postprocessing installed today; most expensive item evaluated —
desktop-only polish at best, behind `PerformanceMonitor`).

---

## Track B — mobile interaction (mobile agent)

### Field survey (live-probed under iPhone emulation, not quoted from writeups)

| Site | Mobile behavior |
|---|---|
| [Igloo Inc](https://igloo.inc) | Full-bleed canvas, corner text chips only, no sheet |
| [Resn](https://resn.co.nz) | Full canvas, hijacked scroll, hint line "TOUCH & HOLD", content behind menu |
| [Lusion](https://lusion.co) | 3D composited into a bounded rounded stage mid-screen; DOM type outside it; "SCROLL TO EXPLORE" bar |
| [Unseen](https://unseen.co) | Full canvas, numbered menu behind toggle |
| [Bruno Simon](https://bruno-simon.com) | Full canvas; added explicit touch controls after failing to find an invisible alternative ([case study](https://medium.com/@bruno_simon/bruno-simon-portfolio-case-study-960402cc259b)) |

**Nobody at this tier uses a resident partial bottom sheet** (our current 40dvh
sheet). Notes: 14islands no longer runs 3D at all (not citable); Active Theory
capability-gated headless Chromium (excluded rather than guessed).

Usability literature is pointed about our current pattern:
[NN/g on bottom sheets](https://www.nngroup.com/articles/bottom-sheet/) (never
for lengthy content; don't replace page flows),
[NN/g on overlay dismissal](https://www.nngroup.com/articles/accidental-overlay-dismissal/)
(partial scrollable overlays force work + lose position; always pair gesture
dismissal with a visible X).

### Recommended model: "peek chip → full-screen panel" (Model B + a small C)

- **Default**: clean world; ~44 px chip pinned bottom-center showing the active
  unit's name + chevron (identity line, not content preview). Restores ~92% of
  the viewport to the world (vs ~60% today).
- **Open**: tap chip **or** unit → chip morphs into a full-screen content panel
  (framer-motion `layoutId` — the exact pattern already shipped in
  `books/BookCard→Modal`, `weightlifting/YearCalendar→WorkoutDetailModal`);
  camera eases a short dolly toward the unit + scene dims (lerp inside the
  existing `useFrame`; no `CameraControls`/`Bounds` — a second camera owner is
  the failure mode).
- **Close**: visible X, swipe-down armed only at `scrollTop === 0`, browser
  back. Both dismissal paths per NN/g.
- **Gesture grammar**: 4-state machine (`closed/opening/open/closing`); drei
  `ScrollControls` **`enabled={false}`** while not `closed`
  ([docs](http://drei.docs.pmnd.rs/controls/scroll-controls)); travel stays
  vertical-swipe.
- **Precedent** for tap-object→camera+content:
  [Sketchfab annotations](https://support.fab.com/s/article/Annotations?language=en_US);
  transition-state gating per
  [Codrops infinite gallery](https://tympanus.net/codrops/2026/07/30/building-an-infinite-gsap-scroll-gallery-with-parallax-and-flip-transitions/).
- **Discoverability**: the permanently visible chip is the affordance; field
  precedent is a single hint line, never tutorials.

**Critical r3f gotcha (verified in fiber's `events.ts`)**: pointer `delta`
gates only `onPointerMissed` — **`onClick` still fires after a swipe that
starts and ends on a mesh**. Every unit/cover/frame handler needs
`if (e.delta > 6) return;` or panels will open mid-scroll.

**Libraries**: vaul is unmaintained (per its README); react-modal-sheet is the
maintained alternative but pulls `motion`; **hand-roll with framer-motion** —
already a dependency with in-repo patterns.

Desktop keeps the right-docked placard (it isn't the problem); the chip model
can later unify both if it proves out.

### Rejected alternatives

- **A — bare world + hint line only**: tap-a-3D-object as the *only* path into
  content is unproven for a primary nav; hint missed ⇒ content undiscovered.
- **C-full — camera-flight-first**: two camera systems fighting; interruption
  handling doubles the state machine. Borrow only the small dolly.
- **D — Lusion framed stage**: strong precedent but abandons the immersive
  premise on mobile; it's a redesign, kept as fallback if B underperforms.

---

## Track C — atmosphere (shader agent)

### The concept: paint 3:45am truthfully

Verified: SF astronomical twilight begins ~4:34–4:36am in August; sunrise
~6:17 ([timeanddate](https://www.timeanddate.com/sun/usa/san-francisco)). At
3:45 the sky is **fully dark** — he is up before the sky is. So: not a sunrise
gradient (that's the generic-warm look being escaped), but a cold deep-indigo
night with a mostly-asleep city, the first ember appearing only at the end of
the traverse. This finally introduces a cool hue — currently sky, fog, and
wood all live in one brown-orange family, so there is no "outside" for the
lamplit room to be warm against. The cool slate already rhymes with existing
spine accents (`#3f4a5c`, `#6e7f95`).

### Elements (one ShaderMaterial, no new deps/assets/draw calls)

| Element | Technique | Cost |
|---|---|---|
| Color-pipeline fix | 2 shader includes + re-tune hexes | ~0 (prerequisite) |
| Banding fix | Interleaved Gradient Noise dither, applied **after** sRGB encode ([reference](https://blog.frost.kiwi/GLSL-noise-and-radial-gradient/)) | ~4 ALU ops |
| Three-band twilight | Non-monotonic profile — Earth's-shadow band, ember band, indigo zenith ([Belt of Venus](https://en.wikipedia.org/wiki/Belt_of_Venus)) — the inversion is what reads "sky" not "gradient" | ~10 ops |
| City skyline + lit windows | **Analytic, in-shader** (hash column heights, `step()` elevation; sub-grid hash for sparse warm windows; add own haze term since dome has `fog:false`) — crisper + cheaper than geometry or texture ([ref shader](https://www.shadertoy.com/view/MdXGW2)) | ~15 ops |
| Stars | Hashed cells in-shader or custom points with per-star phase + horizon extinction. **Not drei `<Stars>`** — its 5,000 sprites twinkle in unison and are pure additive overdraw (verified in source) | low |
| Dawn advances with traverse | `useScroll().offset` → one uniform driving ember intensity/height; write in `useFrame`, never React state | 1 uniform |
| Theme crossfade | Single material, `uDark` 0..1 uniform + `mix()` in-shader; `THREE.MathUtils.damp` for the transition (no recompile, real crossfade) | ~0 |

**Perf**: total ~60–80 ALU ops ≈ 3–4 GOPS at 390×844 @1.25 dpr — comfortable.
Structural win first: give the sky an explicit `renderOrder` so it draws after
opaque geometry (early-Z rejects covered fragments; currently its sort position
*changes during traverse*). Don't half-res the sky (would soften the crisp
skyline — the detail worth protecting); make sky detail a degrade-ladder rung
instead.

**Ruled out with cause**: drei `<Sky>` (Preetham daylight model, degenerates
below horizon — verified in source), drei `<Cloud>` (third-party CDN texture,
per-frame CPU depth sort, transparent overdraw), lamina (GitHub-archived; ships
leva as a runtime dep), TSL/WebGPU (drops `ShaderMaterial` support —
[manual](https://threejs.org/manual/en/webgpurenderer.html)), postprocessing
god rays (new dependency + full-screen pass; flashiest item in the register
being avoided). Domain-warped fbm too heavy for full-screen mobile; 1–2 cheap
noise octaves max if mist is wanted.

---

## Recommended build order (v2)

1. **Foundations (S)** — sky color-pipeline fix + IGN dither + sky
   `renderOrder`; environment map + Lightformers; re-tune `theme.ts` sky/fog
   hexes against the corrected pipeline. *Re-judge the look here.*
2. **Night sky (M)** — three-band twilight + analytic skyline/windows + stars
   + scroll-driven dawn + theme-crossfade uniform.
3. **Material craft (S/M)** — RoundedBox conversion; AccumulativeShadows;
   retire per-frame shadow map if the bake holds.
4. **Prop swaps (M)** — CreativeTrio CC0 set via gltf-transform (meshopt+webp
   512), lazy-loaded, LOD-gated like covers. Keep data-driven props
   procedural.
5. **Mobile model B (M/L)** — peek chip + layoutId full-screen panel + travel
   freeze + `e.delta` click guards + small camera dolly/dim.

Each phase independently shippable and screenshot-gated like v1; phase 1 is a
prerequisite for judging everything after it.
