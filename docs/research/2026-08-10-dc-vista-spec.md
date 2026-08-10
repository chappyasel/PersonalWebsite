# DC vista — dimensions, sightlines and silhouette spec

Research input for the Tidal Basin rewrite of `src/app/components/stacks/scene/SceneEnvironment.tsx`.
Nothing here was applied to any source file.

Conventions used throughout:

- **rad** = angular size on the sky dome, which is the shader's native unit. `az` is the
  shader's azimuth, `h` is height above the waterline.
- **Screen direction**: the seated camera looks `+z` (`SEAT_POSE.target.z 6.8 > eye.z 0.8`), so its
  local `+x` maps to world `−x`, and `a = atan(dir.z, dir.x)` **increases to screen RIGHT**.
  `DC_MONUMENT 1.355 > DC_JEFFERSON 1.135` therefore puts the Monument to the **right** of the
  Jefferson today. Worth confirming against a screenshot before trusting any azimuth below.
- **Eye height** 2.3 m above the water (seated eye ~1.6 m on a bank ~0.7 m above the waterline).
- Angular figures are `atan((top_elev − eye)/distance)`, i.e. elevation above the true horizon.

---

## 0. The three things that matter most

1. **The current constants describe a viewpoint that does not exist.** The drawn Monument implies the
   viewer is 1 791 m from it; the drawn Jefferson implies 708 m from that. The two monuments are only
   902 m apart on the ground, so the largest possible Monument distance from 708 m out at the
   Jefferson is 1 610 m — and that maximum occurs only when they are in line, i.e. 0° apart, not the
   12.6° currently drawn. §1.
2. **`DC_SHORE` is doing two jobs that must be separated.** It is used as the mirror plane, and the
   mirror plane has to be the waterline (elevation ≈ 0.000). At 0.0065 it is 0.37° above the horizon,
   which is the *rising ground behind the basin*, not the water. §5.
3. **No Tidal Basin bank can hold the Monument and the Jefferson in one frame.** From any point on the
   shore they are 41°–112° apart; the seated frame is ~39° of usable width. Getting them 23° apart
   requires standing ~1.9 km back. Pick one of the two vantages in §4 — the choice is the whole spec.

---

## 1. Audit of the constants currently in the file

| Constant | Now | Implies | Real | Verdict |
|---|---|---|---|---|
| Monument aspect (`monTop` / 2·`hwM`) | 10.00 : 1 | — | 555.4 ft / 55.125 ft = **10.08 : 1** | correct |
| Pyramidion fraction (`1 − 0.90`) | 0.100 | — | 55 / 555.4 = **0.099** | correct |
| Monument taper (top ÷ base half-width) | 0.820 | — | 34 ft 5½ in ÷ 55 ft 1½ in = **0.625** | **too little taper — roughly double the taper coefficient** |
| `monTop` 0.098 rad | — | viewer 1 791 m away | — | fine on its own |
| Jefferson width 0.0710 rad | — | viewer 708 m away | — | contradicts the line above |
| Jefferson aspect (`jefTop` / width) | 0.623 | — | 129 / 165 = **0.782** | **drawn 20 % too squat** |
| Monument↔Jefferson separation 0.220 rad | 12.6° | viewer **4.08 km** from their midpoint | — | **inconsistent with both heights** |
| `DC_SHORE` 0.0065 used as mirror plane | — | water surface 6 m above eye level at 1 km | waterline ≈ 0.000 (−0.002 at 950 m) | **split into waterline + bank** |
| Jefferson finial (`fin`, 8 % of its height) | present | — | the Jefferson dome has **no lantern or spire** | **cut it** — a spike is the Capitol's signature, and the code's own comment says the Capitol is the one silhouette this must not resemble |
| `REFLECT_K` 1.5 (reflection drawn 2⁄3 height) | — | — | a flat mirror reflects **1 : 1 in angle**; for a point at height *h*, distance *d*, eye *e*, the object is at `(h−e)/d` and its reflection at `−(h+e)/d`, so reflections are marginally **longer**, never shorter | keep the compression, but justify it as ripple-slope + near-bank occlusion, not geometry |

`canopyTop`'s noise octaves (`az*5.5`, `az*16`, `az*78`) are **well chosen** and should not be touched:
the 78× octave gives ~0.0128 rad cells, and a 30 ft crown at 850 m subtends 0.0108 rad. One cell ≈ one
crown. Only the amplitude needs work (§6).

---

## 2. Real dimensions — verified

Height is structure height above its own base unless noted. Confidence: **H** = primary/official
source, **M** = corroborated secondary, **L** = single source or inference.

