# Homepage 3D scene v3 research — models, dynamism, polish

Date: 2026-08-09 · Branch context: `feat/stacks-home` (v2 complete through 2f43b50)
Method: three parallel research agents (models / sky / polish) against live pages,
installed `node_modules`, and computed geometry — not prior docs. Every claim
carries a source; unverified items are flagged. Working artifacts (downloaded
GLBs, themed atlases, audit scripts) live in the session scratchpad under
`opt3/`, `atlas_dark.png`, `atlas_light.png`, `audit.mjs`.

Follows: `2026-08-09-stacks-fidelity-mobile-atmosphere.md` (v2). Owner feedback
driving v3: bottom text unwanted · shapes still too basic (wants real models) ·
wants a cooler more dynamic shader · book hover jumps instead of animating ·
skyline not distinctly SF (no Salesforce Tower) and too plain in both themes ·
images look tacked on · things float on the shelves.

---

## Finding 0 — six corrections to what we thought was true

1. **The v2 op budget was wrong by ~4×.** The current sky shader runs ~250–300
   ops on a sky pixel, which is 0.5–8% of mobile GPU classes (A15 → Mali-G52).
   +150–250 ops of new detail is comfortably safe. Plainness was a design
   choice, never a perf constraint.
2. **Fog is completely inert.** Three.js fog is view-DEPTH based; this camera
   holds every unit at depth 5.8–8.0, all under `fogNear = 8`. Computed fog
   factor: 0.0% on all seven units at every pointer extreme. There is no
   atmospheric depth cue in the scene at all, and `fogNear` tuning cannot create
   one — it would need a distance-based term.
3. **The image "sticker" tell is quantified: ACES bypass.** With ACES + exposure
   1.12, no lit surface in the scene can print brighter than sRGB 230; the
   `toneMapped={false}` covers print 255, with lifted shadows (25 vs 10 in the
   deep end), no highlight rolloff, no desaturation, and zero response to light
   (drei `Image` is an unlit ShaderMaterial). Brightest + highest-contrast +
   most-saturated + light-immune = sticker. There is NO colour-space bug (r3f
   auto-sets `SRGBColorSpace` on `map` props — verified in fiber source).
4. **The dominant "floating" read is the unit, not the props.** The shelf's
   strap feet end at y −0.72; the ground pool plane sits at −1.115. That is a
   0.395-unit air gap (11.5% of frame height in the wide pose) between the
   bookcase and its own shadow. Props have real contact errors too (audit below)
   but the unit-level gap reads loudest.
5. **The Salesforce crown is dark at 3:45am.** "Day for Night" (Jim Campbell,
   11,000 LEDs, top six floors) runs dusk→2am; the tower is dark the rest of the
   night and still dark at first light ([Nob Hill Gazette][nhg], [KQED][kqed],
   [salesforcetower.com/artwork][sfart]). Truthful rendering = silhouette +
   FAA beacon, with a better payoff available (below).
6. **CreativeTrio is 134 CC0 models, not 9 — and they share ONE byte-identical
   128×128 palette atlas** (md5-verified across all 19 relevant props; 1 mesh /
   1 material each). Recoloring the entire prop set to our theme palettes is a
   single ~1.1 KB PNG rewrite per theme — built and measured, not theorized.

[nhg]: https://www.nobhillgazette.com/people/profile/salesforce-tower-s-light-show-one-year-in/article_f10ccea7-7bb0-5a2c-9680-91dc49426cbb.html
[kqed]: https://www.kqed.org/arts/13832983/what-are-those-weird-images-on-top-of-the-salesforce-tower
[sfart]: https://salesforcetower.com/artwork/

---

## Track A — curated GLB props (models agent)

### Source of truth

