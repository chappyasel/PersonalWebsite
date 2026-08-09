# The Stacks v4 — element-by-element audit

Date: 2026-08-09 · Branch context: `feat/stacks-home` through `868996a` (v3 complete)
Purpose: your review doc. Every item is an option menu, not a plan — mark up /
delete / add, and the next round gets planned from the edited doc.
Tags: **[fix]** = bug, do regardless · **[cheap]** / **[med]** / **[big]** = effort ·
**★** = my recommendation · **⚑** = needs your call.

Driving feedback: bottom shelf floats · per-section shelf identity · more photos
of you · toggle to top-right · photos vanish on fast scroll · Systems shelf
reads broken/too simple · organic shader / pmndrs postprocessing · overall
model quality + taste pass, element by element.

---

## 0. Diagnosed bugs

### 0.1 The bottom shelf floats — on every unit **[fix]**
Root cause is geometric, not shadow: the lower plank is `width·0.72 = 2.30`
wide but the straps sit at `±1.35` — the plank ends 0.2 units shy of ever
touching them. Its depth (0.6, centered z −0.08) only grazes the strap plane
(z −0.32) with zero x-overlap. It is attached to nothing; v3 fixed the feet
and left the plank hanging between them.

- **(a) ★ Full-width lower plank** — same width as the top plank, resting
  against both straps, plus two small cleat blocks under its ends where it
  meets the straps (the visible "how it's held up"). **[cheap]**
- (b) Vertical hangers — two thin rods from the top plank down to the lower
  plank (ladder-shelf read). Keeps the lower plank short. **[cheap]**
- (c) Side panels — closed gables per unit; turns the unit into a proper
  bookcase (see §1.3, pairs with the Books identity). **[med]**

### 0.2 Photos disappear on fast scroll **[fix]**
`useUnitLod` unmounts all textured content once a unit is more than 1 away
from active; scrolling fast outruns it, so covers/frames/portrait unmount →
Suspense `null` → visible hole until refetch+decode lands. Was a texture-
memory guard; the real budget is tiny (≈21 images ≈ 20 MB decoded — fine).
- **(a) ★ Sticky LOD** — once a unit has been textured, never untexture it
  (`useRef` latch per unit). First traverse still lazy, no more holes.
  **[cheap]**
- (b) Kill LOD for scene images entirely + prefetch all 21 after
  world-ready (models already do this). Simplest, slightly slower first
  paint on cold cache. **[cheap]**
- (c) Keep meshes mounted, swap `map` when ready (no Suspense unmount at
  all — blank board → photo crossfade). Nicest, most code. **[med]**

### 0.3 Theme toggle → fixed top-right **[fix]**
It currently lives inside the About placard body (only discoverable at
unit 0). Move to ChromeLayer as a fixed top-right pointer-events island,
mirroring the "Chappy Asel" top-left; drop it from the placard. Also fixes
mobile (panel-only today). **[cheap]**

### 0.4 The Systems shelf, specifically (your screenshot) **[fix]**
- **Binder reads as a mini-dresser** — it's rotated so the ring side faces
  the camera; the three torus rings read as drawer pulls and the spine
  label is hidden. Options: §2.7.
- **Quote cards read as a collapsed paper tent** — three 0.3×0.36 fanned
  planes with no content at clock height. Options: §2.7.
- **Plant leaves are visibly flat n-gons** — the CT plant is the weakest
  model in the set at close range. Options: §2.7.

---

## 1. Global systems — the big levers

### 1.1 Postprocessing (your pmndrs link) — the "organic" lever ⚑
v2 ruled this out on a budget that v3 research proved ~4× too conservative
(desktop runs 110 fps at dpr 1 with the whole v3 sky). The honest framing
now: a desktop-first composer, integrated into the existing degrade ladder
(rung 1 turns the whole composer off; mobile default off until measured on
a real device). `@react-three/postprocessing` merges effects into minimal
fullscreen passes.

| Effect | What it buys | Cost | Verdict |
|---|---|---|---|
| **N8AO** (`n8ao`) | Screen-space AO — real contact darkening in every crevice, shelf-to-prop, book-to-book. The single biggest "organic" win available. | High (half-res mode exists) | ★ desktop rung |
| **TiltShift2** | Miniature-diorama focus band — makes the shelf world read as a hand-built miniature. A taste fork: it would define the whole site's look. | Low | ⚑ prototype it, judge on screen |
| **Bloom** (selective, threshold ≥1) | Lamp bulb, ember, beacons, Bay Lights actually glow; retires the GlowSprite hack. | Med (half-res) | ★ |
| **SMAA** | Crisp low-poly edges at dpr 1 — cheap fidelity everywhere, big on the GLB props. | Low | ★ |
| **Vignette** | Replaces the DOM vignette so it sits under grain and grades with the scene. | ~free in-chain | ★ |
| **Noise** | In-canvas grain. DOM grain already covers placards + canvas together; moving it in-canvas splits them. | ~free | skip, keep DOM |
| **DepthOfField** | Real bokeh. TiltShift2 is the cheaper cousin with the same read here. | High | skip |
| **ChromaticAberration / GodRays** | Lens fiction / volumetric sun. Both read as "look at my shader" in this scene. | — | skip |

