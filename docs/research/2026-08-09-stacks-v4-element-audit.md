# Homepage 3D scene v4 — element-by-element audit (v2, fan-out verified)

Date: 2026-08-09 · Branch: `feat/stacks-home` through `868996a` (v3 complete)
This is v2 of the audit — five parallel agents replaced v1's desk-research
with verified findings: two close-up visual auditors (every element, both
themes, crops on disk), a model hunt with correct license filters, a
postprocessing compatibility verification against installed source, and a
photo-library curation pass. Full reports: `docs/research/v4-reports/`
(the photo report stays out of the repo; its shortlist is inlined in §5).
Screenshot evidence lives in the session scratchpad `audit-a/` + `audit-b/`.

Your review doc: mark up / delete / add, and the next round gets planned
from the edited version. Tags: **[fix]** do regardless · **[cheap]/[med]/[big]**
· **★** recommendation · **⚑** your call.

**What the fan-out overturned from v1:** contact pools can't be fixed by
tuning — they're geometrically invisible at this camera angle (§1.1);
the composer handles tone mapping mostly automatically — the real work is
elsewhere (§2.1); a CC0 desk mic exists after all; Sketchfab's CC0 tier is
effectively empty, so poly.pizza is the only CC0 source; and the tjSTAR
photo folder is mislabeled high-school content — the only real stage
photography is the Consensus pro shoot.

---

## 1. The verified defect list (do these regardless of taste choices)

