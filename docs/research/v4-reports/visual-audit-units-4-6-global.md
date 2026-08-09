All shots captured. Here's the audit.

---

# Close-up visual audit — units 4–6 + global passes

All crops in `/private/tmp/claude-501/-Users-chappyasel-Desktop-Repos-PersonalWebsite/bb560b5f-5058-4e3d-912c-7b0485d980e1/scratchpad/audit-b/`. No repo files modified.

**The headline:** the two known-bad items (binder rings, quote cards) are real but they are *not* the worst problems. Three things outrank them: contact shadows are architecturally incapable of working at this camera height, the lower shelf plank is not attached to the legs, and framed/cover textures unmount to black rectangles during scroll. Also — mobile composes noticeably better than desktop for all three units.

---

## Unit 4 — Projects

| Element | Verdict | Severity | Crop |
|---|---|---|---|
| Frame row (3×) | Reads as a wall of tiny illegible text, not three projects | notable | `u4d_frames.png` |
| Frame #3 content | GitHub file-listing screenshot, not an app screenshot | notable | `u4d_frames.png` |
| Frame border (light) | Border vanishes — frames lose their framing | notable | `u4l_framecontact.png` |
| Frame contact | Zero shadow; frames read as decals on the shelf edge | blocker | `u4l_framecontact.png` |
| Trophy | Matte brown, no metal specular — reads terracotta, not gold | notable | `u4d_trophy.png` |
| Trophy geometry | Hard-shaded facets on the bowl, near-degenerate handles | nit | `u4d_trophy.png` |
| Book pile | Visible sky gaps between books — three floating slabs | blocker | `u4l_bookpile.png` |
| Book anatomy | Page block protrudes *below* the cover (backwards) | notable | `u4l_bookpile.png` |
| Beacon light | Most saturated pixel in the scene; lands in a frame gap | nit | `u4d_beacon.png` |

The frames are 0.9 wide spaced 1.0 apart, so the row spans −1.45…+1.45 of a 3.2 plank — edge to edge with 0.1 gaps. There is no breathing room and nothing else on the top shelf, which is why it reads as one continuous band rather than three objects. The third frame is also the one cut by the placard, so the *worst* image is the one that looks deliberately hidden.

The book pile gap is arithmetic, not perception: books are 0.06 thick stacked at 0.085 spacing, leaving a 0.025 gap — 42% of a book's thickness. In light theme you see the background straight through the slots.

**What works:** the RoundedBox bevel highlights are genuine craft and read as machined edges throughout. Frames 1 and 2 are colorful enough to survive at thumbnail scale.

---

## Unit 5 — Musings

| Element | Verdict | Severity | Crop |
|---|---|---|---|
| Notebook spines | Read as plain book spines — no notebook signal at all | notable | `u5l_notebooks.png` |
| Spine colors (dark) | Five of six collapse into muddy brown against the skyline | notable | `u5d_notebooks.png` |
| Leaning spine | Leans *away* from the row with nothing supporting it | notable | `u5l_notebooks.png` |
| Spine uniformity | All six identical height and width — reads as an array | nit | `u5l_notebooks.png` |
| Click affordance | Front three are blog posts with zero visual cue | notable | `u5l_notebooks.png` |
| Open book (dark) | Collapses to a beige lump; no gutter, no pages | blocker | `u5d_openbook.png` |
| Open book (light) | Actually reads correctly — so it's a lighting failure, not a model one | — | `u5l_openbook.png` |
| Headphones | Best GLB in scope; clean silhouette, correct two-tone | works | `u5d_headphones.png` |
| Headphone yoke | Arm ends abruptly at the cup, no hinge | nit | `u5d_headphones.png` |
| Mug "pen cup" | Contains **scissors and kitchen utensils**, not pens | blocker | `u5l_mug.png` |
| Mug texture | Pale rectangle bleeding through on the lower front (same spot both themes → UV/atlas bug, not dust) | notable | `u5l_mug.png` |
| Paper stack + pen | Reads well; pen is fat enough to read as a marker | nit | `u5d_paper.png` |
| Top-shelf balance | Left third empty; notebooks occupy ~165px of a ~700px shelf | notable | `u5_dark.png` |
| Lower shelf | Two tiny props on a mostly bare plank | notable | `u5_dark.png` |

The mug is the concept failure of this unit — at 10× the handles resolve unmistakably as scissors. "Mug as pen cup" doesn't land; it reads as a utensil crock, and it's the only cool-grey object in an all-warm scene.

**What works:** unit 5's dark-theme sky is the best frame in the whole world. The SF skyline with lit windows, Sutro Tower, and the sunrise gradient sitting right at the shelf line genuinely reads as a shelf in front of a window. The headphones silhouetted against the warm horizon band is the single best-composed prop-to-sky relationship I found.

