Hunt complete across poly.pizza (~70 search terms) and the Sketchfab v3 API. Writing up now.

---

# 3D Prop Hunt — Results by Category

## Two findings that change how you should read this

**1. The Sketchfab license IDs in the brief are wrong.** `322a749bcfa841b29dff1e8a1bb74b0b` is **CC-BY**, and `b9ddc40b93e34cdca1fc152f39b9f375` is **CC Attribution-ShareAlike** — a copyleft license you almost certainly don't want touching a personal site. The real CC0 id is `7c23a1ba438d4306920229c12afcb5f9` (slug `cc0`). I re-ran everything against the correct filter. Verified via `https://api.sketchfab.com/v3/licenses`.

**2. Sketchfab CC0 is effectively empty for props.** Every prop query I ran returned zero CC0 results — the CC0 tier there is dominated by museum and biology scans (a "barbell" search returns fish named *barbel*). Treat poly.pizza as the only real CC0 source; Sketchfab is a CC-BY-only tier for your purposes.

**The dominant integration cost is texture, not tris.** Per your notes, CreativeTrio's 134 props share one 128px palette atlas, so any CreativeTrio pick is a drop-in and a recolor is one PNG. Every non-CreativeTrio model below carries its own texture and needs individual palette work. That gap matters more than a few hundred triangles, and I've weighted the ★ picks accordingly.

---

## 1. Snake plant / upright-blade houseplant — RICH in CC0

