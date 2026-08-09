I have everything I need. Writing up the audit.

All crops are in `/private/tmp/claude-501/-Users-chappyasel-Desktop-Repos-PersonalWebsite/bb560b5f-5058-4e3d-912c-7b0485d980e1/scratchpad/audit-a/` (filenames below are relative to that directory).

## Systemic findings (affect all four units)

**There is no shadow pass at all.** `SceneEnvironment.tsx:450` confirms it, and every `castShadow` flag in `primitives.tsx`/`objects.tsx` is dead code. Grounding is entirely hand-placed `ContactPool`/`GroundPool` quads, and the coverage has holes — I contrast-boosted the base of each prop to check rather than eyeball it. The weight plates, framed stills and book rows do have pools; **the desk lamp has none in either unit 0 or unit 3** (`b-u0-lampbase.png`, `b-u3-lampbase.png` — the shelf gradient runs uninterrupted under the tripod). `GroundPool` is also hardcoded to `x: -0.55` for every unit regardless of where the legs actually are, which is why the floor blob sits left of the feet instead of under them (`u1-light-feet.png`).

**The two themes fail in opposite directions.** Dark collapses every book's albedo into one amber: the three-book piles are rust/olive/terracotta in light and three identical browns in dark (`u1-light-pile.png` vs `u1-dark-pile.png` — same object). Light collapses everything into one ochre: the desk lamp, the shelf plank, and most spines are the same hue and value, so the lamp reads as carved from the shelf it stands on.

**Warm-palette conflict from photographic content.** The About portrait, unit 3's frame 1, and the placard hero are all the same teal/green stage backdrop, and unit 3's frame 2 adds magenta. In dark theme those are the brightest, most saturated things on screen, fighting a world that's otherwise warm wood and navy.

**Shelf joinery is inconsistent unit-to-unit.** The upper plank overhangs the leg to the left with nothing under it; the lower plank stops dead at the leg with a raw end-cap. Both read accidental (`u1-light-plankend.png`).

## Unit 0 — About

**Framed portrait** — Frame is genuinely good in dark (dark outer rail, warm gold mat, slight rotation). In light the outer rail drops to nearly the mat's value and the frame dissolves into the wall — it reads as an unframed photo on a cream card, with visibly uneven mat borders. The photo itself is soft/upscaled, and the crop leads with a blurry disembodied hand and a teal screen rather than the face. *notable* — `u0-dark-portrait.png`, `u0-light-portrait.png`

**Calling-card stack** — Does not read as cards. It's a shallow stack of thin slabs in the exact wood tone of the shelf under it, with a wedge of one slab jutting out at the left; no crisp white edge, no mark, no stack thickness. At 1x it reads as offcut lumber. *blocker* — `u0-dark-cards.png`, `u0-light-cards.png`

**Globe** — The sphere is flat-shaded per-facet with a different tone on each quad, producing a Rubik's-cube checkerboard with no land/ocean read at all. It's the most "unfinished asset" prop in the unit; the meridian ring and base are actually nice. Also ~30% occluded by the placard. *blocker* — `u0-light-globe.png`, `u0-dark-globe.png`

**Desk lamp + glow** — The shade is lit from outside, not within: its inner rim at the bottom opening is *darker* than its outer surface, so the lamp reads "off" even while casting a glow pool. In light theme it has no emissive at all and is the same ochre as the shelf. The tripod legs are so thin they alias into dashed, broken lines, and there's no contact pool. *blocker* — `u0-dark-lamp.png`, `u0-light-lamp.png`, `b-u0-lampbase.png`