| Element | Height | Footprint / width | Notes | Conf |
|---|---|---|---|---|
| Washington Monument | **555 ft 5⅛ in** (169.29 m) — NPS official; NOAA's 2015 architectural remeasure is 554 ft 7¹¹⁄₃₂ in | shaft **55 ft 1½ in** sq at base, **34 ft 5½ in** sq at the 500 ft level | pyramidion **55 ft 0 in**; marble tone changes at **150 ft (27 %)** where construction resumed; **8 red aircraft-warning lights**, two per face, on the pyramidion | H |
| US Capitol | **288 ft** base of East Front to top of the Statue of Freedom | **751 ft 4 in** long × **350 ft** widest; 175 170 ft² footprint | dome **96 ft** diameter; Statue of Freedom **19 ft 6 in** on an **18½ ft** pedestal | H |
| Old Post Office clock tower | **315 ft** | tower ~100 ft sq at base | third-tallest structure in DC | M |
| Smithsonian Castle | tallest (north) tower **145 ft**; campanile **117 ft**; principal south tower **91 ft** (37 ft sq) | ~450 ft long | nine towers, four occupiable | H |
| Jefferson Memorial | **129 ft** | **165 ft** diameter; portico **102 ft** wide | 26 Ionic columns, **~43 ft** tall × 5 ft 3 in dia. (Wikipedia's "14 feet" is wrong); no lantern | M (129 ft: M; column height: L) |
| Netherlands Carillon | **127 ft** | 36 ft × 25 ft | on the Arlington ridge, ~180 ft above sea level | H |
| Kennedy Center | **100 ft** | **630 ft** long × 300 ft wide | featureless slab | H |
| Lincoln Memorial | **99 ft** | **189.7 × 118.5 ft** | 36 Doric columns **44 ft** tall × 7.5 ft dia.; 12 on each long face, 8 on each short, corners shared | H (attic height not separately published — **unverified**) |
| WWII Memorial | pavilions **43 ft**; state pillars **17 ft** | plaza 337 ft 10 in × 240 ft 2 in, sunk **6 ft below grade** | 56 pillars; pool 246 ft 9 in × 147 ft 8 in | H |
| MLK Memorial | Stone of Hope **30 ft** | 4-acre site; inscription wall 450 ft | Mountain of Despair height not published — **unverified** | M |
| DC height limit | **130 ft** commercial, 90 ft residential, 160 ft on part of Pennsylvania Ave N | — | this is the skyline, and it is the point | H |

**Ground elevations** (these matter for the Capitol and are all **approximate / low confidence**):
Capitol Hill ≈ **88–89 ft**; National Mall ≈ **16 ft**; Washington Monument site ≈ **30 ft**; Tidal
Basin water ≈ 0 ft (tidal, ~3 ft range); Arlington ridge ≈ 180–210 ft.

---

## 3. Height as a fraction of the Washington Monument

This is the column a shader author needs. Two versions, because Capitol Hill is real.

| Element | Structure only | Incl. ground elevation (top above sea level ÷ 585 ft) |
|---|---|---|
| **Washington Monument** | **1.000** | **1.000** |
| Old Post Office tower | 0.567 | 0.590 |
| US Capitol | 0.519 | **0.643** |
| Smithsonian Castle, north tower | 0.261 | 0.282 |
| DC height limit (130 ft) | 0.234 | 0.248 |
| Jefferson Memorial | 0.232 | 0.238 |
| Netherlands Carillon | 0.229 | 0.525 (it stands on the Arlington ridge) |
| Kennedy Center | 0.180 | 0.197 |
| Lincoln Memorial | 0.178 | 0.212 |
| WWII Memorial pavilions | 0.077 | 0.085 |
| Cherry tree (30 ft) | 0.054 | 0.058 |
| MLK Stone of Hope | 0.054 | 0.058 |
| WWII state pillars | 0.031 | 0.037 |

The headline the owner is pointing at: **the Capitol is barely over half the Monument's height even
with Capitol Hill under it, and every memorial on the Mall is under a quarter.** Nothing on the Mall
comes within 40 % of 555 ft except the Old Post Office tower, which nobody thinks of as a monument.

---

## 4. Vantage and sightlines

### 4.1 Why the obvious vantage does not work

From the Tidal Basin's **east bank looking west/north-west** (38.8855, −77.0360) you see, left to
right: WWII Memorial (318°), Lincoln (289°, 0.165× the Monument), Netherlands Carillon (276°), MLK
(276°), FDR (251°). The Washington Monument is at **008°**, over your right shoulder, and the
Jefferson is at **186°**, directly behind you. The strongest cast that vantage can field is a 99 ft
memorial 1.2 km away and a 30 ft rock. It should be rejected.

Physical constraint, stated once: the Monument and the Jefferson are **902 m** apart, so

| Wanted separation | Minimum distance from their midpoint |
|---|---|
| 12.6° (as drawn today) | 4.08 km |
| 20° | 2.56 km |
| 23° | 2.22 km |
| 30° | 1.68 km |
| 40° | 1.24 km |
| 70° | 0.64 km |

The Tidal Basin is ~1 km across. Standing on it, you get 41°–112°.

### 4.2 Recommended — **V2 "Columbia Island"**

**Mount Vernon Trail on Columbia Island / Lady Bird Johnson Park, at the Navy–Merchant Marine
Memorial — 38.8762, −77.0496 — looking ENE across the Potomac.**

Recommended because it is the smallest honest change: the Monument's currently drawn height (0.098
rad) already implies a 1 791 m vantage, and this one is 1 925 m. It keeps the Jefferson, adds the
Capitol, and everything lands inside the usable frame. Cost: the water in front of you is the Potomac,
not the Tidal Basin — you are looking *at* the Tidal Basin's outlet from across the river.