---

## Unit 6 — Systems

| Element | Verdict | Severity | Crop |
|---|---|---|---|
| Binder rings | Three dark crescents on the *outer* pages face — anatomically wrong, read as routed grooves | blocker | `u6d_binder.png` |
| Binder pages | Flat solid plane, zero striation — reads as cardboard | notable | `u6d_binder.png` |
| Binder label | Blank rectangle; reads as a missing texture | notable | `u6d_binder.png` |
| Quote cards | Three cards merge into one folded cardboard trifold | blocker | `u6d_cards.png` |
| Quote cards scale | Larger on screen than the clock — three index cards shouldn't be a monolith | blocker | `u6d_cards.png` |
| Quote cards content | Entirely blank; nothing signals "quote" | blocker | `u6d_cards.png` |
| Alarm clock (dark) | Best-modeled prop in scope; bells, handle, dial all read | works | `u6d_clock.png` |
| Clock face overlay | Misregistered — sits high/left and oversized, GLB dial shows as a crescent, two sets of tick marks | blocker | `u6l_clock.png` |
| Clock (light) | Reads as a **cartoon animal face** — bells as ears, hands as a smile | blocker | `u6l_clock.png` |
| 3:45 payload | ~40px on screen; the whole point of the prop is invisible | notable | `u6d_clock.png` |
| Potted plant (dark) | Leaves render khaki-brown — reads dead | notable | `u6d_plant.png` |
| Plant pot | No soil; you see into an empty pot with a stem from nowhere | notable | `u6d_plant.png` |
| Plant leaves | Flat single-sided kite polygons, hard points | nit | `u6d_plant.png` |
| Book pile | Identical asset at identical position to unit 4 | notable | `u6_dark.png` |

The quote cards are the worst *single* element in my scope. Roll is only 6.9° and the seams read as creases in one sheet. The center card is `palette.paper` and the outers `palette.pages` — imperceptibly different, so there's no value separation either. In light theme they nearly disappear into the white sky.

The clock is the most frustrating: the GLB is charming and the canvas-face idea is right, but the overlay is a flat disc floating at z=+0.053 in front of a curved dial, larger than the dial and off-center. Fixing registration would turn a blocker into the best prop in the scene.

---

## Global pass 1 — Shelf structure

**Blocker: the lower plank is not attached to anything.** Straps sit at x=±1.35; the lower plank is `width*0.72` = 2.304 wide, so its ends land at ±1.152 — 0.198 short on each side. `u6l_strapgap.png` shows it unmistakably: the plank's rounded end floats in empty white next to a post it never touches, while the post continues past it to a foot. This is the most damaging structural read in the scene and it's visible in every unit, both themes, desktop and mobile.

**Blocker: ContactPools cannot work at this camera height.** They're horizontal quads at surface+0.001. The camera sits at y=0.25 and the top shelf at y=0.035 — a ~2° grazing angle, so a top-shelf pool projects to essentially zero area. Compounding it, `meshBasicMaterial` at opacity 0.3 in the shadow color is imperceptible against dark wood. Every prop in all three units — trophy, books, frames, notebooks, headphones, binder, clock, cards, plant — sits with no visible contact. This single cause explains most of the "pasted on" feeling. Evidence: `u4d_bookcontact.png`, `u4l_framecontact.png`.

**Notable: straps are thinner than the plank they carry** (0.05 square section vs 0.07 plank). Reads spindly, most obvious in light.

**Notable: the GroundPool misses the right foot.** It's centered at x=−0.55 with a 3.4 span, covering −2.25…+1.15 — the right strap at +1.35 falls outside it entirely. `u6l_pool.png` shows the left foot standing beside its shadow rather than in it, with the pool's mass drifting right and down. It also reads as a smudge on a backdrop rather than a floor shadow, because there's no floor plane and no contact darkening at the feet.

**Notable: feet imply a floor that doesn't exist.** In dark theme the pool is invisible, so plinth feet terminate in a hard edge in a void (`u6d_foot.png`).

---

## Global pass 2 — Transitions

**Blocker: textured content unmounts to blank rectangles mid-travel.** `useUnitLod` gates on `|activeUnit − index| <= 1`, but units two or more steps away are still fully on screen during a damped scroll. In `trans_700.png` unit 4's three frames render as large flat black slabs; in `trans_u4_650.png` the Talks screen is a black panel; in `trans_u5_900_light.png` three blank cream panels. This is the ugliest thing in motion and it lands on unit 4 specifically because the frames are big.