[Poly Pizza / CreativeTrio](https://poly.pizza/u/CreativeTrio): 134 models, every
one CC0 1.0 (per-model metadata; ⚠️ the site has no working site-wide terms page
— all license claims rest on per-model records, consistent 134/134). Direct
download `https://static.poly.pizza/{ResourceID}.glb` verified HTTP 200, valid
glTF 2.0. All ~19 relevant props: 84–786 tris, 15–62 KB raw, flat-shaded,
identical material constants.

Gap fills (CC0, verified): **Quaternius Open Book**
([poly.pizza/m/JEDMpG0UIR](https://poly.pizza/m/JEDMpG0UIR), 464 tris, real
page-curl geometry, untextured multi-material → themes via `material.color`),
Quaternius closed book, scaranto ink pen, Quaternius water bottle.

Confirmed gaps (keep procedural): **weight plates/barbells/kettlebells — every
result is CC-BY**; desk/handheld microphones — none usable (iPoly3D mic is a
1.63-unit floor stand); notebooks/journals/supplement bottles — zero CC0.
Kenney laptop/keyboard rejected (blocky, cool teal-grey — the exact look to
avoid).

### The three integration facts that matter

1. **Material override is mandatory:** every CreativeTrio prop ships
   `metalness 0.4 / roughness 0.272`. Under our new environment map a wooden
   lamp at 40% metalness reads as tinted chrome. Override to
   `metalness 0, roughness 0.6–0.8` on load (two-line traverse) or the models
   will look worse than the boxes they replace.
2. **Theme recoloring = atlas swap, built and measured:** nearest-match remap of
   the shared atlas to `theme.ts` palettes produced `atlas_dark.png` (1,133 B)
   and `atlas_light.png` (1,067 B). Bleed safety measured: median 8 texels to
   the nearest differently-coloured texel, only 0.4% within 2 — normal
   mipmapping is safe. Theme switch = one texture assignment, no recompile.
   Do NOT use `material.color` on atlas props (tints clock faces and pages
   too); use it only on untextured Quaternius/scaranto props. ⚠️ Recolor
   quality must be judged in-scene.
3. **Pipeline gotchas (both would have shipped silently):**
   `--texture-compress webp` writes `EXT_texture_webp` into
   `extensionsRequired` → hard load failure on non-WebP clients, bought for a
   1.4 KB texture — skip WebP, strip the duplicate atlases instead. And
   `gltf-transform optimize` prunes `TEXCOORD_0` once no texture references it
   → models permanently unthemeable. Command:
   `gltf-transform optimize in.glb out.glb --compress meshopt --prune-attributes false`.

Loader mechanics (verified in installed drei 10.7.8 / three-stdlib 2.36.1):
meshopt decoder is bundled locally (24 KB inline WASM, no network); drei's
Draco CDN default is only contacted if a Draco file is actually decoded — pass
`useGLTF(url, false)` anyway. End-to-end test: **all 19 optimized props load
through the exact drei loader stack, 19/19 OK, 7,815 tris total.** A 10-prop
shortlist measures **116.4 KB including both themed atlases** (half the v2
estimate). Files → `/public/models/`; gate the Suspense boundary on the
existing `useUnitLod` and `useGLTF.preload()` neighbours.

⚠️ Repo-fact correction discovered en route: the repo runs **Next 16.1.6 /
React 19.2.4** (CLAUDE.md's "Next.js 14" is stale).

### Recommended swap list

**Stay procedural (non-negotiable):** book rows/covers (the 319-book library IS
the feature), talk frames (real stills), portrait, the 3:45 clock FACE, quote
cards, ShelfUnit structure, weight plates (no CC0 exists; cylinders are the
correct shape anyway).

- **Tier 1:** Desk Lamp (anglepoise silhouette — biggest single win; keep our
  bulb/glow/pointLight), Mug With Office Tool (doubles as Musings pen cup),
  Potted Plant (the only organic silhouette in a rectilinear world).
- **Tier 2:** Quaternius Open Book (best model found), Alarm Clock body (keep
  canvas 3:45 face — alignment is the risk), Headphones, Dumbbell (modest).
- **Tier 3 — identity claims, owner must rule:** Trophy, Globe, Telescope,
  Corkboard. Each asserts a fact about him (award won, travel, astronomy).
  Under his no-fabrication rule these earn a place only if literally true.

---

## Track B — dynamic, distinctly-SF sky (sky agent)

### The cheapest "reads as SF" change is compositional, not a landmark

SF's skyline signature is a flat low residential carpet with ONE tight tall
cluster punching out — the current uniform hashed roofline is the generic-city
shape. A bimodal roofline (carpet + downtown mask) costs +8 ops and is what
makes the towers read as tall.

### Landmark set (heights verified; recipes with GLSL in agent transcript)

True ordering preserved: Sutro-on-its-hill (1,811 ft ASL) > Salesforce (1,070)
> Transamerica (853+spire) > roofline > Coit (210 on Telegraph Hill) > carpet.

**Compass-true recomposition (recommended):** the camera pans azimuth
[−2.3, −0.9] and the ember sits at −1.15 — east, which is genuinely where
downtown and the Bay Bridge are. Left→right: Twin Peaks hills −2.28 → **Sutro
−2.20 (moved from −1.65)** → Coit −1.90 → **Transamerica −1.62 (replaces the
current spike)** → downtown cluster −1.35 → **Salesforce −1.28** → ember −1.15
→ **Bay Bridge −1.02**. The traverse becomes geographically true and ends on
the dawn. Caveat: three of the biggest beats land in the final third.

Per-landmark notes: Salesforce +33 ops — obelisk taper with the top ~14%
DISSOLVING (Pelli's stated intent, cheaper than a rounded cap) + FAA L-864 red
beacon at the regulation 30 flashes/min ([FAA AC 70/7460-1M][faa]) + **the
crown catches the first ember before anything else in the city** (tallest,
east-facing glass — physically true; Salesforce Tower announces the dawn).
Transamerica +18 net — the two vertical wings are what turn "a triangle" into
THE pyramid; steady red apex light (the Crown Jewel beacon is holiday-only —
off Aug 9). Coit +16 — the isolated hill sells it (⚠️ nightly floodlighting
unverified — default to silhouette). Hills +12. **Bay Bridge + Bay Lights +55
— the strongest dynamic item:** "Bay Lights 360" relit 2026-03-20, 48,000 LEDs
on the western span, running nightly **dusk until dawn** ([Illuminate][ill]) —
at 3:45am it is the ONE landmark genuinely alive. Parabola not catenary (3 ops,
and more correct); nested-sin phase warp so the sequencing reads algorithmic,
never marquee; fades out as uDawn rises in light mode (dusk-until-dawn is
literal), giving light mode its own dynamic beat.

**Advise against:** Golden Gate (pick one bridge; tourism register), Painted
Ladies (2–3 px, cannot read), moon (a wrong moon is worse than none; competes
with the ember; cliché), birds (smudge), meteor (wish-fulfillment cliché — the
satellite is the sophisticated version).

[faa]: https://www.faa.gov/documentLibrary/media/Advisory_Circular/Advisory_Circular_70_7460_1M.pdf
[ill]: https://illuminate.org/2026/02/19/the-bay-lights-to-return-friday-march-20-2026/

### Dynamism menu (ranked by impact ÷ (cost + taste-risk))

1. **Animated film grain** (~10 ops) — see grain strategy below.
2. **Aircraft warning beacons** (~10 ops each) — Salesforce + Transamerica +
   bridge towers, regulation cadence, OUT of phase. The most legible "living
   city at night" signal available.
3. **Bay Lights sequencing** (+55 incl. bridge) — truthful, dated, local.
4. **Window shuffle driven by uDawn, not uTime** (+14) — scrolling back and
   forth changes which windows are lit; a uTime version would never be seen in
   a sub-minute visit.
5. **Mist band** (+34) — three incommensurate sines in azimuth (1-D; 2-D noise
   buys nothing at 2× the price). Dark mode: borderline-respects (a thin cold
   inversion veiling building bases). **Light mode = Karl the Fog = explicit
   BEND** of the locked "no marine layer" — also the most distinctly-SF
   atmospheric fact available. 0.02 rad/s drift is cinema; anything visible as
   weather is weather-app.
6. **Satellite crossing** (dark only; +35 active / +3 idle) — 92 s period,
   ~5.5 s crossing, constant-velocity, tailless, dim; Starlink-era truthful;
   frame-uniform gate (zero divergence); seed the first pass ~8 s after mount
   so a typical visitor sees exactly one.
7. Sky "breathing" — SKIP standalone (below JND or reads as an OLED bug);
   at most ±4% on the ember amplitude.

### Grain strategy

The existing DOM grain is **invisible by construction**, three compounding
causes ([SVG 1.1 §15.24][svg], [W3C compositing][comp]): feTurbulence noise has
a random ~0.5 alpha channel; ×0.10 CSS opacity → effective ~0.05; and
`mix-blend-overlay` annihilates grain in darks (overlay → 2·Cb·Cs as Cb→0 —
computed Δ ≈ ±0.19/255 in dark theme). Fix, effectively free: force the noise
opaque+mono via feColorMatrix, drop to 1 octave, blend `normal` at ~0.05–0.07,
animate via compositor `transform` jitter (~8 offsets, ~12 Hz, oversized 110%)
— never animate `seed` or `background-position` (CPU repaint). Gate on
`prefers-reduced-motion`. Companion: animate the in-shader IGN (Jimenez
temporal scroll folds into one fused multiply-add) + luminance-shaped amplitude
(grain lives in midtones) so banding stays dead — DOM grain can't do that job.
A fullscreen in-canvas grain quad is dominated (extra full-screen transparent
pass on tile GPUs; doesn't cover DOM type — visible mismatch).

[svg]: https://www.w3.org/TR/SVG11/filters.html#feTurbulenceElement
[comp]: https://www.w3.org/TR/compositing-1/

### Perf + two shader bugs found

Branching guidance (Qualcomm/Arm docs): promote `uSimplify` to a compile-time
`#define` via `material.defines` (device-class is decided once at mount; the
simple variant then omits the code entirely); gate new elements on
elevation/azimuth windows (screen-coherent); frame-uniform gates (uTime-only)
are free. `mediump` for the colour path, `highp` for anything floor'd/hashed
(the window grid MUST stay highp or cells crawl). Degrade ladder keeps: bands,
ember, bimodal roofline, hills, Salesforce+Transamerica silhouettes (~50 ops =
the actual ask); drops first: Bay Lights sequencing, mist, window shuffle,
satellite, Coit.

**Bug 1:** `pow(x, 2.0)` with negative base is UNDEFINED in GLSL ES — four live
sites in the ember math (works today only because compilers fold to x·x).
**Bug 2:** sine-based hashes (`fract(sin·43758)`) band/degenerate on some
mobile drivers — replace with Hoskins hash-without-sine
([Shadertoy 4djSRW](https://www.shadertoy.com/view/4djSRW)). Together ≈ −60
ops and removes two portability landmines; roughly pays for hills + bimodal
roofline + Coit.

---

## Track C — integration polish (polish agent)

### Hover lift (the "jump")

Cause: bare ternaries in `position` (covers `0.06→0.16` z, frames, notebooks).
**Recommendation: a `<Lift>` wrapper group damped with `THREE.MathUtils.damp`**
(already the codebase damping primitive; λ=10 → 95% in 300 ms). Zero new
dependencies: maath is installed but only as drei's transitive dep (importing
it = undeclared dependency); @react-spring/three not installed (~35 KB for a
10 cm slide); **framer-motion-3d is dead** (no 3d export in fm12; peer-deps
fiber@8). The wrapper reads `hovered` imperatively inside `useFrame`
(getState) — hovering then re-renders NOTHING (today each hover re-renders the
whole row and its ~14 Suspense subtrees); items snap+idle when settled. Ceiling
is 23 animated groups (14 covers, 6 frames, 3 notebooks).

Two grill-relevant details: the current lift moves +z (toward camera) only —
"animate up" may also mean +y, which risks the cursor falling off the cover's
bottom edge mid-animation (only while the mouse is moving; there's headroom
above every row). And a latent race — `onPointerOut` unconditionally nulls
`hovered`, so out-of-order over/out events would visibly stutter once damped;
guard with `if (hovered === key)` at 3 sites.

Also found: nothing in the scene casts shadows (the 29 `castShadow` props are
dead code since P3), and a stale AccumulativeShadows comment.

### Images ("tacked on")

Ranked treatments (full verification chain in agent transcript):

1. **Drop `toneMapped={false}`** — three one-word deletions (deleting the prop
   is verified-safe: drei passes undefined → r3f skips undefined → three
   default `true`). Covers/frames/portrait go through ACES like everything
   else and stop being the brightest pixels on screen. Highest payoff : risk
   ratio in the entire v3 register.
2. **Lit covers** — replace drei Image with `meshStandardMaterial map` planes
   (useTexture = same loader/Suspense path; CoverBoundary unchanged). Covers
   then warm near the lamp and fall off away from it — the strongest "in the
   room" cue available. Requires an object-fit:cover emulation via
   `tex.repeat/offset` (sketch in transcript), anisotropy (nothing sets it
   today), and awareness that useLoader caches textures by URL (safe today).
3. **Rounded corners** — drei Image `radius` EXISTS in 10.7.8, world units
   (0.012 ≈ our RoundedBox 0.008) — but does nothing without `transparent`
   (alpha is discarded when blending is off), which moves covers into the
   sorted transparent queue. Suits worn paperbacks; NOT talk-frame photos.
4. Inset margins — **already exist** (measured: 1 cm covers, 4 cm frames,
   double-mat portrait); cross off. Micro-fix: the cover image sits 3 mm PROUD
   of its own board — push z to −0.002.
5. Curvature / roughness maps — only meaningful after (2); photographs behind
   glass should stay flat.

### Floating (exact audit, computed transforms)

Root cause: two conflicting conventions — half the props bake the +0.035 shelf
offset into themselves, half expect the caller to supply it; and the lower-shelf
group origin sits 0.0275 BELOW its own surface vs 0.035 for the top. Worst
offenders: OpenNotebook floats +3.75 cm, CardStack/Mug/BookPile(top) +3.5,
Plates +3.4, NotebookLean +2.9, Binder +2.0; Dumbbell SUNK −3.25 cm,
PaperStack −1.55, FrameRow −1.46; QuoteCards disagree internally (outer cards
sunk, middle floating — its tilt term has the wrong sign). Already perfect:
book rows on top shelves, AlarmClock, PortraitFrame. **Structural fix:** name
the surfaces once (`SHELF = {top, lower}`), make both shelf groups place local
y=0 AT the wood, correct each prop's internal offset (full number list in
transcript).

But geometry isn't why it LOOKS floaty: **no contact shadows exist anywhere**,
and the RoundedBox bevel puts a bright lit rim exactly at every joint, which
reads as a gap. Highest-payoff fix: `ContactPool` — small shared-texture
radial pools (the GroundPool pattern) under each prop, one long pool per book
row (~14 draw calls total, one texture). Then optionally sink flat-bottomed
boxes by ~radius/2 (never cylinders).

**Unit-level float — the real complaint (Finding 0.4):** options —
(a) **extend the straps to the ground** (two numbers: legs become full-height,
feet land exactly on the pool plane; add a small plinth; tighten the pool's z
toward the plank footprint — the pool currently overhangs 0.33 in FRONT, which
is what makes it read as a puddle) · (b) raise the pool to just under the
plank (wall-mounted-shelf read) · (c) commit to the float as design language
and replace the pool with a tight under-plank contact shadow.

### Bottom text (decision material, no recommendation)

Desktop-only (both `hidden md:` — mobile bottom is the peek chip, which is
navigation and not part of this). Two independent one-line removals in
ChromeLayer: the **caption** (`about` / `the library — 319 books, 57 a year` /
… — note 4 of 7 are em-dash constructions, which is on his no-AI-slop list)
and the **NowStrip** (now-reading + last-lift + AI Collective + live SF
clock). Nothing functional is lost (pointer-events-none, no links). Unique
information that dies: the live SF clock (nowhere else on the site) and the
last-lift figure (elsewhere only as a heatmap tooltip); `built since age 12`
and `up at 3:45am` flavour. Book/workout counts and now-reading are duplicated
in the placards. Dead code on full removal: `unitCaption`, `NowStrip.tsx`,
`formatVolume`/`formatShortDate`, the `lastLift`/`totalWorkouts` fields.

---

## Decision register for the grilling

1. **Bottom text:** kill caption, kill NowStrip, or both? (SF clock and
   last-lift are the only unique losses; captions carry the em-dash smell.)
2. **Skyline recomposition:** compass-true re-layout (Sutro moves to the start,
   Transamerica replaces the spike, Salesforce+Bay Bridge join the ember at
   the end) vs keep-composition-and-add.
3. **The three BENDS:** dark-mode mist band (borderline) · light-mode Karl
   marine layer (explicit bend, most-SF option) · lit Salesforce crown
   (explicit bend, advised against — truthful dark crown + beacon + it
   catching the first ember is stronger).
4. **Satellite crossing:** in or out.
5. **Models:** approve Tier 1 (lamp, mug, plant) + Tier 2 (open book, clock
   body, headphones, dumbbell)? How far to push the recolor from stock? And
   the Tier-3 identity props — trophy / globe / telescope / corkboard — which
   are literally true of him?
6. **Hover axis:** damped +z only (zero risk) or +y+z ("up" literally)?
7. **Unit float:** legs-to-ground vs raised pool vs committed float.
8. **Cover treatment depth:** stop at tone mapping, or go to lit covers
   (+rounded corners on books only)?
9. **Grain:** DOM fix + animated IGN as spec'd (likely uncontroversial).