**Integration gotcha (why this is [big] not [med]):** tone mapping moves to
the end of the composer chain. The sky dome's hand-inlined
`tonemapping/colorspace` includes (the v2 fix!) must come OUT when the
composer owns the frame, or everything double-grades; the harness sky locks
re-bake; `test-covers` ceiling re-measures. One flag (`postfx` prop) should
switch both paths so the ladder can drop to the non-composer pipeline
cleanly.

### 1.2 Non-post "organic" material work (works on mobile too)
- **★ Baked AO in vertex colors** — extend `stacks-models.mjs` with an
  offline raycast AO bake per GLB (multiply into `COLOR_0`; the shared
  atlas material reads it via `vertexColors`). Free at runtime, ships to
  every device, makes the props sit in themselves the way N8AO does at
  crevice scale. **[med]**
- **★ Procedural wood grain on planks** — planks are flat color today; a
  tiling CanvasTexture (long-grain rings + subtle roughness map) on
  top/lower planks + straps is the biggest material upgrade per pixel in
  the scene. Palette-locked so both themes keep their tones. **[med]**
- **Plank imperfection** — ±1° yaw jitter and ±0.005 thickness per unit,
  end-grain darkening at plank ends. Hand-built read for near-zero cost.
  **[cheap]**
- **Leaf/paper vertex gradients** — tip-ward lightening on the plant,
  page-edge darkening on books/binder pages. Needs vertex-color authoring
  in the pipeline, pairs with the AO bake. **[cheap once 1.2a exists]**
- **Hand-wobble vertex jitter** on procedural props (bake ~0.002 noise into
  RoundedBox geometries) — "hand-made" read; risky, easy to overdo. ⚑
  **[cheap]**

### 1.3 Per-section shelf identity (your #2) ⚑
Principle worth locking first: **one family, one signature.** Same wood +
strap system everywhere (it's one room), each section gets exactly one
structural tell. Menu per section — pick ≤1 each:

| Section | Signature options |
|---|---|
| About | warm: a small woven rug under the unit (procedural rounded rect, low pile texture) · or nothing — the portrait is already the tell ★ |
| Books | **side panels + a third short shelf row** — the only unit that reads as a true bookcase ★ · bookends (§2.2) |
| Training | **black steel straps + thicker planks** (palette swap + args) ★ · rubber mat under the unit (dark rounded rect at ground) |
| Talks | **picture-ledge lip** on the top plank front (thin raised strip the frames lean into) ★ |
| Projects | pegboard back panel (procedural hole grid, subtle) ⚑ — the one riskiest to taste · or a blueprint tube leaning like the golf club |
| Musings | writing-desk read: plank depth +0.1 on top, everything else stock ★ |
| Systems | stock + the wall-less minimal look it already has ★ (its identity is the clock/plant/binder set) |

Cheap universal variety: per-unit wood-tone jitter (±4% lightness), plank
length ±0.1, strap steel vs wood per section. **[cheap]**

### 1.4 Photos of you (your #3)
Inventory of `~/Desktop/Other/4 Pictures/` (3,159 files): year folders
2017–2026 with real-photo sets (`2 SF Gyms`, `4 bulking szn`, `6 cut`,
`12 Presses`, `3 tjSTAR`, `5 Consensus/After`, `6 Convergence`, `3 India`,
`8 MVY`, bdays) mixed with chart exports (`1 Lifting year in review` is
matplotlib PNGs) and slides (`6 Apple` is keynote frames). Formats: jpg/png
usable as-is; `.heic` needs conversion; `.mov/.psd` out.

- **Placement menu** (all use the existing LitImage pipeline):
  - **★ Training: 2–3 framed gym photos** replacing/joining the plates zone
    (the SF Gyms mirror shot is exactly the energy) + the strength-
    progression chart as one deliberately "taped-up" print ⚑.
  - **★ About: a leaning polaroid pair** next to the cards (procedural
    white-border polaroid frame + photo — personal without clutter).
  - **Talks: one real stage photo** (tjSTAR / Consensus After) as a 4th
    frame or replacing a still.
  - **Musings: CT Wall_Corkboard** (already downloaded/optimized in the
    research cache) leaning against the shelf back with 2–3 pinned
    polaroids ⚑.
  - Projects: an Apple-era photo if one exists that isn't a slide ⚑ (I
    only sampled; the folder may hold real photos deeper in).