**Notable: placard cross-dissolve double-exposes text.** Both headings and both card sets are simultaneously legible-but-not — "Musings" over "Operating Manual" in `trans_1000.png`, "The Human Side of AI" over ghosted Projects copy in `trans_u5_900_light.png`. Text over text is mush; a fade-out-then-in, or a slide, would be cleaner than a cross-fade.

**Notable: the lamp glow blows out during travel.** The 1.6×1.6 additive sprite reads as a lens flare from off-axis; in light theme it washes the Talks lower plank to pure white (`trans_u5_900_light.png`).

**What works — and it's significant:** mid-travel is when the scene looks most like a *world*. The alternating z-offset (0 / −0.55 on odd units) produces real parallax, and seeing three shelves at different depths against the skyline is more compelling than any settled unit shot. Worth considering whether the settled framing is too tight.

---

## Global pass 3 — Mobile

Mobile is better than desktop for all three units. The full shelf fits edge to edge, the skyline fills the horizon band, and the props compose as a still life instead of competing with a placard. `u5_mob_dark.png` is the best single image I captured.

Problems:

- **Blocker: unit 4's frame row overflows the mobile viewport.** At 390×844 the narrow camera gives a visible half-width of 7.6·tan(21°)·0.462 ≈ 1.35, but the frame row spans ±1.45. Both outer frames are cut by the screen edges (`u4_mob_dark.png`). The row needs to shrink to ~2.6 wide for mobile.
- **Notable: ~30% of the screen below the shelf is empty.** The composition is top-heavy and the bottom chip floats alone in a void. Same in all three units.
- **Notable: the lower-plank gap is very legible on mobile** — both ends float clear of both legs against a plain background.
- **Notable: book pile gaps are worst here** — you see dark sky through the slots (`u6_mob_dark.png`).
- Unit 5 clusters all content left-of-center on both shelves, leaving the right third empty.

---

## Global pass 4 — Sky meets shelf

**Unit 5 (dark) is the reference for how this should work.** The skyline base sits just above the plank, buildings' bases are occluded by the shelf, and warm window lights give props a rim. Deliberate and lovely.

**Unit 6 (dark)** also composes well — the clock sits in a gap between building clusters and gets a warm rim from the sunrise. The binder collides with a dense building cluster and loses its silhouette.

**Unit 4 (dark)** wastes it. The frame row occludes the entire skyline; only thin slivers show through the 0.1 gaps between frames. The best asset in the scene is hidden behind the busiest content.

**Light theme, all units: the sky does no work.** It's a near-white field with a faint grey ghost skyline (`u6_light.png`). Combined with cream props on blond wood, overall contrast collapses — the quote cards and the frame borders nearly vanish. Light theme needs either more skyline contrast or a warmer/deeper sky gradient.

**Nit:** dust motes render as hard 1–2px white squares in front of the wood. On dark planks they read as stuck pixels rather than dust — visible in `u5d_paper.png` and `u6d_cards.png`.

---

## Top 10 worst offenders in my scope

1. **ContactPools are invisible everywhere** — grazing-angle horizontal quads at a 2° view. Every prop in all three units floats. Needs a different technique entirely, not a tweak. `u4l_framecontact.png`
2. **Lower plank floats free of both legs** — 0.198 gap each side, baked into `ShelfUnit`. Most visible structural lie in the scene. `u6l_strapgap.png`
3. **Frame/cover textures blank out mid-scroll** — LOD radius of 1 is too tight for units still on screen. Large black rectangles during every transition. `trans_700.png`
4. **Quote cards** — blank, oversized, merged into one cardboard trifold. Concept doesn't land at any size or theme. `u6d_cards.png`
5. **Clock face overlay misregistered** — oversized, off-center, double tick marks; in light theme the whole clock reads as a cartoon animal face. `u6l_clock.png`
6. **Mug contains scissors and kitchen utensils** — plus a persistent atlas-bleed rectangle on the body. `u5l_mug.png`
7. **Book pile has 0.025 sky gaps between books** — three floating slabs, in two separate units, worst on mobile and in light. `u4l_bookpile.png`
8. **Binder rings on the outer pages face** — read as three routed crescents; blank spine label compounds it. `u6d_binder.png`
9. **Unit 4's frame row overflows the mobile viewport** — outer frames cut by both screen edges. `u4_mob_dark.png`
10. **Open book collapses in dark theme** — a beige lump with a hot red sliver; the same model reads correctly in light, so this is fixable with lighting/tint. `u5d_openbook.png`

Just outside: placard text double-exposure during travel, trophy with no metal specular, plant leaves rendering dead-khaki in dark with an empty soil-less pot, and unit 5's badly unbalanced shelf occupancy.