| Title | Creator | Source | License | Tris | Size | Verdict |
|---|---|---|---|---|---|---|
| ★ Sansevieria Plant | Isa Lousberg | [/m/BDwimVUool](https://poly.pizza/m/BDwimVUool) | CC0 | 1464 | 84KB | Full potted sansevieria — exactly the upright-blade read you wanted. Own texture, needs recolor to warm palette. |
| Small Sansevieria | Isa Lousberg | [/m/4s72AttBtG](https://poly.pizza/m/4s72AttBtG) | CC0 | 276 | 34KB | Desk-scale, superb budget. Best value if the plant sits on a shelf rather than the floor. |
| Houseplant | Quaternius | [/m/IBLX2Jz90O](https://poly.pizza/m/IBLX2Jz90O) | CC0 | 492 | 20KB | Flat-shaded, closest to your existing Quaternius book. Broader leaf than sansevieria. |
| Houseplant | Quaternius | [/m/Kr4kr7OCCQ](https://poly.pizza/m/Kr4kr7OCCQ) | CC0 | 324 | 18KB | Cheapest credible plant in the set. |
| Small Monstera | Isa Lousberg | [/m/5Jmd3e25Sv](https://poly.pizza/m/5Jmd3e25Sv) | CC0 | 940 | 54KB | Split-leaf silhouette; a different read from the weak ficus but still flat-leaf. |

This is the healthiest category of the nine. The Sansevieria is a genuine upgrade over the ficus.

## 2. Barbell / kettlebell / bumper plate — CC0 CONFIRMED DRY

Your past hunt was right, and I can now confirm it across both sources: **zero CC0 results** on Sketchfab, and every poly.pizza gym prop is CC-BY. All of these need an attribution decision.

| Title | Creator | Source | License | Tris | Size | Verdict |
|---|---|---|---|---|---|---|
| ★ Barbell | Zsky | [/m/AX5jGlJZlk](https://poly.pizza/m/AX5jGlJZlk) | CC-BY | 1988 | 132KB | Best loaded-barbell read; over budget but decimates well (it's mostly cylinders). |
| ★ Kettlebell | Poly by Google | [/m/08Gs4e3L1N8](https://poly.pizza/m/08Gs4e3L1N8) | CC-BY | 1104 | 28KB | Great size-to-quality ratio, in budget. |
| Plate | Zsky | [/m/jyj7EfIiB1](https://poly.pizza/m/jyj7EfIiB1) | CC-BY | 136 | 11KB | Bumper-plate proxy, nearly free. |
| Dumbells | Jarlan Perez | [/m/bYJEO8Y-3ms](https://poly.pizza/m/bYJEO8Y-3ms) | CC-BY | 696 | 21KB | A pair rather than a single; good clutter prop. |
| Barbell | J-Toastie | [/m/S3myL1W9d7](https://poly.pizza/m/S3myL1W9d7) | CC-BY | 3774 | 266KB | Heaviest option — only if the others read badly. |
| Little Gym Stuff - Kettlebell | AJVFX | [Sketchfab](https://sketchfab.com/3d-models/none-925d98d9ba764e2186980b0d3da65fa2) | CC-BY | 336f | — | Stylized, closest aesthetic match on Sketchfab. |

**CC0 escape hatch:** CreativeTrio's **Treadmill** ([/m/9hYy4Zmk67](https://poly.pizza/m/9hYy4Zmk67), CC0, 220 tris, 26KB) is an atlas-sharing drop-in. If you want a fitness signal without an attribution decision, that's the only way to get it.

## 3. Bookends + book piles — SPLIT VERDICT

**Bookends: CC0 is dry.** Nothing in either source. The only credible options are CC-BY, and both are the same Poly-by-Google pair (also mirrored onto Sketchfab by IronEqual — same asset, same license, don't double-count).

| Title | Creator | Source | License | Tris | Size | Verdict |
|---|---|---|---|---|---|---|
| ★ Bookend | Poly by Google | [/m/a5NEG3WbHFh](https://poly.pizza/m/a5NEG3WbHFh) | CC-BY | 152 | 9KB | L-steel, almost free. The obvious pick if you accept attribution. |
| Bookend | Poly by Google | [/m/f66xZMw21oF](https://poly.pizza/m/f66xZMw21oF) | CC-BY | 340 | 17KB | Slightly more sculptural sibling. |
| Plastic Bookend | seiippai | [Sketchfab](https://sketchfab.com/3d-models/none-e0246e5b86544735b7ec4b4b1ce309a0) | CC-BY | 2376f | — | Heavier and more realistic; style mismatch. |

**Book piles: CC0 is strong**, and the winner is free of texture work.

| Title | Creator | Source | License | Tris | Size | Verdict |
|---|---|---|---|---|---|---|
| ★ Books | CreativeTrio | [/m/dxt7dETAy9](https://poly.pizza/m/dxt7dETAy9) | CC0 | 360 | 32KB | Shares your existing atlas — zero recolor. Best pick in the whole hunt. |
| Bookshelf | CreativeTrio | [/m/30Iealxb0p](https://poly.pizza/m/30Iealxb0p) | CC0 | 236 | 24KB | Same atlas; pairs with the above for a book-row. |
| Book (×3 variants) | Quaternius | [/m/LC0w7VI75u](https://poly.pizza/m/LC0w7VI75u) · [/m/Qkvcgg5tpj](https://poly.pizza/m/Qkvcgg5tpj) · [/m/h3Wh4fxSQX](https://poly.pizza/m/h3Wh4fxSQX) | CC0 | — | 21/40/60KB | Matches your existing Quaternius open book. Good for varied spines. |
| Book Stack | Danni Bittman | [/m/1WggoIFq8tx](https://poly.pizza/m/1WggoIFq8tx) | CC-BY | 640 | 44KB | Hand-painted look, the most "stylized pile" of the set. |
| Book (Blue/Red/Yellow) | Darwin Yamamoto | [/m/8xQHBQezK-q](https://poly.pizza/m/8xQHBQezK-q) | CC-BY | 124 | 8KB | Three palette-swapped singles at 8KB each. |

## 4. Cup of tea with saucer — CC0, and your first candidate confirmed

The CreativeTrio cup you suspected exists, and it's the best option outright.

| Title | Creator | Source | License | Tris | Size | Verdict |
|---|---|---|---|---|---|---|
| ★ Cup Of Tea | CreativeTrio | [/m/6QBscrL7D3](https://poly.pizza/m/6QBscrL7D3) | CC0 | 436 | 40KB | The one you asked me to find. Atlas-shared, in budget, zero recolor. |
| Teacup | MilkAndBanana | [/m/903CCHbaNQ](https://poly.pizza/m/903CCHbaNQ) | CC0 | 450 | 14KB | Smallest file here; a genuine alternative if you want a second cup shape. |
| Medium Saucer | Isa Lousberg | [/m/2p44qC6b4H](https://poly.pizza/m/2p44qC6b4H) | CC0 | 192 | 30KB | Standalone saucer — pair under either cup above. |
| Cup Tea | Zsky | [/m/7vH8pAQa9m](https://poly.pizza/m/7vH8pAQa9m) | CC-BY | 248 | 18KB | Cheap, fine, but no reason to take attribution here. |
| Green Tea Set (Matcha) | Bruno Oliveira | [/m/cXRIGlSpjW_](https://poly.pizza/m/cXRIGlSpjW_) | CC-BY | 3036 | 104KB | A full set rather than one cup; over budget. |

Skip **High Tea** by Don Carson (9409 tris, 642KB) — far outside budget.

## 5. Tabletop microphone + lectern — MIC GOOD, LECTERN DRY

| Title | Creator | Source | License | Tris | Size | Verdict |
|---|---|---|---|---|---|---|
| ★ Mic | iPoly3D | [/m/yqbacXdPsg](https://poly.pizza/m/yqbacXdPsg) | CC0 | 1344 | 61KB | The only good CC0 mic anywhere. Retro/podcast read, in budget. Overturns your "no CC0 desk mics" dead end. |
| Microphone | Poly by Google | [/m/2cDNCSVfAfv](https://poly.pizza/m/2cDNCSVfAfv) | CC-BY | 68 | 7KB | Absurdly cheap; likely too crude to read at close range. |
| Vintage Microphone | QubikPosh | [Sketchfab](https://sketchfab.com/3d-models/none-1dc52e8fa91e4bcfade4ddced4511b66) | CC-BY | 259f | — | Nice silhouette but PBR metal — wrong material language. |
| Music stand | Poly by Google | [/m/3zlFGH_TJ8h](https://poly.pizza/m/3zlFGH_TJ8h) | CC-BY | 1176 | 58KB | Mic-stand adjacent if you want the vertical element. |

**Lectern is dry in CC0** (both sources). CC-BY only, and thin:

| ★ Pulpit | 4444ESOUSA | [/m/3nHkaEsTGL](https://poly.pizza/m/3nHkaEsTGL) | CC-BY | 68 | 6KB | Six kilobytes. Crude, but at a small scale on a shelf that may be all you need. |
| Speakers Desk/Lectern | Mittelstand-Digital | [Sketchfab](https://sketchfab.com/3d-models/none-911504b4e7d34542a9fbcba197acb87a) | CC-BY | 110f | — | Cleanest lectern silhouette found. |

## 6. Polaroid / frames / corkboard — CORKBOARD WINS, CAMERA IS CC-BY-ONLY

| Title | Creator | Source | License | Tris | Size | Verdict |
|---|---|---|---|---|---|---|
| ★ Wall Corkboard | CreativeTrio | [/m/U8yQZ9l0HZ](https://poly.pizza/m/U8yQZ9l0HZ) | CC0 | 218 | 23KB | Atlas-shared drop-in. Beats the CC-BY corkboard by 20× on triangles. |
| ★ Instant Camera | Nick Slough | [/m/AYBr4bMYvS](https://poly.pizza/m/AYBr4bMYvS) | CC-BY | 494 | 44KB | Best polaroid read; **no CC0 polaroid exists in either source**. |
| Empty Picture Frame | Jarlan Perez | [/m/ae-21UkVxCg](https://poly.pizza/m/ae-21UkVxCg) | CC-BY | 104 | 6KB | Frame at 6KB; put your own image in the texture slot. |
| Polaroids | Jarlan Perez | [/m/6BgcoF0LL6y](https://poly.pizza/m/6BgcoF0LL6y) | CC-BY | 980 | 53KB | Loose scattered photos rather than a camera — good corkboard companion. |
| Mirror | Isa Lousberg | [/m/2WQIUVj5qr](https://poly.pizza/m/2WQIUVj5qr) | CC0 | 294 | 33KB | The only CC0 frame-shaped object; usable as a picture frame. |

Avoid **Cork Board** by Jarlan Perez (4315 tris, 234KB) — the CreativeTrio one is strictly better.

## 7. Blueprint tube / rolled paper / notebook — PARTIAL

**Blueprint tube specifically does not exist** in either license tier on either source. Rolled paper is the stand-in, and it's CC0:

| Title | Creator | Source | License | Tris | Size | Verdict |
|---|---|---|---|---|---|---|
| ★ Scroll | Quaternius | [/m/MWGB9nxMIc](https://poly.pizza/m/MWGB9nxMIc) | CC0 | — | 53KB | Best rolled-paper read. Reads as blueprint/drawing at shelf scale. |
| Parchment | Quaternius | [/m/IrjGNYRB3f](https://poly.pizza/m/IrjGNYRB3f) | CC0 | — | 32KB | Flatter, partially unrolled variant. |
| Paper | Quaternius | [/m/4qDtAbPYnT](https://poly.pizza/m/4qDtAbPYnT) | CC0 | 304 | 22KB | Loose sheets. |
| Notebook | Zsky | [/m/UeJDUbgwAU](https://poly.pizza/m/UeJDUbgwAU) | CC-BY | 136 | 13KB | Cheapest notebook; **CC0 notebooks remain dry**, confirming your earlier finding. |
| Small Stack of Paper | Jarlan Perez | [/m/aiBozYlPe--](https://poly.pizza/m/aiBozYlPe--) | CC-BY | 244 | 13KB | Good desk clutter. |

Spiral notebooks specifically: dry in both tiers. Skip **Green Notebook** by Ryan Donaldson (6060 tris, 403KB).

## 8. Rug — EXISTS, BUT GO PROCEDURAL

Rugs are plentiful and CC0, contrary to the brief's guess:

| Title | Creator | Source | License | Tris | Size | Verdict |
|---|---|---|---|---|---|---|
| ★ Rug | Quaternius | [/m/7H5qKjuxVY](https://poly.pizza/m/7H5qKjuxVY) | CC0 | 108 | 6KB | Rounded-rect, essentially a textured plane. |
| Round Rug | Quaternius | [/m/ZYBzMHnSbM](https://poly.pizza/m/ZYBzMHnSbM) | CC0 | 128 | 6KB | Circular sibling. |
| Doormat | Isa Lousberg | [/m/M2uWCZdX1Y](https://poly.pizza/m/M2uWCZdX1Y) | CC0 | — | 30KB | Smaller footprint. |

**My recommendation is procedural anyway.** At 108 tris and 6KB these are a rounded-rect mesh plus a texture — you gain nothing geometrically by importing one, and you inherit someone else's woven pattern and colors that you'd then have to fight into your warm palette. A generated rounded-rect with your own palette is the same cost and matches by construction. Take the Quaternius rug only if you specifically want its woven texture detail.

## 9. CreativeTrio catalog — study/office/library subset

All CC0, all sharing the single 128px atlas, none currently in use. This is the highest-leverage list here: every one is a drop-in.

**Furniture:** Desk [166 tris, 19KB](https://poly.pizza/m/YJyJam67hJ) · Table [86, 14KB](https://poly.pizza/m/KndwzSWSHR) · Bookshelf [236, 24KB](https://poly.pizza/m/30Iealxb0p) · Armchair [162, 19KB](https://poly.pizza/m/myd1WSucAz) · Stool [610, 50KB](https://poly.pizza/m/VZw6xzQbOb) · Couch [268, 26KB](https://poly.pizza/m/ZAezzWDcmU) · Cabinet [324, 30KB](https://poly.pizza/m/wOiMrnUuhe) · Dresser [430, 38KB](https://poly.pizza/m/Ud8QR8Ku9e) · Bed [726, 62KB](https://poly.pizza/m/rXo5Rkl5LC)

**Light & atmosphere:** Lamp With Shade [786, 62KB](https://poly.pizza/m/1nKtMmYxLT) · Chandelier [1204, 62KB](https://poly.pizza/m/RPLTkXHOOM) · Candlestick [405, 37KB](https://poly.pizza/m/tknOVwxT8B)

**Character props:** Grandfathers Clock [547, 50KB](https://poly.pizza/m/09YKIkFZnA) · Telescope [734, 61KB](https://poly.pizza/m/RjyTCQvA8b) · Wall Corkboard [218, 23KB](https://poly.pizza/m/U8yQZ9l0HZ) · Books [360, 32KB](https://poly.pizza/m/dxt7dETAy9) · Cup Of Tea [436, 40KB](https://poly.pizza/m/6QBscrL7D3) · Flowers [496, 52KB](https://poly.pizza/m/RP8p3h7JHJ) · Closed Umbrella [436, 38KB](https://poly.pizza/m/o0CUgpt8pm) · Ladder [220, 24KB](https://poly.pizza/m/p1RR8Ls9EH) · Safe [222, 24KB](https://poly.pizza/m/N4egHD2Vms)

**Desk tech:** Computer [324, 27KB](https://poly.pizza/m/7KNoiQlSxi) · Monitor [84, 15KB](https://poly.pizza/m/PvSjEbz11k) · Computer Mouse [100, 16KB](https://poly.pizza/m/V2Ebx3pvo4) · Printer [182, 22KB](https://poly.pizza/m/77K2TCL5Lz) · Stapler [162, 19KB](https://poly.pizza/m/mQ9uliJkPK)

**Small clutter:** Trash Bin [238, 25KB](https://poly.pizza/m/AAX1n0Bt0v) · Empty Box [76, 14KB](https://poly.pizza/m/pZBpmjtvw8) · Tissue Box [102, 16KB](https://poly.pizza/m/dS4MQQH5EM) · Toolbox [144, 18KB](https://poly.pizza/m/3ImQcIK0Gp) · Mailbox [242, 25KB](https://poly.pizza/m/2olZ0G8iur) · Treadmill [220, 26KB](https://poly.pizza/m/9hYy4Zmk67)

Two caveats on this list. The catalog skews heavily toward weapons — the first twenty entries alphabetically are guns, ammo, and melee weapons — so the study-relevant subset above is a genuine minority of the 134. And I assembled it by sweeping roughly seventy search terms rather than reading the creator page, because `poly.pizza/u/CreativeTrio` server-renders only 20 of 134 models and has no working pagination (`?page=`, `?p=`, `?offset=` all return the same first 20). A handful of long-tail titles may not have surfaced.

---

## What I'd take

The three unambiguous wins are **CreativeTrio Books**, **Cup Of Tea**, and **Wall Corkboard** — all CC0, all atlas-shared, all in budget, no texture work at all. **Sansevieria Plant** is the best genuine upgrade (it fixes the weak ficus) at the cost of one recolor. **iPoly3D Mic** is the surprise: a CC0 desk microphone, which your previous hunt concluded didn't exist.

The one decision I can't make for you is gym equipment. It is CC-BY across the board, confirmed now against both sources with correct license filters — so it's attribution or nothing, unless the CC0 Treadmill is a good enough stand-in.

I didn't download anything or touch any repo files. Working scripts are in `/private/tmp/claude-501/-Users-chappyasel-Desktop-Repos-PersonalWebsite/bb560b5f-5058-4e3d-912c-7b0485d980e1/scratchpad/` (`pp.sh` for poly.pizza metadata, `search.sh` for catalog scraping, `sf.sh` for the Sketchfab API) if you want to re-run or extend any category.