- **Pipeline**: `scripts/stacks-photos.mjs` — takes a curated list, converts
  (sharp: heic→jpg, crop, cap 1024px), writes `public/images/stacks/`,
  prints an import manifest. **[cheap]**
- **⚑ Curation step**: you pick finals. Cheapest workflow: I shortlist
  ~20 into a contact-sheet HTML for you to circle; or you just name 5–8
  files and we ship those.

### 1.5 Model quality bar (your #8) ⚑ one licensing decision unlocks most of it
Current pool is CC0-only, which is why everything comes from one creator
(CreativeTrio) plus Quaternius. The catalogued CC0 relevant set is fully
mined: 19 CT props (9 in use) + Q open book. Remaining CC0 upgrades are
listed per-section in §2 — but the honest finding from both hunts (v1
Sketchfab, v3 poly.pizza) is:

> The step-change in model quality lives in **CC-BY** — Sketchfab's
> hand-painted tier and Poly-by-Google archives (real barbells,
> kettlebells, plants with modeled leaves, painterly books). Cost: a
> one-line credits entry (site footer or a `/colophon`), per-model
> decimation to our budget, and a license manifest in the pipeline script.

- **⚑ Decision: allow CC-BY with attribution?** If yes, next round starts
  with a focused hunt: barbell/kettlebell (Training), plant (Systems),
  hand-painted book piles (Books), desk clutter (Musings). If no, §2 lists
  the best CC0 + procedural paths.
- Also real: **bespoke procedural** beats a bad model. The v3 win list
  (clock face, golf ball) shows crafted-simple > generic-GLB. Where §2
  says "procedural upgrade," that's deliberate, not a fallback.

---

## 2. Section by section

Format per section: what's there now → weak points → options.

### 2.1 About
Now: portrait frame · card stack · globe · desk lamp + glow · book pile ·
mug (lower).
- Portrait is the anchor and reads well lit. Option: real chamfered wood
  frame profile (procedural bevel strips instead of one RoundedBox) —
  subtle craft signal at the unit you stare at most. **[cheap]**
- Card stack: fine at a glance, anonymous up close. Options: top card gets
  a tiny printed name via CanvasTexture ★ **[cheap]** · or swap for a
  passport + boarding pass pair (travel is true of you; pairs with globe)
  ⚑ **[med]**.
- Globe: good silhouette; at 1.5× scale the atlas colors read flat.
  Options: keep ★ · CC-BY painterly globe if §1.5 opens.
- Polaroid pair per §1.4 ★.
- Lamp: the anglepoise is the best prop in the scene. Keep. Consider
  Bloom (§1.1) making its bulb genuinely bloom ★.

### 2.2 Books (the feature unit — highest standards, lightest touch)
Now: packed cover/spine rows ×2 · book pile · long contact pools.
- Spine rows are the identity — don't replace with GLBs; improve the
  packing craft: occasional horizontal stack ON the row (2–3 spines lying
  flat atop the verticals, real shelves do this) ★ **[cheap]** · one
  leaning spine at a row end (15°, the "just browsed" tell) ★ **[cheap]**
  · spine-width distribution wider (0.04–0.16) **[cheap]**.
- Bookends: L-shaped steel (procedural, 2 boxes) ★ or CT Candlestick as a
  quirky bookend ⚑ **[cheap]**.
- Book pile → hand-authored stack with per-book overhang jitter + a
  bookmark ribbon (thin red strip) ★ **[cheap]**; CC-BY hand-painted pile
  if §1.5 opens.
- The 319 easter egg: one spine gets "319" as a CanvasTexture label ⚑
  (cute vs precious — your call).

### 2.3 Training
Now: 3 leaning plates (cylinders) · book pile · dumbbell GLB · basketball ·
golf club + ball.
- **Plates are the weakest read** (your "too simple" applies here too).
  Options: procedural upgrade — torus rim + inset disc + hub + raised
  label ring, i.e. real bumper-plate profile ★ **[med]** · CC-BY real
  plates/kettlebell if §1.5 opens ⚑ · replace zone with framed gym photos
  (§1.4) and keep ONE plate ★.
- **Add a loaded barbell leaning** against the right strap like the golf
  club mirrors the left — bar + sleeves + 2 plates, procedural, honest
  (you squat 586) ★ **[med]**.
- Book pile here is filler — swap for chalk bag (procedural cinched
  cylinder + drawstring) ⚑ or the framed strength chart **[cheap]**.
- Basketball/golf: shipped; tint knob still open at browse.
- Shelf identity: steel straps + mat (§1.3).

### 2.4 Talks
Now: 3 framed stills · desk lamp below.
- Add one real stage photo (§1.4) ★.
- Lanyard + badge stack beside the frames (2 cards + a strap loop,
  procedural, conference-true) ⚑ **[cheap]**.