**Book pile** — The best-crafted prop in the unit: clean rounded bevels, good cover/page-block separation, handsome terracotta-olive-rust in light. Two flaws: background is visible through a gap between stacked books (they don't rest on each other), and dark theme flattens all three to one brown. *notable* — `u0-light-bookpile.png`, `u0-dark-bookpile.png`

**Mug** — Works. Warm terracotta, real handle, pencils and scissors give it life, and it's on-palette. Body is a visibly ~10-sided prism rather than a cylinder, and the flat tan slab among the pencils reads as an ambiguous popsicle stick. *nit* — `u0-light-mug.png`

**Strap leg / plinth foot** — Nice bevel on the post, but the plinth is barely wider than the post so it reads as a rubber cap rather than a foot, and the post edge has hard stair-step aliasing full height. *nit* — `u0-light-leg.png`

**Composition** — Every prop sits in x 440-990; the entire left third of the scene is empty, and the lower shelf's left half is empty. In light that's a large white void. *notable* — `u0-light.png`

## Unit 1 — Books

**Spines (both rows)** — Every spine is completely blank: no title, no author, no publisher band. On the Books unit, ~22 featureless colored slabs is the single strongest "unfinished" signal in my four units. The few stray light pixels present read as texture noise, not typography. *blocker* — `u1-dark-rowtop-L.png`, `u1-light-rowtop-L.png`

**Spine color** — Dark theme narrows every spine to one muddy brown-olive band with almost no value separation between neighbors. Light theme keeps more variety but introduces a slate-blue spine that's the only cool object in a fully warm scene. *notable* — same crops

**Photo covers** — The good ones (Behave, the octopus) are crisp and give the unit its best color pop. But source resolution is wildly inconsistent: *The War of Art* is a compressed brown-gray mush whose title is illegible and reads as static at 1x. The cover books are also flat planes with no visible thickness while their spine neighbors are beveled 3D. *notable* — `u1-dark-cover-static.png`

**Book pile** — Same verdict as unit 0's, and here the gap between stacked books is visible across the full width, not just at one corner — the pile is three books levitating apart. *notable* — `u1-light-pile.png`

**Golden Gate backdrop** — This works and shouldn't be churned: silhouetted tower, layered fog bands, warm window lights in the city blocks. Only flaw is hard stair-step aliasing on every diagonal of the tower. *nit* — `u1-dark-bridge.png`

**Feet + ground pool** — The floor shadow is one wide ellipse offset left of both feet rather than two shadows under two feet, so the feet visibly float above a smudge. In dark it's invisible entirely and the legs terminate into void. *notable* — `u1-light-feet.png`, `u1-dark-feet.png`

**Placard occlusion** — *The 12 Levers*, a featured cover, is half-hidden behind the placard. *nit* — `u1-light.png`

## Unit 2 — Training

**Weight plates** — The worst props in my scope. They are not leaning — all three stand perfectly vertical, dead-frontal, evenly spaced in descending size, which reads as clip-art rather than objects on a shelf. Materially they're flat matte brown with a soft dark dimple where the bore should be; because you can't see the wall through the hole, they read as chocolate donuts, not iron or rubber. No hub, no collar, no grip cutouts, no weight stamp. *blocker* — `u2-light-plate1.png`, `u2-dark-plates.png`

**Basketball** — Good color and correct seam layout, but severely faceted — the flat-shaded quads are readable across the whole sphere, and it sits inches from a golf ball that's perfectly smooth-shaded, so the inconsistency is impossible to miss. *notable* — `u2-light-bball.png`

**Dumbbell** — Handle is wood-tan, the same colour as the shelf, so it reads as a toy; the bar also protrudes far past both plates, making it a mini-barbell. Undersized relative to the basketball beside it (they're the same length on screen; a dumbbell should be ~1.5× a ball's diameter). *notable* — `u2-light-dumbbell.png`

**Golf club head** — The face carries a diagonal cross-hatch tile that reads as woven wicker or a waffle iron, not iron grooves (which are horizontal and parallel). Combined with a wood-brown clubhead where chrome belongs, it's the clearest "generic asset, wrong texture" in the unit. *blocker* — `u2-light-clubhead.png`

**Golf club shaft** — The shaft runs straight into the underside of the upper plank and a nub of it pokes through the top surface — it reads as clipped through the shelf rather than leaning against anything. Blunt two-tone grip/shaft break with no ferrule, and no taper. *notable* — `u2-dark-clubtop.png`

**Golf ball** — Well grounded (the best contact in the unit) and nicely scaled against the basketball, but perfectly smooth with no dimples, so it reads as a pearl. *nit* — `u2-light-clubhead.png`

**Book pile** — Light theme is the best-looking pile of the three, with visible spine end-caps as a nice detail. Dark flattens it, and the inter-book gap is at its most obvious here. Half-occluded by the placard. *notable* — `u2-light-pile.png`, `u2-dark-pile.png`

**Composition** — The emptiest unit: upper shelf left half bare, lower shelf left 60% bare. In light it's three brown donuts and a ball floating in white. *notable* — `u2-light.png`

## Unit 3 — Talks

**Framed stills, as a group** — Three frames, identical vertical alignment, zero rotation, even spacing, all perfectly frontal. It reads as a row of thumbnails pasted onto a shelf rather than objects someone placed. *notable* — `u3-dark-framerow.png`

**Framed stills, content** — All three are luminous, saturated screens in a dark warm room, so they read as backlit monitors rather than framed prints, and they inject teal, green and magenta into an all-warm world. They also duplicate the placard's cards one-for-one, immediately beside them, so the props add nothing the panel doesn't already show. *notable* — `u3-dark-framerow.png`, `u3-dark-frame1.png`

**Frame 2 specifically** — A photograph of a projected slide, complete with baked-in black letterbox bars and burned-in captions, at a resolution where every axis label and the title are illegible smears. It's a document, not a talk still: no stage, no person at readable scale, and it's the brightest object in the dark scene pulling the eye to the least interesting content. *blocker* — `u3-light-frame2.png`

**Frame contact** — The one place grounding works: a real contact shadow under each frame seats them on the plank. Keep this. *works* — `u3-light-framebase.png`

**Desk lamp** — Same model, same problems as unit 0, but worse here because it's the only object on an otherwise bare lower shelf, so all its flaws are on display: unlit shade, ochre-on-ochre in light, dashed aliasing legs, no contact pool. *blocker* — `u3-light-lamp.png`, `u3-dark-lamp.png`, `b-u3-lampbase.png`

**Composition** — The lower shelf spans x 440-990 and holds one small lamp. Largest single dead zone in my four units. *notable* — `u3-light.png`

**Tower aviation light** — The red spire light is a lovely touch in units 1 and 2, but in unit 3 it lands directly above the middle frame where it reads as a stray red pixel. *nit* — `u3-dark.png`

## Ranked top 10 across units 0-3

1. **Weight plates read as chocolate donuts, and aren't leaning** (u2) — flat brown, bore isn't a see-through hole, three vertical discs in descending size. Worst single prop plus worst composition. `u2-light-plate1.png`
2. **Every book spine is blank** (u1) — ~22 featureless slabs on the unit whose entire subject is books. `u1-light-rowtop-L.png`
3. **The desk lamp never looks on** (u0, u3) — shade lit from outside with a *darker* inner rim, no emissive at all in light theme, and no contact pool under the tripod. `u0-dark-lamp.png`, `b-u3-lampbase.png`
4. **Globe sphere is a flat-shaded checkerboard** (u0) — no land/ocean read, reads as a disco ball. `u0-light-globe.png`
5. **Golf club face is woven wicker** (u2) — diagonal cross-hatch tile where horizontal grooves belong, on a wood-brown head. `u2-light-clubhead.png`
6. **Dark theme collapses all book albedo to one amber** (u0, u1, u2) — every three-book pile loses its rust/olive/terracotta separation and becomes stacked lumber. `u1-dark-pile.png` vs `u1-light-pile.png`
7. **Calling-card stack reads as offcut lumber** (u0) — shelf-toned, no card edge, no mark, one slab jutting out. `u0-light-cards.png`
8. **Talks frame 2 is an illegible photo of a slide** (u3) — letterbox bars, burned-in captions, unreadable chart, and it's the brightest thing on screen. `u3-light-frame2.png`
9. **Ground pool is detached from the feet** (all units) — hardcoded `x: -0.55` offset puts one wide ellipse left of both legs; invisible entirely in dark. `u1-light-feet.png`
10. **Background shows through gaps between stacked books** (u0, u1, u2) — the piles levitate apart instead of resting. `u2-light-pile.png`

**What works and should not be churned:** the book piles' bevel-and-page-block craft in light theme, the mug, the Golden Gate backdrop with its fog bands and warm window lights, the Behave and octopus covers, the portrait frame in dark theme, the tower aviation light in units 1-2, and the frame-base contact shadows in unit 3 — that last one is the model the other props' grounding should copy.