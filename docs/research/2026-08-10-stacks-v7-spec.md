# The Stacks v7 — owner feedback tracker (2026-08-10)

Every item from the owner's round-3 review, verbatim, with an ID. This file is the
contract: **nothing here ships as "done" without evidence**, and nothing here gets
silently dropped. Status values: `TODO` → `WIP` → `DONE (evidence)` → `DEFERRED (reason,
owner told)`.

Prior rounds: `2026-08-09-stacks-v4-element-audit.md`, v6 commits `5303d04…1ed132f`.

---

## A. Mobile sheet & mobile chrome

| ID | Verbatim | Status |
|----|----------|--------|
| A1 | "the bottom sheet has a drag [Img 35] but doesn't seem to work" | TODO |
| A2 | "we don't need that additional chevron either" | TODO |
| A3 | "it also has redundant titles in places [Img 36]" — nav says *Training*, sheet says *Weightlifting* | TODO |
| A4 | "it shoujld have a blurred background like other backgrounds, not just plain black" | TODO |
| A5 | "there needs to be a nice animation when chaging between sections" | TODO |
| A6 | "[Img 37] top nav should be larger / easier to see" (mobile dot rail) | TODO |
| A7 | "in movile when partially opened [Img 51] the scene needs to be moved up so it's still centered and not too low" | DONE — camera side. `panelCoverageRef` in store.ts + a frustum offset in CameraRig (`setViewOffset`), so the shelf recentres into the visible strip with the exact projection rather than the old aim-down hack. Handed off to the sheet to publish the coverage fraction during drags. |
| A8 | "the mobile slide up thing should have some left and right margin/padding so you can see behind and have rounded top corners. it sohold also have a max width like 700px" | TODO |

## B. Desktop chrome

| ID | Verbatim | Status |
|----|----------|--------|
| B1 | "[Img 49] make the side desktop nav a litlte more cool in the animations (but still subtle) and like 20% larger" | TODO |
| B2 | "[Img 50] in desktop move the dark/light toggle to bottom left so it doesn't intersect with the content" | TODO |
| B3 | "the max width for the side cards in desktop should be wider — it should be aprtially adaptive to viewport witdth" | TODO |
| B4 | "make the size/scale of the content more smoothly scale instead of having two stop points" | TODO |
| B5 | "Why do the nav titles not match the actual sections? Eg. 'Training' -> 'weightlfting' and 'Books' -> 'Book Notes'" | TODO |
| B6 | "make sure each one also has a phsophor icon. if you can show that in mobile too order or under the nav pills that's great" | TODO |

## C. Placard content

| ID | Verbatim | Status |
|----|----------|--------|
| C1 | "[Img 52] weightlifitng might have to be brought to 4 rows instead of 2 cuz it's too compact rn" (heatmap) | TODO |
| C2 | "Clicking anywhere on the book notes section should take you to the books.chappyasel site" | TODO |
| C3 | "'Book Notes' should be outside the card like all the other sections do" | TODO |
| C4 | "add the nice animating books carousels like we had in the old version and remove 'New reading Behave' and tap a cover instructions? Just like the old style" | TODO |
| C5 | "[Img 53] this is basically the same photo 3 times. please fix" (Talks shelf frames) | TODO |
| C6 | "[Img 54] for this seciton just make it 3 vertical cards — the two on bottom are too narrow" (Talks placard) | TODO |
| C7 | "also get rid of the 'elsewhere…' bottom text" | TODO |

## D. Skyline & sky

| ID | Verbatim | Status |
|----|----------|--------|
| D1 | "[Img 38] is this supposed to be transamerica? Why are there two lines next to it? I don't think that's right" | TODO |
| D2 | "why is it (and salesforce for that matter) missing window lights" | TODO |
| D3 | "[Img 39] this top salesforce thing needs to be cut off at the top bit. see [Img 40]" — real crown is a flat-topped tapered lit-glass box | TODO |
| D4 | "the GG bridge fireworks should be behind the brige and hill, not in front of it. Also a little more complex pls" | TODO |
| D5 | "can you make the night satelite a little more detailed? And add some equivalent flapping bird for day?" | TODO |

## E. Camera / seat

| ID | Verbatim | Status |
|----|----------|--------|
| E1 | "clicking on the seat should move the camera so lit looks like you walk over to sit down, not just turn aorund" | DONE — three-pose blend (travel → look at the chair while crossing → turn and sit) on a curved path with a gait bob. Measured: 5.42 units travelled, 90% of the move done at 356ms, 90% of the 180° turn not until 640ms, path clears the chair hull on every frame. |