- Mic hunt was a dead end (v3); a tiny tabletop mic stand procedural
  (base + rod + capsule) is ~6 primitives if you want the symbol anyway ⚑
  **[cheap]**.
- Picture-ledge lip (§1.3) makes the frames' lean physical ★.

### 2.5 Projects
Now: 3 framed screenshots · book pile · trophy.
- Trophy: keep; Bloom will give the metal a life it currently lacks.
- The screenshots-in-frames read is good; add **device variety**: one
  frame becomes a standing tablet (thin rounded slab + screen texture) so
  the row isn't three identical rectangles ⚑ **[med]**.
- Blueprint tube (rolled paper cylinder pair) leaning at the unit side —
  "built things" without another screen ★ **[cheap]**.
- Book pile → stack of spiral notebooks (procedural coil edge) ⚑ **[med]**.

### 2.6 Musings
Now: leaning notebooks (clickable) · open book GLB · headphones · paper
stack + pen · mug pen cup.
- This unit landed best in v3. Light touches only:
- CT **Cup Of Tea** next to the open book (steam = 2 alpha wisps or
  nothing; tea + open book + 3:45am is the whole site's thesis in one
  prop) ★ **[cheap]** — already downloaded in the research cache.
- Corkboard + pinned polaroids per §1.4 ⚑.
- Pen cup: the CT mug's office tools read generic pencil — recolor the
  tools via atlas roles so they're not identical to the About mug ★
  **[cheap]**.
- The last leaning notebook (the −0.2 rad one) should get a visible elastic
  band (thin dark strip) — it's the "current notebook" tell **[cheap]**.

### 2.7 Systems (your screenshot — most work needed)
Now: binder · alarm clock GLB + 3:45 face · quote cards · book pile ·
potted plant.
- **Binder** options: rotate spine-to-camera with a readable
  "OPERATING MANUAL" CanvasTexture label ★ **[cheap]** · swap for CT
  "Books" GLB (catalogued as a file-binder trio — instant upgrade,
  already in the research cache) ★ **[cheap]** · redesign procedural: box
  + spine cylinder + page block inset with visible page lines **[med]**.
  (Current rings-facing-camera composition dies in all three.)
- **Quote cards** options: kill outright, quotes already live in the
  placard ★ **[cheap]** · ONE typeset quote card in a tiny stand
  (CanvasTexture serif type, readable on hover-lift) ⚑ **[med]** · small
  paper tray with a fanned stack (reads as inbox, on-theme for Systems)
  **[med]**.
- **Plant** options: keep CT but bake leaf gradients + AO (§1.2) **[cheap]**
  · Quaternius Ultimate Nature has fuller CC0 plants — targeted re-hunt
  ★ **[med]** · CC-BY modeled-leaf plant if §1.5 opens · swap species:
  a snake plant reads better low-poly than a ficus (upright blades vs
  flat leaves) ⚑.
- Alarm clock: the v3 win. Keep. Bloom makes its face lamp-lit at night.
- Add: **Quaternius water bottle** (CC0, found in v3 hunt) on the lower
  shelf — the 3:45 routine is hydration-pilled ⚑ **[cheap]**.

### 2.8 The sky + world (quick wins already queued by v3 findings)
- Beacon/shimmer/Karl/grain knobs remain browse-gate items (unchanged).
- The satellite could occasionally be the ISS (brighter, rarer — 1 in 5
  passes) ⚑ **[cheap]**.
- Ground: the void below units is pure gradient; a barely-there horizontal
  reflection smear under each unit (stretched dark quad, 4% opacity)
  reads as polished floor ⚑ **[cheap]**.

---

## 3. Suggested shape for the next round (edit freely)

1. **Fixes first** (§0): lower plank, sticky LOD, toggle, Systems trio.
2. **Materials + AO bake** (§1.2) — mobile-safe organic.
3. **Postprocessing prototype** (§1.1) — N8AO + Bloom + SMAA + Vignette +
   TiltShift2 behind a flag, judged by you on screen before it's load-bearing.
4. **Photos** (§1.4) — pipeline + your curation pass.
5. **Shelf identity** (§1.3) + section props (§2) — whatever survives your
   markup of this doc.
6. Re-gate: harness suite + re-baked sky locks (post-composer), fps ladder
   on desktop AND a real phone.

Open decisions queued for you: CC-BY attribution (§1.5) · TiltShift2 taste
fork (§1.1) · pegboard (§1.3) · photo picks + chart-as-print (§1.4) ·
quote-card fate, plant species, water bottle (§2.7) · badge stack + mic
(§2.4) · passport/polaroids (§2.1) · "319" spine (§2.2).