All offsets are **from the Washington Monument**, which is deliberate: it is viewport-independent and
survives any retune of `DC_AZ`. Positive = screen right, under the convention in the header.

| Element | Bearing | Distance | Δaz from Monument | Angular width | Top above horizon | ÷ Monument |
|---|---|---|---|---|---|---|
| Netherlands Carillon | 308° | 2 179 m | −1.6113 | 0.0050 | 0.0419 | 0.459 |
| Kennedy Center | 346° | 2 236 m | −0.9460 | 0.0858 | 0.0146 | 0.160 |
| Lincoln Memorial | 358° | 1 455 m | −0.7318 | 0.0397 | 0.0244 | 0.267 |
| MLK Memorial | 023° | 1 198 m | −0.2965 | 0.0204 | 0.0083 | 0.090 |
| WWII Memorial | 028° | 1 667 m | −0.2112 | 0.0618 | 0.0092 | 0.101 |
| FDR Memorial | 033° | 954 m | −0.1242 | 0.2541 | 0.0046 | 0.051 |
| **Washington Monument** | **040°** | **1 925 m** | **0.0000** | **0.0087** | **0.0913** | **1.000** |
| Old Post Office tower | 044° | 2 766 m | +0.0638 | 0.0110 | 0.0372 | 0.407 |
| USDA South Building | 053° | 1 961 m | +0.2260 | 0.1552 | 0.0198 | 0.217 |
| Smithsonian Castle | 056° | 2 474 m | +0.2718 | 0.0554 | 0.0194 | 0.213 |
| L'Enfant / SW federal band | 063° | 2 008 m | +0.3934 | 0.1364 | 0.0209 | 0.229 |
| Jefferson Memorial | 063° | 1 270 m | +0.3994 | 0.0396 | 0.0315 | 0.346 |
| US Capitol (dome) | 067° | 3 831 m | +0.4676 | 0.0076 | 0.0293 | 0.321 |
| US Capitol (full building) | 067° | 3 831 m | +0.4676 | 0.0597 | 0.0293 | 0.321 |

Monument → Capitol spans **0.468 rad (26.8°)**, comfortably inside the ~39° of frame the About panel
leaves. The Lincoln at −0.73 rad falls just outside and should be cut.

Note the Jefferson and the L'Enfant federal band land at nearly the same azimuth (+0.393 vs +0.399).
The Jefferson is 1 270 m out and the band 2 008 m, so the Jefferson stands **in front of** it — the band
should pass behind the dome, hazier, not be interrupted by it.

### 4.3 Alternative — **V1 "Tidal Basin SW bank"**

**The walk between the Inlet Bridge and the FDR Memorial, West Basin Drive SW — 38.8820, −77.0405 —
looking NE across the basin.** This is the actual cherry-blossom postcard and keeps the Tidal Basin
identity, with 900 m of open water pointed straight at the Monument. The cost is the Jefferson: it is
72.6° behind your right shoulder and cannot be in frame.