## F. Interactions

| ID | Verbatim | Status |
|----|----------|--------|
| F1 | "clikcing on my face should take you to my linkedin" | TODO |
| F2 | "clicking on the apple logo should make it shimmer. also needs a hover" | TODO |
| F3 | "why can i drag the pencil holder but not the apple, ladder, weights, golf + basketball, etc.?" | TODO |
| F4 | "hovering + clicking the tropy doesn't seem to do anything. please fix" | TODO |
| F5 | "make clicking the clock tower do something different from clickign the clock face" | TODO |
| F6 | "[Img 47] these books still all hover together. they should be independent and ideally better models altogether" | TODO |
| F7 | "ideally most or all elemnts should tilt a little when hovered beyond their normal move" | TODO |
| F8 | "all the photos need to be clickable to link to their Instagram/X/LinkedIn post" | TODO |

## G. Lighting

| ID | Verbatim | Status |
|----|----------|--------|
| G1 | "[Img 41] this light ad how the lighting comes out is still totally off. can you make it more like this one [Img 42] which is really well done" — desk/task lamp should read like the floor lamp | TODO |
| G2 | "[Img 48] the light source coming out of this lamp seems to flicker on movement. please fix (by moving the light source down a little?)" — table lamp | TODO |

## H. Props: scale, spacing, intersections

| ID | Verbatim | Status |
|----|----------|--------|
| H1 | "the ladder and lamp still look significantly too small. same with the chair nad clock tower. basically all the onthe ground stuff looks small" | TODO |
| H2 | "there's still a lot of bare space on basically every shelf except hte books and weightlifting one. can you make sure the elements are rpoperly spaced out?" | TODO |
| H3 | "can you go from 5 books to 8 books featured?" — REVISED mid-round: "I added a new 'Featured?' field to books for my 8 featured books. Can you pull that in and highlight those on the bookshelf?" So the selection is HIS and arrives as data; no picking 8 by any local rule. Split: ingestion (Notion property through to the homepage payload) + shelf treatment (8 slots, data-driven count, a highlight that reads at the grazing angle in both themes). | TODO |
| H4 | "[Img 43] this weiht intersects the photo – bad" | TODO |
| H5 | "[Img 44] wtf is this? Replace it with something better" | TODO |
| H6 | "[Img 45] the mac and books are intersecting. I also think you can improve the finder logo" | TODO |
| H7 | "[Img 46] the pen needs to move up with these papers" | TODO |

---

## Status at the end of the agent phase

Tree green: `tsc` clean, page mounts (`data-world=ready`), `stacks-floaters.mjs`
reports 1 flagged (the known false positive) and 62 seated, models payload passes.

**Reported and verified by their agent:** A6 B1(partial) B2 B5 B6 · G1(partial)
G2(partial, handed off) F6(partial, handed off) · the Featured? ingestion.
**Landed on disk but the agent died before reporting:** all 14 of the placard and
mobile-sheet items, and the whole H group plus C5/F2/F4/F5. Present in the diff and
green, but NOT independently confirmed item by item — treat as unverified.
**Verified by me:** E1, A7, the seat pose, the model payload.

Two agents were lost to `API Error: ECONNRESET` mid-task. Both had written their work
to disk first, which matches what happened three times in v6 — check mtimes against
the death timestamp rather than assuming either way.

**Four orphaned models were being downloaded and preloaded while rendering nothing**
— armchair (dead since v5, when the About chair was swapped and nothing removed it),
ct-books, ladder, eames-chair: 44 KB per visit. Deleting a placement does not delete
a prop; the manifest entry and the built `.glb` both have to go, because the pipeline
writes `public/models` and never prunes it.

**A blocking parse error hid inside a code comment.** A backtick in a comment inside
a styled-jsx template literal terminated the string. `tsc` passed; only Turbopack
caught it. The page failed to mount for a stretch and four agents read it as a flaky
dev server. When a screenshot harness starts failing on `waiting for locator('canvas')`,
check the build before debugging the harness.

## Owner picks, added mid-round (browsed on poly.pizza by him)

Ladder DELETED outright ("let's just get rid of the ladder"), manifest entry
removed. Four props added and built:

| Prop | Source | Licence | Built | Destination |
|---|---|---|---|---|
| couch | Quaternius | CC0 | 6.9 KB | About, REPLACES eames-chair as the seat |
| microphone | Poly by Google | CC-BY | 23.7 KB | Talks |
| soda-can | jeremy | CC-BY | 7.6 KB | several units, tinted per instance |
| protein-powder | Zsky | CC-BY | 6.6 KB | Training |

Models total 401.2 KB against a soft ~420 KB ceiling (lazy-loaded, outside the
180 KB initial-route budget). **"jeremy" is a new CC-BY name** and must reach the
About placard credits line.

**New pipeline flag `texMax`.** The microphone is 184 triangles carrying a
2048×2048 PNG holding 189 unique colours, all grey — 633 KB of shading map for a
prop that renders about 40 pixels tall, and on its own 1.7× the entire models
budget. `texMax: 128` runs a `gltf-transform resize` between center and optimize
and brings the whole prop to 23.7 KB. Worth reaching for again: several
Poly-by-Google-era assets are textured this way.

**Swapping the chair moves the seat.** `SEAT_POSE` in `scene/seated.ts` is a
hard-coded eye and target measured against the eames hull. It must be re-measured
against the couch once placed, or sitting down puts the camera inside upholstery.

## Discovered while working, not in the feedback

**Every damped animation in the scene runs at double speed on a 120 Hz display.**
Found while retiming the walk for E1. The rig eases with per-FRAME constants
(`x += (target - x) * 0.05`), so the time constant is a function of the refresh
rate, not of time. Measured in the harness: 358 frames in 3000 ms, i.e. 119 fps,
which put the entire sit-down transition at roughly 250 ms when it had been tuned
to about 900 ms at 60 Hz. Anything tuned by eye on a 60 Hz screen is running twice
as fast on a ProMotion MacBook, and vice versa.

E1's blend is now rate-based (`1 - exp(-k·dt)`, clamped at 50 ms so a backgrounded
tab does not snap). The rest of the rig is untouched: `lean`, `baseY`, `look`,
`framing`, and the damping inside individual props all still use per-frame
constants. Converting them is mechanical but it will change the feel of things
that were tuned by eye at whatever refresh rate they were tuned at, so it is worth
doing deliberately rather than as a side effect of this round. **Owner's call.**

**Last round's collision fix was incomplete, and some props are probably still
clipping today.** Found while scoping F3. `physics.ts:worldFor()` keys a shelf's
physics world on `handle.group.parent` and only adopts handles whose
`group.parent === parent`. Unit files routinely wrap several props in a layout
`<group>` for positioning (Training's wrapper holds the dumbbell, basketball,
barbell and two frames). Every prop inside such a wrapper therefore builds its OWN
world with no neighbours in it, and `standsOn` — derived from
`parent.position.y` — reads the wrong plank.

This is the same root cause as the v6 finding that `addNeighbours()` walked only
direct children, which was fixed in one function while this one was missed. It is
the mechanism behind the owner's round-2 complaint, verbatim: "make sure it
collides with other elements. currently it only does some and clips others."
Being fixed properly: resolve the contact plane from the world matrix rather than
a parent's local position, so nesting depth stops mattering.

## Owner questions raised by this round

1. **F8 needs URLs.** "all the photos need to be clickable to link to their
   Instagram/X/LinkedIn post" — the post URLs are not in the repo. The mechanism is
   being built with a typed gap; the list of photos still needing a link will be
   attached here. Guessing a plausible URL is worse than shipping none.
2. **H1 may be a room-scale change.** Shelf props are authored at ~2.00 world
   units/metre and ground furniture at ~0.96. Reconciling them is the right fix for
   "all the on-the-ground stuff looks small", but if it turns out to need a camera
   or world-layout change, that is a look decision, not a bug fix.
3. **Frame-rate independence** — see above.

## Working rules for this round

- **Two scales still unresolved** — shelf props ~2.00 world u/m, furniture ~0.96 u/m.
  H1 is very likely this bug surfacing, not a per-prop tuning miss. Fix the scale, not
  seven call sites.
- **Never claim an item done from a screenshot alone** where a transform can be read
  instead (`window.__stacks.node(name)`). Five v6 measurements were wrong before the
  code was.
- **Hands off** (another session owns them): `CLAUDE.md`, `AGENTS.md`, `.agents/`,
  `scripts/classify-youtube.ts`, `src/app/api/cron/sync-books/route.ts`,
  `src/lib/youtube/sync.ts`.
- Photos are personal content: neutral filenames only under `public/images/stacks/`.
- No native `title=` attributes. No decorative metadata. No em-dash-and-fragment copy.