### 1.1 Grounding is architecturally broken — technique change, not tweak **[fix]**
ContactPools are horizontal quads at surface+0.001. The camera views the
top shelf at ~2° grazing, so the quads project to essentially zero screen
area; at opacity 0.3 over dark wood the residue is imperceptible. Verified
under every prop in units 4-6 and most of 0-3 (the desk lamp has no visible
pool at all). **Every prop "pasted-on" complaint traces to this one cause.**
The only place grounding currently works is the Talks frame bases — because
the frames' own dark bottom edges do the work, not the pool.
- **★ Layered replacement:** (a) darken prop *bases* — bake AO into vertex
  colors in the model pipeline (works at any angle, ships to mobile,
  §2.2); (b) N8AO on desktop for real crevice contact (§2.1); (c) delete
  the shelf ContactPools (dead weight); (d) keep + fix only the GROUND
  pools (they're viewed at a usable angle): per-foot small ellipses at the
  actual foot positions instead of one wide ellipse hardcoded at x −0.55
  that misses the right foot entirely. **[med]**
- (e) Optional: shadows painted into the plank wood texture under each
  static placement (placements are fixed, so this is authoring, not
  simulation) — only worth it if (a)+(b) underdeliver. **[med]**

### 1.2 Lower plank touches nothing **[fix]**
Confirmed at `width·0.72 = 2.304` vs straps at ±1.35 — 0.198 air per side,
"the most damaging structural read in the scene," worst on mobile. Fix per
v1 §0.1: full-width plank + cleat blocks ★, or hangers, or side gables.
Related, same file: straps (0.05²) are thinner than the plank (0.07) they
carry — bump to 0.07-0.08 ★; plank end-caps overhang inconsistently.
**[cheap]**

### 1.3 Textures unmount to blank slabs mid-scroll **[fix]**
Confirmed and photographed: at LOD radius 1, units still fully on screen
render as large black/cream rectangles during travel (worst at Projects —
three big black slabs). Fix: sticky LOD latch (once textured, stay) ★ +
prefetch remaining units post-ready. **[cheap]**

### 1.4 Clock face is misregistered **[fix]**
The v3 overlay is oversized, sits high-left, and shows the GLB's painted
dial as a crescent behind it — two sets of tick marks; in light theme the
whole clock reads as a cartoon animal face. Re-measure the dial transform
from the GLB (pipeline prints it), shrink radius to the dial's inner face,
and align — "fixing registration turns a blocker into the best prop in the
scene." Timebox stands: procedural fallback if it fights. **[cheap]**

### 1.5 Book piles have air between books **[fix]**
Books are 0.06 thick stacked at 0.085 spacing — a 0.025 gap (42% of a
book's thickness); sky is visible through the slots in light theme and on
mobile. Also the page block protrudes *below* the cover (upside-down
anatomy). Fix spacing to thickness+~0.004 and flip the page-block inset.
Same asset is reused at the same x in two units (Projects/Systems) —
vary rotation/colors per unit. **[cheap]**

### 1.6 Theme toggle placement **[fix]**
Unchanged from v1: it's buried in the About placard. Fixed top-right
chrome island, both modes. **[cheap]**

### 1.7 Dust motes render as stuck pixels **[fix]**
1-2 px hard white squares in front of dark wood (square `Points` with no
texture). Give the points a soft radial sprite map + size attenuation
already exists — just needs the round alpha. **[cheap]**

---

## 2. Global levers

### 2.1 Postprocessing — verified, GO with a short required-work list
Full verification in `v4-reports/postprocessing-verification.md`. Compat:
`@react-three/postprocessing 3.0.5` (peers satisfied; **published today —
composer-lifecycle rewrite, no field soak; pin exact versions**),
`postprocessing 6.39.4` (**three 0.185 is the last supported minor — pin
three until v7 stabilizes**), `n8ao` ships inside r-p-p (don't install).

Verdicts: **Vignette GO · SMAA GO** (and delete MSAA: set
`gl.antialias false` — it's dead weight under a composer) · **Bloom GO**
(threshold ~0.95 or Selection-scoped, else the sky blooms milky) ·
**TiltShift2 GO-W-CAUTIONS** (cheap; drive the band via uniforms not
props; ⚑ strong "miniature" stylistic commitment — prototype first) ·
**N8AO GO-W-CAUTIONS** (the exact contact fix this scene needs; halfRes +
quality low; +84 KB gzip; known collision with dpr changes — unmount it in
lockstep with the ladder's dpr step) · **mobile NO-GO on the whole
composer** (iOS MSAA/depth corruption + cost) — `dynamic()`-import it,
never downloaded on touch.

Required work discovered (this is the real integration cost, ~all of it
verified in three's source):
1. The sky's manual tonemapping/colorspace includes no-op automatically
   inside the composer (three forces NoToneMapping for render targets) —
   BUT the sky's IGN dither then grains linear HDR: gate it behind a
   `uPost` uniform and let the chain's Noise/grain take over.
2. `ToneMappingEffect` defaults to **AgX** — set ACES explicitly, imported
   from `postprocessing` (not re-exported by r-p-p).
3. **Never `enabled={false}`** — a mounted-disabled composer leaves the
   renderer pinned to NoToneMapping (blown-out frame). Mount/unmount only;
   warm the shader-recompile during the load crossfade.
4. Additive dust + shadow pools will re-tune: blending moves from sRGB to
   linear HDR space (dust reads weaker, pools darker) — budget an hour.
5. Re-bake `sky-expected.json` + cover-brightness ceiling after.
Chain cost estimate ~3-5 ms desktop (M-series, dpr 1.5) — comfortable.
**[big, phased: Vignette+SMAA+Bloom first, then N8AO, TS2 prototype]**

### 2.2 Baked AO + material depth (mobile-safe organic, unchanged from v1 but now load-bearing)
- ★ Vertex-AO bake in `stacks-models.mjs` (multiply into COLOR_0; atlas
  material reads vertexColors). Now doubles as the §1.1 mobile grounding
  path. **[med]**
- ★ Procedural wood grain + roughness variation on planks/straps — also
  directly attacks §2.3's flatness. **[med]**
- Plank end-grain darkening, per-unit wood-tone jitter ±4%. **[cheap]**

### 2.3 The two themes fail in opposite directions **[fix-adjacent, new]**
Verified side-by-side: **dark collapses albedo** — the three-book piles'
rust/olive/terracotta become three identical browns; five of six notebook
spines converge; the open book turns to a beige lump (it reads correctly
in light — lighting, not model). **Light collapses value** — lamp, plank,
and spines merge into one ochre; frame borders and quote cards vanish
into the near-white sky; overall contrast dies.
- Dark: cool the hemisphere/key mix slightly or desaturate the warm key;
  widen the dark palette's chroma spread for spines/piles/covers
  (authored hexes, not lighting alone) ★ **[med]**
- Light: deepen the light sky gradient a step, darken wood ~8% against
  paper props, restore frame-rail value contrast ★ **[med]**
- The sky itself: light theme's skyline is a faint ghost doing no
  compositional work — raise its presence a step (it's the best asset in
  dark; unit-5-dark is the reference composition). **[cheap]**

### 2.4 Photographic content fights the warm world **[new]** ⚑
The portrait, talk stills, and project frames inject teal/green/magenta —
in dark they're the brightest, most saturated objects on screen ("backlit
monitors in a warm room"). And Talks frame 2 is a photo of a projected
slide with letterboxing and illegible burned-in captions — a document,
not a moment.
- ★ Warm-grade all in-scene photo textures at load (small canvas pre-tint
  toward the palette, ~5-10%) — keeps identity, joins the room. **[med]**
- ★ Replace frame 2 with a real stage photo (§5 shortlist has four).
- Frame-row composition: give the three frames rotation/size jitter and
  breathing room (they currently read as one continuous thumbnail band,
  edge to edge). Shrink row to ~2.6 wide — required on mobile anyway,
  where both outer frames are cut by the viewport. **[cheap]**

### 2.5 Structure/composition insights worth acting on **[new]**
- **Mid-travel is the best the scene ever looks** (real parallax, three
  shelves against the skyline). ⚑ Consider a slightly wider settled
  framing or more lateral offset so units breathe like the transitions do.
- Placard transitions cross-fade text-over-text → mush. Fade-out-then-in
  or slide. **[cheap]**
- Lamp glow sprite blows out to pure white mid-travel in light theme —
  scale opacity by view angle or clamp. **[cheap]**
- Mobile: composition is *better* than desktop everywhere (keep it), but
  ~30% dead space below the shelf — nudge world center down a touch on
  mobile, and fix the unit-4 row overflow (§2.4). **[cheap]**
- Empty zones: Training upper-left + lower-left bare; Talks lower shelf
  holds one small lamp in a 550px span; Musings clusters everything
  left-of-center. §4 placements fill these deliberately.

---

## 3. Per-element punch list (both auditors, merged; severity in parens)
Crop evidence: `audit-a/`, `audit-b/` in the session scratchpad.

**About** — cards read as offcut lumber, not cards (blocker → §4 swap or
white-edge + printed-top rebuild) · globe sphere is a flat-shaded
checkerboard with zero land/ocean read (blocker — the v3 atlas recolor
mapped land and ocean to near-identical tones; fix the atlas role mapping
for the globe's texels or accept a CC-BY painterly globe) · desk lamp
never looks ON — dark inner shade + zero emissive in light + aliasing
wire-thin legs (blocker — add an emissive bulb/inner-shade disc + slight
leg thickening; Bloom finishes it) · portrait frame dissolves in light
theme; crop leads with a blurry hand (notable — re-crop toward the face;
§5 offers replacement candidates) · pile gaps §1.5 · mug: works (scissors
noted — atlas recolor can mute them).

**Books** — every spine is blank on the unit whose subject is books
(notable-to-blocker at close range): spine ridge lines + occasional
CanvasTexture title marks on the widest spines ★, horizontal
stacks-on-row + one leaning spine (v1 options confirmed) · dark theme
albedo collapse §2.3 · *The 12 Levers* half-hidden by placard (nit —
shift row) · pile gaps §1.5.

**Training** — plates are the worst props in scope: "chocolate donuts,"
dead-vertical clip-art lineup, no see-through bore (blocker → §4 paths)
· golf club face carries a wicker-weave tile where grooves belong + shaft
clips THROUGH the upper plank with a nub poking out the top (blocker —
re-tint face, pull lean angle out, drop scale a hair) · basketball is
visibly faceted next to a smooth golf ball (notable — smooth-shade normals
in pipeline or accept) · dumbbell handle is shelf-toned wood-tan and
undersized next to the ball (notable — darken handle via atlas role,
scale ×1.15) · emptiest composition of the seven §2.5.

**Talks** — frame 2 slide-photo (blocker §2.4) · row reads as pasted
thumbnails: zero rotation/jitter (notable §2.4) · lamp same as About +
it's alone on a 550px-wide shelf (§4 fills) · aviation beacon lands in a
frame gap at this azimuth (nit — nudge tower or accept).

**Projects** — frame contact reads as decals (§1.1) · frame 3 is a GitHub
file listing — illegible content at any size (notable — swap image or
replace with a real app shot) · trophy reads terracotta, not gold: no
specular, faceted bowl (notable — metalness/roughness exception for the
trophy material + Bloom; or CC-BY metal trophy later) · pile §1.5 + reused
identically in Systems (nit).

**Musings** — best unit; keep. Open-book dark collapse §2.3 · notebooks:
no notebook signal (no coil/elastic/tabs) + five-of-six converge in dark +
clickables have zero affordance (notable — elastic band + coil hint on
clickables, widen dark hues, tiny lift-on-idle pulse ⚑) · leaning last
spine leans into air (nit — lean against a bookend or the open book) ·
headphones: best GLB in scope (works) · right third of both shelves empty
(§4 fills).

**Systems** — quote cards: worst single element in the scene — blank,
oversized, merged into a cardboard trifold (blocker → kill ★ or one
typeset card in a stand ⚑) · binder rings sit on the outer pages face like
routed grooves + blank label (blocker → CT Books swap ★ or spine-out
rebuild with printed label) · clock §1.4 · plant reads dead-khaki in dark
with a soil-less pot rim (notable → §4 sansevieria + soil disc) · pile
§1.5.

---

## 4. Models — verified candidates (full tables in `v4-reports/model-hunt.md`)
License landscape (corrected filters): **poly.pizza is the only real CC0
source** — Sketchfab's CC0 tier is museum scans. Non-CreativeTrio models
carry their own textures (recolor work each); CT props share our atlas
(drop-in). **Gym equipment is CC-BY across the board — confirmed dry in
CC0 at both sources. ⚑ The attribution decision gates the whole category**
(one credits line, e.g. in the colophon/footer).

**Unambiguous CC0 wins (atlas-shared, zero texture work):**
- ★ **CT Books** (360 tris) — replaces the procedural binder in Systems
  AND upgrades/joins book piles.
- ★ **CT Cup Of Tea** (436) — Musings, next to the open book.
- ★ **CT Wall Corkboard** (218) — Musings/About photo anchor (§5).
- **CT Treadmill** (220) — the CC0 "gym signal" escape hatch if CC-BY
  stays off the table ⚑.

**CC0, own texture (one recolor each):**
- ★ **Sansevieria Plant** (Isa Lousberg, 1464 tris / 84KB) or her Small
  Sansevieria (276/34KB) — fixes the dead-ficus read outright.
- ★ **iPoly3D Mic** (1344/61KB) — a good CC0 desk mic exists after all
  (overturns v3's dead end). Talks lower shelf ⚑.
- **Quaternius Scroll/Parchment** — the blueprint-tube stand-in (tubes
  don't exist in either tier); Projects.
- Quaternius book singles ×3 — spine variety for §3-Books.
- Rug: CC0 rugs exist but **go procedural** — same cost, palette by
  construction.

**CC-BY (needs the ⚑):** Zsky Barbell (1988, decimates well) ★ ·
Poly-by-Google Kettlebell (1104, in budget) ★ · bumper Plate (136) ·
Instant Camera (494 — no CC0 polaroid exists) · lectern options thin.

**CT catalog deep cuts worth considering ⚑:** Grandfathers Clock (547 —
a floor clock beside the Systems unit, reading 3:45, would be a
statement) · Ladder (220 — a library ladder leaning on the Books unit) ·
Candlestick · Flowers · Telescope (only if literally true of you) ·
Armchair (a reading chair at the About or Books unit changes the scene's
grammar from "shelf" toward "room" ⚑).
Catalog caveat: the creator page paginates badly; the ~70-term sweep may
have missed long-tail titles.

---

## 5. Photos of you — curated shortlist (inventory verified; full color kept out of the repo)
Corrections that matter: `2025/3 tjSTAR` is mislabeled 2017 high-school
content — **the only real stage photography is the Consensus 2026 fireside
pro shoot** (19 frames, 2048×1152). `6 Convergence` is retreat hikes;
`3 India` is conference-room groups. The lifting-review folders are
matplotlib charts. Best discovery: `2019/8 MVY` holds 110 professional
Randi Baird frames (6720×4480). **No conversion needed for any pick below
(all jpg/png).** All paths under `~/Desktop/Other/4 Pictures/`.

- **Training (framed, 1-2):** ★ `2024/2 SF Gyms/IMG_6281.jpg` (solo
  mirror shot, editorial grade — the one that survives 300px) ·
  `2024/7/BWG 3/IMG_0021.jpg` (two-person, energetic) · ⚑ flagged not
  recommended: `2025/8 cut/IMG_0987.jpeg` (physique pose — your call) ·
  **gap: no mid-lift stills exist anywhere** — only videos
  (`Bench GVT.mp4`, `Squat GVT.mov`, `2026/7 PRs+DEXA/*.MOV`); a
  frame-grab step is the only route to an action shot ⚑ · wildcard:
  the five-BlenderBottles still life (`2026/2 Cut/Raw/6r.jpeg`) says
  "training life" without another selfie ⚑.
- **Talks (replace frame 2, maybe frame 3):** ★ `…Consensus/After/…/
  Cropped/TW203702.jpg` (tight, mid-sentence, headset mic) ·
  `TW203736.jpg` (CONSENSUS backdrop fully readable) · `TW203652.jpg` ·
  alternate venue: `2026/8 Stanford/2.jpg` (panel + audience scale).
- **About (polaroid pair / portrait alternates):** ★ `2025/8 MVY/
  Personal/IMG_1237.png` (beach at sunset — "best in the library") ·
  `2019/8 MVY/Bros Lifeguard/19_RandiBaird_ASEL_0044.jpg` (pro, four
  brothers, crops square) · `2026/8 Stanford/7.jpg` (solo close-up —
  also a candidate to REPLACE the current soft teal portrait ⚑) ·
  `2020/6 CA Road Trip/Josua Tree/IMG_5869-2.jpg`.
- **Travel (pairs with globe):** ★ `2021/9 Europe/2 Budapest/
  IMG_5223-2.jpg` (Parliament, sharpest landmark) · `2017/4 Mt
  Washington/…140232651.jpg` (iced summit group) · `2025/3 India/Recap/
  5.jpg`.
- Pipeline: `scripts/stacks-photos.mjs` (copy/convert/crop/cap-1024,
  manifest) + optional contact-sheet HTML if you'd rather circle picks ⚑.

---

## 6. Per-section identity (v1 menu, now informed by the audit)
Unchanged principle: one family, one signature. Confirmed needs: Books =
side panels (§1.2 pairs), Training = steel straps + fill the empty left
half, Talks = picture-ledge + fill the bare lower shelf (mic ⚑ / second
prop), Projects = shrink + jitter the frame row (mobile requires it),
Musings = rebalance rightward (tea + corkboard do it), Systems = the CT
Books binder + sansevieria + grandfather-clock ⚑ decide its whole read.

---

## 7. Suggested phase shape for the round (edit freely)
1. **Fixes** (§1): grounding replacement (pool cull + per-foot ground
   ellipses + base darkening), plank/straps, sticky LOD, clock
   registration, pile spacing/anatomy, toggle, dust sprite.
2. **Theme repair** (§2.3): dark chroma spread + light value separation +
   photo warm-grade (§2.4) + frame-row composition.
3. **Models round 2** (§4): CT trio swap-ins + sansevieria + spine craft
   + plate path (procedural rebuild now; CC-BY upgrade later if ⚑ yes) +
   golf-club fixes (face tint, un-clip).
4. **Photos** (§5): pipeline + your picks + frame-grab if wanted.
5. **AO bake + wood grain** (§2.2).
6. **Postprocessing** (§2.1): V+SMAA+Bloom, then N8AO, TS2 prototype for
   your eyes only.
7. Re-gate everything (harness + re-bakes + fps ladder + real phone).

## 8. Decision queue (the ⚑ list in one place)
CC-BY attribution — gates gym gear + instant camera + painterly globe ·
TiltShift2 miniature look — prototype then keep/kill · portrait
replacement (Stanford close-up) vs re-crop current · physique-pose photo
in/out · video frame-grab for a true mid-lift still · quote cards: kill vs
one typeset card · plates: procedural rebuild vs CC-BY vs photo-swap ·
mic prop in Talks · grandfather clock / ladder / armchair (scene-grammar
changes) · treadmill as CC0 gym signal · wider settled framing (the
mid-travel insight) · dark-theme photo warm-grade strength.