| Element | Bearing | Distance | Δaz from Monument | Angular width | Top above horizon | ÷ Monument |
|---|---|---|---|---|---|---|
| Netherlands Carillon | 285° | 2 603 m | −1.8016 | 0.0042 | 0.0350 | 0.190 |
| FDR Memorial | 300° | 310 m | −1.5449 | 0.7489 | 0.0142 | 0.077 |
| Lincoln Memorial | 314° | 1 162 m | −1.3003 | 0.0497 | 0.0305 | 0.165 |
| Kennedy Center | 319° | 2 024 m | −1.2183 | 0.0948 | 0.0162 | 0.088 |
| MLK Memorial | 325° | 557 m | −1.1065 | 0.0438 | 0.0178 | 0.096 |
| WWII Memorial | 360° | 827 m | −0.5061 | 0.1244 | 0.0186 | 0.101 |
| **Washington Monument** | **029°** | **943 m** | **0.0000** | **0.0178** | **0.1847** | **1.000** |
| Old Post Office tower | 040° | 1 760 m | +0.1937 | 0.0173 | 0.0584 | 0.316 |
| USDA South Building | 056° | 944 m | +0.4713 | 0.3200 | 0.0411 | 0.223 |
| Smithsonian Castle | 059° | 1 462 m | +0.5323 | 0.0937 | 0.0328 | 0.178 |
| US Capitol (dome) | 073° | 2 867 m | +0.7679 | 0.0102 | 0.0391 | 0.212 |
| L'Enfant / SW federal band | 074° | 1 033 m | +0.7993 | 0.2639 | 0.0405 | 0.219 |
| Jefferson Memorial | 101° | 350 m | +1.2671 | 0.1433 | 0.1138 | 0.616 |

Two consequences of V1 worth deciding on before committing:

- The Monument is drawn at **0.185 rad**, 1.9× its current size and 26 % of the 40° vertical frame.
  From 943 m that is correct and it is spectacular, but it is a big change.
- **The Capitol is not visible.** Its top is at 0.0391 rad and the L'Enfant Plaza / Southwest Federal
  Center blocks directly in front of it top out at ~0.0405 rad. The dome is *behind* the 130 ft
  ceiling, not above it. Drawing it clear would be the exact kind of error the owner would catch.

### 4.4 Reflections

Both vantages: a distant object needs almost no water in front of it to reflect. For the Monument at
943 m with a 2.3 m eye, the mirror point for its apex sits **12.5 m in front of you**; the reflection
then stretches back to the far shore. So the whole reflection is available, and it occupies the same
angular height below the waterline as the building does above it.

| Vantage | Reflects | Does not |
|---|---|---|
| **V2** | Monument (full, hero), Jefferson (full — it stands at the water's edge), Lincoln, Kennedy Center | nothing in frame is set back far enough to lose its reflection |
| **V1** | Monument (full, hero, across 900 m of basin), WWII, the federal band and Castle towers — but at 0.02–0.04 rad those reflections are a smear a few pixels deep and will be lost in the ripple | Jefferson, Lincoln, MLK, FDR (all behind the camera) |

Practical guidance: **draw one hero reflection and attenuate the rest.** Under 0.02 rad, a reflection
is indistinguishable from surface noise; spending gradient on it buys nothing and risks the
"reflection that does not match the thing above it" tell.

---

## 5. What makes each one read in silhouette

At ~200 px wide, one feature each. "Cut" items are things that cost pixels and return nothing.

### Washington Monument — *the taper, then the pyramidion*
- Aspect **10.08 : 1** (height : base width). Draw it, do not eyeball it — at 20 : 1 it is a hairline
  the antialiasing eats; at 6 : 1 it is a chimney.
- Half-width goes **base → 0.625 × base** over the lower 0.901 of the height, linearly. In the current
  parameterisation: `hw = hw0 * (1.0 - 0.375 * clamp(h / monShaft, 0.0, 1.0))`.
- Pyramidion = top **0.099** of the height, a true triangle (apex half-angle 17.4°, slope 3.19 : 1).
- **Free detail, verified**: the marble changes tone at **27 % of the height**. If the mass is hazed
  rather than pure black, a 3–5 % value step at `h = 0.27 * monTop` is real, cheap and unmistakably
  this building. Also **8 red aircraft-warning lights** on the pyramidion — at night, two red pips.
- **Cut**: the entrance, the observation windows, the flagpole ring at the base.

### US Capitol — *drum, dome, lantern, and a building eight times the dome's width*
- The dome is **96 ft** against a **751 ft** building: the dome is **1/8** the building's width. The
  single most common error is a dome that spans a third of the mass.
- Stack, bottom to top: long low block → narrow drum → dome → small lantern (tholos) → statue pip.
  The Statue of Freedom is **6.8 %** of the total height; the lantern under it is smaller still.
- **Cut**: the wings' pediments, the colonnades, the porticoes. Only the roofline matters.
- Only include it at all from V2. From V1 it is behind the SW federal blocks (§4.3).

### Lincoln Memorial — *a flat top with no pediment, and gaps in the bottom half*
- **99 ft** tall against **189.7 ft** wide → **0.52 : 1**, distinctly a wide low box.
- The identifying feature is the **absence of a pediment**: a Greek temple with a flat roofline and a
  tall blank attic above the columns. The attic reads as roughly the top 40 % solid.
- Columns are **44 ft** of the 99 ft (0.44). The east face shows **12** columns across 189.7 ft, so
  centres are ~15.8 ft apart on 7.5 ft shafts — **gaps ≈ 1.1× the column width**. Draw the gaps, not
  the columns, and only across the lower ~45 % of the height.
- **Cut**: the steps, the state names on the attic, the tripods.
- Recommend cutting the whole element from both vantages — see §7.

### Jefferson Memorial — *a saucer as wide as the block under it*
- **129 ft** tall, **165 ft** diameter → **0.78 : 1**, wider than it is high. The current 0.62 is 20 %
  too squat and should be corrected.
- Shallow segmental dome, **no lantern and no spire**. The dome springs from a drum that runs the
  building's full width. That is what separates it from the Capitol, whose dome is narrow on a tall
  drum. **Delete the `fin` term.**
- Colonnade = bottom **0.33** of the height, and again it is the sky between the shafts that reads.
- **Cut**: the portico pediment (at this scale it just thickens the cornice), the steps, the statue.

### Smithsonian Castle — *three spikes at three different heights*
- **145 ft / 117 ft / 91 ft** = 0.26 / 0.21 / 0.16 of the Monument, on a ~450 ft block. The asymmetry
  is the whole identification: a tall pointed north tower, a slimmer campanile, a squat south tower.
- **Cut**: everything else. Three tapered spikes on a low bar is the complete drawing.

### The federal cornice band — *the element that is currently missing and matters most*
- Not a named monument: the USDA South Building, L'Enfant Plaza, the Forrestal Building and the
  Southwest Federal Center. Continuous, **~130 ft (0.234 of the Monument)**, and it runs for 30°+.
- This is the Height of Buildings Act made visible, and it is what makes the picture read as
  Washington rather than as generic-city-with-an-obelisk. Draw it as **one flat band with a slightly
  ragged top**, not as individual boxes. The file's own comment — "in silhouette it is a row of boxes
  and there is no arrangement of boxes that is elegant" — is right about the boxes and wrong about the
  band: the flatness *is* the elegance, and it gives the Monument something to be tall against.

---

## 6. The cherry trees

| Property | Value | Conf |
|---|---|---|
| Dominant cultivar | **Yoshino** (*Prunus × yedoensis*), **~70 %** of the trees | M |
| Second | **Kwanzan**, **~13 %** — the deep-pink one — blooms **~2 weeks later** | M |
| Count | **~3 700–3 800** around the Tidal Basin and West Potomac Park | M |
| Mature height | **20–40 ft**, typically **25–35 ft**; use **30 ft** | M |
| Spread | equal to or greater than height — Yoshino is a broad, flat-topped, wider-than-tall crown | M |
| Height ÷ Monument | **0.054** | — |
| Peak bloom | early April (NPS long-run average ~April 3–4) | L |

**Colour — the thing most likely to go wrong.** At peak Yoshino bloom the mass is **white with a pale
pink flush**, and the Kwanzans (the only saturated pink in the park) have not opened yet. There is no
candy pink in this picture. Yoshino also **blooms before it leafs out**, so the mass is flowers on
bare branches: airy, slightly transmissive at the edges, and **lighter in value than the ground it
stands on** — not a dark mass.

This matters for the current implementation. `canCol` is built for a **backlit** canopy ("the afterglow
is BEHIND the trees"), and that is correct only for a **west-facing** vantage. Both vantages recommended
here face **ENE/NE**, so at dusk the sun is behind the viewer and the canopy is **frontlit**: pale,
warm, and brighter than the sky at the horizon. That inverts the construction. It is also the safer
picture — the "pink fog" failure mode the comment warns about comes from painting pink onto the *sky*;
with a frontlit canopy the pink lives on an *object*, which cannot smear.

**Massing.** These are a ribbon following the seawall, one to three trees deep, not a forest. Keep the
band thin in depth, continuous in azimuth, and scalloped on top at a wavelength equal to one crown
(~0.011 rad at 850 m — the existing 78× noise octave is already right).

**Amplitude.** `canopyTop` currently returns 0.0022 → 0.0150 rad, which at 850 m is 6 ft → 42 ft.
Suggest **0.0030 → 0.0120** (8 ft → 33 ft) with the mean nearer 0.0075 (21 ft). At V2's 1.7 km the
whole band scales down by ~0.5.

**Optional, and cheap**: a near-canopy silhouette across the top of the vista window. Standing on the
bank at V1 you are *under* the trees — a 30 ft crown at 40 m subtends 0.22 rad, taller than the
Monument. A couple of dark, soft-edged lobes intruding from the top edge would be two primitives and
would buy real depth. Only applicable to V1.

---

## 7. What to include, and what to cut

| Element | Verdict | Reason |
|---|---|---|
| Washington Monument | **Include — hero** | Nothing else is within 40 % of its height. It is the composition. |
| Cherry canopy band | **Include** | The Tidal Basin's signature; also hides every plinth. |
| Federal cornice band | **Include — highest-value addition** | The 130 ft ceiling is the DC signature and it is currently absent entirely. §5. |
| Old Post Office tower | **Include** | A second vertical at **0.57** of the Monument, and the only thing in DC that reads as a tower. Two verticals of very different heights is a better composition than one. |
| Smithsonian Castle | **Include** | Three spikes, three heights, ~0.26 → 0.16. Cheap and unmistakable. |
| Jefferson Memorial | **Include at V2 only** | At V1 it is 72.6° behind your right shoulder. |
| US Capitol | **Include at V2 only** | At V1 it is behind the SW federal blocks and would be a fabrication. |
| **Lincoln Memorial** | **Cut** | 0.178 of the Monument, and its identifying feature is the *absence* of a pediment — a negative feature does not read at 200 px. From V2 it is 42° off-axis, outside the frame. |
| **WWII Memorial** | **Cut** | Pavilions are 0.077 — the same angular height as a cherry tree — and the plaza is sunk **6 ft below grade**. It disappears into the canopy band by construction. |
| **MLK Memorial** | **Cut** | 30 ft. It is a rock. At 1.2 km it is 0.0083 rad, below the canopy. |
| **Netherlands Carillon** | **Cut** | It is a plain rectangular slab. The Arlington ridge lifts it to 0.46 of the Monument, which means it would read as a *competing vertical* with no silhouette to justify it — actively harmful. |
| **Kennedy Center** | **Cut** | A 630 ft featureless box, 0.18 tall. It is the "row of boxes" problem in a single element. |
| **FDR Memorial** | **Cut** | 12 ft of low granite walls. Nothing to draw. |

Six elements in, seven out. The cuts are the recommendation as much as the additions: the owner's note
was "more elements", but the answer to a thin skyline is the **federal band** — a continuous horizontal
mass that gives the Monument scale — not five more 0.1× stubs poking out of the tree line.

---

## 8. Light

**Recommended: the last 20 minutes before sunset, not after it.**

Sunset azimuth at 38.89° N in the first week of April (peak bloom) is **≈ 275.5°**. Both recommended
vantages face **040°–058°**, so the sun is **~120° behind the viewer's left shoulder**. Consequences,
all of them favourable:

- Every marble face you can see is **frontlit** — warm white to pink, at maximum contrast against the
  sky, with no floodlights needed.
- The canopy is **frontlit** and reads pale (§6).
- The sky ahead is the **anti-twilight arch**: the Earth's shadow, a dark blue-grey band from the
  horizon to roughly 6° elevation, with the **Belt of Venus**, a rose band, above it from ~6° to ~12°.
  That is a non-monotonic vertical gradient — *dark at the horizon, warmer above* — which is exactly
  the three-band structure `skyBand` already implements. The current bands are the right shape; they
  are being applied to the wrong side of the sky.
- The cost: `duskGlow` is anchored on `DC_AZ`, and at these bearings the actual afterglow is ~120° away,
  outside the `dcWin` window (±0.72 rad). Either move the glow behind the camera and accept a
  glow-free vista carried by the Belt of Venus, or hold the time earlier so the sun is still up.

**What is actually floodlit at night**, if the dark theme goes past sunset:

| Element | Lit? | Reads as |
|---|---|---|
| Washington Monument | Yes — floodlit from the base, full height, warm white | The brightest object in frame; plus 8 red pips on the pyramidion |
| Lincoln Memorial | Yes — the colonnade is lit from within, so the **gaps go bright and the columns dark**, inverting the daytime read | (cut anyway) |
| Jefferson Memorial | Yes — dome and colonnade lit | Second brightest at V2 |
| US Capitol | Yes — dome floodlit, Statue of Freedom lit | A small bright dome cap |
| Smithsonian Castle | Modestly lit | Barely separates |
| Federal office blocks | **Dark**, with scattered window grids | A dark band under a lit sky — free contrast, and the cheapest way to make the Monument read |

That last row is the useful one: at night the 130 ft band goes black while the monuments go white, so
the value separation between hero and backdrop is largest after dark. If the dark theme needs the
vista to work harder, this is where the contrast is.

---

## 9. Haze schedule

The constraint is right — haze toward `skyBase`, never toward a fixed colour. What is missing is that
haze must vary with **distance**, and at these ranges the spread is large. Using `1 − exp(−d/d₀)` with
`d₀ ≈ 10 km` (clear evening):

| Element | V1 distance | Haze | V2 distance | Haze |
|---|---|---|---|---|
| Washington Monument | 943 m | 0.09 | 1 925 m | 0.18 |
| Federal band | 1 033 m | 0.10 | 2 008 m | 0.18 |
| Smithsonian Castle | 1 462 m | 0.14 | 2 474 m | 0.22 |
| Old Post Office tower | 1 760 m | 0.16 | 2 766 m | 0.24 |
| Jefferson Memorial | — | — | 1 270 m | 0.12 |
| US Capitol | — | — | 3 831 m | 0.32 |

The shape that matters: **the Capitol should be roughly twice as hazy as the Monument, and the
Jefferson noticeably less hazy than either.** A single haze constant across the whole vista flattens
the depth that the distance spread is giving you for free. The current `vHaze` varies with *height*
above the bank rather than with distance, which is a different (and also useful) effect — keep it, but
add a per-element distance term.

---

## 10. Constant block for V2 (recommended)

Offsets are from the Monument; anchor the Monument wherever the framing wants it and everything else
follows. `+` = screen right under the convention in the header — **verify that sign against a
screenshot first**, since flipping it mirrors the entire city.

```glsl
// Vantage: Columbia Island / Lady Bird Johnson Park, 38.8762 N 77.0496 W,
// looking ENE. Eye 2.3 m above the water. Every figure below is derived
// from that one position; changing it invalidates all of them together.
#define DC_WATERLINE   0.0000   // the mirror plane. MUST be the horizon.
#define DC_BANK        0.0035   // far ground, rising toward the Monument's knoll
#define DC_MONUMENT    (DC_ANCHOR + 0.0000)
#define DC_OLDPOST     (DC_ANCHOR + 0.0638)
#define DC_USDA        (DC_ANCHOR + 0.2260)
#define DC_CASTLE      (DC_ANCHOR + 0.2718)
#define DC_FEDBAND     (DC_ANCHOR + 0.3934)  // centre; spans roughly ±0.30
#define DC_JEFFERSON   (DC_ANCHOR + 0.3994)
#define DC_CAPITOL     (DC_ANCHOR + 0.4676)

// Heights above the horizon (not above DC_BANK).
// Monument
#define MON_TOP        0.0913
#define MON_BASE       0.0036
#define MON_HW0        0.004365          // half-width at base  (16.80 m / 1925 m)
#define MON_TAPER      0.375             // hw = MON_HW0 * (1.0 - MON_TAPER * t)
#define MON_PYR        0.099             // top fraction that is pyramidion
#define MON_SEAM       0.27              // marble tone change, fraction of height
// Jefferson  (129 ft x 165 ft -> 0.78 aspect; NO finial)
#define JEF_TOP        0.0315
#define JEF_HW         0.0198            // half-width, stylobate
#define JEF_DRUM_TOP   0.0143            // drum/cornice at ~0.45 of height
#define JEF_COL_TOP    0.0105            // colonnade tops at 0.33 of height
// Capitol  (dome is 1/8 the building width)
#define CAP_TOP        0.0293
#define CAP_DOME_HW    0.0038
#define CAP_BLDG_HW    0.0299
#define CAP_STATUE     0.068             // top fraction that is lantern + statue
// Smithsonian Castle  (three towers, three heights)
#define CAS_T1         0.0194            // north tower  145 ft
#define CAS_T2         0.0157            // campanile    117 ft
#define CAS_T3         0.0122            // south tower   91 ft
// Federal cornice band -- 130 ft, flat, ragged top
#define FED_TOP        0.0209
// Cherry canopy, far bank at ~1.7 km
#define CAN_MIN        0.0015
#define CAN_MAX        0.0060
```

---

## 11. Open questions and unverified figures

- **Vantage choice (V1 vs V2) is an owner call**, not a research finding. V2 is the smaller change and
  keeps the Jefferson; V1 keeps the Tidal Basin literally and makes the Monument twice as large.
- **Screen-direction sign.** The derivation in the header says larger `az` = screen right, which makes
  the Monument currently sit right of the Jefferson. Confirm against a screenshot before applying
  any azimuth here.
- **Ground elevations** (Capitol Hill 88 ft, Mall 16 ft, Monument site 30 ft) come from topographic
  aggregators, not survey data. They shift the Capitol's fraction from 0.519 to 0.643, so they are
  load-bearing for that one element and worth a better source if the Capitol goes in.
- **Lincoln Memorial attic height** is not separately published anywhere I could reach; the 40 %
  figure in §5 is inferred from 99 ft total − 44 ft columns − an assumed podium. Low confidence.
- **Jefferson column height** — 43 ft is corroborated by secondary sources; Wikipedia's 14 ft is
  clearly an error. Not confirmed against a primary source.
- **MLK Mountain of Despair** height is not published.
- **Cherry trees on Columbia Island.** V2 assumes the near bank has cherries. The documented planting
  for Lady Bird Johnson Park is willows, dogwoods, tulips and daffodils — **cherries there are
  unverified**. At V2 the cherry mass is on the *far* bank (East/West Potomac Park and the Tidal Basin
  rim, 1.3–1.9 km out), which suits "a band of colour, not individual trees" better anyway, but it
  rules out the near-canopy idea in §6.
- **Peak bloom date** (April 3–4 average) is from secondary reporting, not an NPS table.

---

## Sources

- [Washington Monument — Wikipedia](https://en.wikipedia.org/wiki/Washington_Monument)
- [NOAA — updated Washington Monument height](https://oceanservice.noaa.gov/news/feb15/washington-monument.html)
- [Washington Monument National Register nomination (NPS History)](https://npshistory.com/publications/wamo/nr-washington-monument.pdf)
- [Architect of the Capitol — Capitol Building](https://www.aoc.gov/explore-capitol-campus/buildings-grounds/capitol-building)
- [Architect of the Capitol — Statue of Freedom](https://www.aoc.gov/explore-capitol-campus/art/statue-freedom)
- [United States Capitol dome — Wikipedia](https://en.wikipedia.org/wiki/United_States_Capitol_dome)
- [Lincoln Memorial — Wikipedia](https://en.wikipedia.org/wiki/Lincoln_Memorial)
- [Jefferson Memorial — Wikipedia](https://en.wikipedia.org/wiki/Jefferson_Memorial)
- [Thomas Jefferson Memorial National Register nomination (NPS History)](https://npshistory.com/publications/thje/nr-thomas-jefferson-memorial.pdf)
- [NPS — Thomas Jefferson Memorial features](https://www.nps.gov/thje/learn/historyculture/memorialfeatures.htm)
- [Smithsonian Institution Building — Wikipedia](https://en.wikipedia.org/wiki/Smithsonian_Institution_Building)
- [World War II Memorial — Wikipedia](https://en.wikipedia.org/wiki/World_War_II_Memorial)
- [Martin Luther King Jr. Memorial — Wikipedia](https://en.wikipedia.org/wiki/Martin_Luther_King_Jr._Memorial)
- [Netherlands Carillon — Wikipedia](https://en.wikipedia.org/wiki/Netherlands_Carillon)
- [Kennedy Center — Wikipedia](https://en.wikipedia.org/wiki/John_F._Kennedy_Center_for_the_Performing_Arts)
- [Old Post Office (Washington, D.C.) — Wikipedia](https://en.wikipedia.org/wiki/Old_Post_Office_(Washington,_D.C.))
- [Height of Buildings Act of 1910 — Wikipedia](https://en.wikipedia.org/wiki/Height_of_Buildings_Act_of_1910)
- [Tidal Basin — Wikipedia](https://en.wikipedia.org/wiki/Tidal_Basin)
- [NPS — Cherry Blossom types of trees](https://www.nps.gov/subjects/cherryblossom/types-of-trees.htm)
- [Trust for the National Mall — caring for the Tidal Basin cherry trees](https://nationalmall.org/content/caring-for-the-tidal-basin-cherry-trees)
- [Oregon State — *Prunus* × *yedoensis*](https://landscapeplants.oregonstate.edu/plants/prunus-yedoensis)
- [The Cultural Landscape Foundation — Lady Bird Johnson Park](https://www.tclf.org/landscapes/lady-bird-johnson-park)
- [ASCE — the Washington Monument](https://asce-ncs.org/index.php/committees/38-history-heritage/240-the-washington-monument)

Bearings, distances and angular sizes are computed from published coordinates via great-circle
geometry; the script is in this session's scratchpad and can be regenerated from the coordinate table.
