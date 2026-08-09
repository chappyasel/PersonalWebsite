# Home page redesign — design inspo survey

## Round 1 feedback (2026-08-08) — direction taken

Chappy reacted to the first taste-test flight:

1. **Anchor reference: [pallaviandprayash.com](https://pallaviandprayash.com)** (Prayash Thapa's wedding site, Three.js + custom shaders + react-spring). The vibe: a handcrafted **low-poly 3D diorama** — campfire scene with torii gate, lanterns, a guitar, log benches, low-poly mountains — under a dreamy pink-to-lavender gradient sky with film grain, glowing firefly particles, brush-script + clean sans type floating above. Intimate scale, personal-storytelling objects, single contained scene (not open world).
2. **Live stats: yes** — likes the existing totals (books, lifting); wants to evolve toward *live*.
3. **"Non-linear" means non-linear *scrolling*** — scroll-driven camera paths, horizontal/depth travel, scenes unfolding — NOT pane/popup navigation. (Gwern noted as "pretty cool" but secondary.)
4. **Handmade charm over spectacle** — confirmed leaning.

Working synthesis: handcrafted diorama world + non-linear scroll camera + live personal data instruments, with grain/warm-palette continuity from the current site. Round 2 hunt dispatched for more references in this specific vibe.

Research sweep of distinctive 3D / spatial / non-linear personal sites, gathered 2026-08-08 as input to the home page redesign design-language decision. Companion to the alignment grill in the same session.

**Verification note:** Most references were fetched directly. Two galleries were dead ends: `godly.website` now 301s to `recent.design`, which returns 403 to automated fetches, and the Hacker News mirror for the desktop-GUI thread returned an empty body. Sites marked *(JS-only)* returned nothing but a `<title>` tag to a text fetch, which is itself a finding discussed under anti-patterns.

## Family 1: Full 3D worlds

| Site | Who | Tech | What makes it distinctive |
|---|---|---|---|
| [bruno-simon.com](https://bruno-simon.com) | Bruno Simon, Three.js Journey author | Three.js (WebGPU with WebGL fallback), Rapier physics, Howler.js | You drive a car through a handcrafted world. The 2025 rebuild took Awwwards Site of the Month in January 2026. Spatialized directional audio (birds, crickets, anvil, campfire) shifts with your position. Has Achievements, a racing Circuit, and a Behind the Scenes tab. MIT licensed on GitHub. |
| [samsy.ninja](https://samsy.ninja) *(JS-only)* | Samuel Honigstein, Paris | WebGPU (custom, not Three.js), Vue, GSAP | Neon cyberpunk cityscape with first-person controls at 120+ fps. Rooms rather than pages. Awwwards SOTD plus Developer Award, October 2025; FWA Site of the Year nominee. |
| [henryheffernan.com](https://henryheffernan.com) *(JS-only)* | Henry Heffernan | Three.js, iframe-in-texture | A 3D room containing a CRT running a functional Windows 98. The iframe-rendered-onto-a-mesh trick is the whole idea. Now heavily cloned, including a three.js forum thread of imitators. |
| [jesse-zhou.com](https://jesse-zhou.com) | Jesse Zhou | Three.js + Blender | A hand-modeled Hong Kong ramen shop. Published a detailed case study, which is part of why it landed. |
| [jayransijn.com](https://jayransijn.com) | Jay Ransijn, design engineer | Three.js | Actually playable, with gameplay mechanics, reflections, and company logos as world objects. |
| [sebastien-lempens.com](https://sebastien-lempens.com) | Sébastien Lempens | Three.js, scroll-driven | Scroll-driven tour of Paris with first-person camera, a scooter ride, and a skydiving sequence. Scroll drives a camera path rather than a document. |
| [aimees-papercraft-world.com](https://aimees-papercraft-world.com) | Aimee Weis | react-three-fiber, Blender, Krita | The most defensible of the genre because the art direction is hand-drawn 2D mapped onto 3D geometry. Notebook-paper aesthetic no asset store can produce. |
| [bilal.show](https://bilal.show) | Bilal El Moussaoui | Three.js | Scroll-driven narrative inside a music box. Single contained object rather than an open world, which keeps the scope honest. |
| [jordan-breton.com](https://jordan-breton.com) | Jordan Breton | Three.js | Floating island with grass, waterfalls, butterflies. FWA Site of the Day. |

Also in this genre but more clearly variations on a theme: `thibault-introvigne.com` (controllable spaceman with ten collectibles), `worawork.vercel.app` (Animal Crossing cozy room), `jreyes-mc-portfolio.com` (Minecraft), `ameen-abdullah.dev` (WebGPU sakura), `weisdevice.xyz` (island with a robot, raycasting capped at 30fps).

**Tradeoff to take seriously:** Bruno Simon's site is currently half-broken. The 3D world runs, but the backend is offline, so the Circuit leaderboard cannot save scores and the "Whispers" feature is unavailable. The most-admired 3D personal site on the internet has visible rot in exactly the parts that needed a server. The rendering survives; the dynamic features do not.

## Family 2: Subtle 3D on typographic sites

Best effort-to-payoff ratio of any family, and where techniques from award-winning brand sites transfer cleanly to a personal site.

- **[aristidebenoist.com](https://aristidebenoist.com)** — Independent developer working in hand-written vanilla WebGL rather than Three.js. Shader-driven sliders and transitions over restrained typographic layouts. The reference point for "shaders as material, not as scene."
- **[robbowen.digital](https://robbowen.digital)** — Independent creative developer in South Wales. Typography-forward with letter-spaced treatments, experimental WebGL, and an explicit stated goal of "ambitious yet accessible." He made the SynthWave '84 VS Code theme, so the color sensibility carries.
- **[andersonmancini.dev](https://andersonmancini.dev)** — Three.js specialist whose own site stays restrained relative to his client work.
- **[emilkowal.ski](https://emilkowal.ski)** — Design engineer at Linear, author of Sonner and Vaul. No 3D at all; included as the calibration point for restraint. His whole public argument is that motion should be productive rather than expressive.

Techniques worth lifting from the 2026 award circuit (brand sites, but the methods transfer): **Oryzo** (`oryzo.ai`) uses a single hero object with inertial physics-based easing and Z-depth scroll, the cheapest possible "one 3D thing, done extremely well." **IVRESS** (`brand.ivress.co.jp`) ships WebGPU as primary renderer with WebGL fallback using TSL shaders, viable now that Safari shipped WebGPU. **Hubtown** uses a 3D monolith revealed by cursor position. **Cartier Watches & Wonders** uses six scrollable 3D alcoves on GLSL, GSAP, and Lenis.

The highest-leverage pattern here, repeatedly identified as the best starting point, is one full-viewport GLSL fragment shader behind clean typography. Small bundle, no model pipeline, degrades to a static gradient trivially.

## Family 3: Spatial and non-linear canvases

- **[notes.andymatuschak.org](https://notes.andymatuschak.org)** — The most influential non-linear layout on the web, using no 3D whatsoever. Following a link opens a new pane sliding in beside the current one, building a horizontal stack that records your reading path. When panes overflow the viewport, earlier ones collapse into thin vertical spines showing just the title; clicking a spine pulls it back into focus. He deliberately ships no index: "there's no index or navigational aids: you'll need to follow a link to some starting point." Spawned the Obsidian Sliding Panes plugin (later absorbed into Obsidian core), Quartz's StackedPages plugin, and standing feature requests in Logseq and RemNote.
- **[rauno.me](https://rauno.me)** — Rauno Freiberg, staff design engineer at Vercel, previously on Arc at The Browser Company. An earlier version was built as an operating system with a dock, desktop background, and interface sounds on navigation. Current site is text-forward with `/craft` and `/field-notes`. The genuinely reusable idea: **he keeps every past version live** at `/2022`, `/2023`. Redesigning becomes additive rather than destructive.
- **[brianlovin.com](https://brianlovin.com)** (source: `briOS`) — Built as a macOS/iPadOS application shell with global sidebar and responsive multi-column list-detail layout. Important honest signal: **he later removed the sidebar** and reworked desktop navigation. The person who built the best version of the app-shell metaphor concluded it wasn't carrying its weight.
- **[jzhao.xyz](https://jzhao.xyz)** — Jacky Zhao, Quartz v4. Entry points named as physical objects: "the oak letter desk" for writing, "the hand-crafted workbench" for projects, "the bookshelf on the far wall" for reading. The spatial metaphor lives entirely in copy, costs nothing to render, and is more memorable than most WebGL. 20+ articles and 746+ notes behind it.
- **Infinite canvas** — No personal site found doing this well; every search returned Framer components and Webflow templates, which tells you where the pattern sits. The real reference is the Codrops implementation (January 2026): react-three-fiber, space divided into cubic chunks with only a 3×3×3 neighborhood (27 chunks) live at a time, deterministic per-chunk layout so chunks regenerate identically, 256-entry LRU cache, DPR capped at 1.5 desktop / 1.25 touch, antialiasing off, distance-based fade then cull, inertial drag. Targets 120fps. The tutorial has **no accessibility story at all**, which is the honest state of the pattern.

**Warning on the desktop-OS metaphor:** Searches returned almost nothing but GitHub template repos (OSFOLIO, portfolio.os, several Windows 95 clones, a "bootable OS portfolio" dev.to post, a macOS-style portfolio that Bolt rebuilds as a demo). Fully commoditized. Rauno and Brian Lovin did it before it was a template, and both moved on.

## Family 4: Data as design

Closest family to what the site already has, and where the existing content is a genuine moat.

- **[anandchowdhary.com](https://anandchowdhary.com)** — The direct analogue and most important reference here. The homepage is a live dashboard: current age to seven decimals ("28.6294679 years old") with a birthday countdown, current location and local time, daily step count, monthly kilometers walked, sleep hours from Oura and Apple, caloric intake with macro breakdown, current top artist. All published as a public JSON API under permissive licenses on GitHub. Next.js 15, React, TypeScript, Tailwind, ISR and async components. Archive spans 2007 to 2026. He calls the design "Anchor," after the HTML tag.
- **[feltron.com](http://feltron.com)** — Nicholas Felton's Annual Reports, 2005 to 2014. In MoMA's permanent collection, credited with influencing Facebook's Timeline. The 2013 report quantified every conversation he had that year, including in-person ones. The benchmark for treating personal data as editorial object rather than widget grid: dense, print-derived, typographically severe, restrained in color.
- **[ciechanow.ski](https://ciechanow.ski)** — Bartosz Ciechanowski. The gold standard for 3D that earns its place. Real-time WebGL simulations embedded in long-form articles on gears, watches, orbital mechanics, light and shadow, color spaces. Custom-coded without external frameworks. Every interactive element is load-bearing to the argument, which is why nobody has ever called it a gimmick.

## Family 5: Editorial and archival non-linear

- **[gwern.net](https://gwern.net)** — The most complete non-linear reading system on the personal web. Four stated principles: aesthetic minimalism, accessibility with progressive enhancement, speed, and "semantic zoom." Sidenotes instead of footnotes on wide viewports, dropcaps, smallcaps, collapsible sections, hover popups previewing any link with an annotation, inline transclusion, bidirectional backlinks, generated bibliographies, local archives against linkrot, automatic inflation-adjusted currency. Hakyll and Pandoc. **JavaScript is not required for the core reading experience**, only for popups, transclusions, sidenotes, and table sorting. He also publishes a `/design-graveyard` page cataloguing what he tried and abandoned, which is worth stealing.
- **[c82.net](https://www.c82.net)** — Nicholas Rougeux, "Midwest data artist." Meticulous recreations of historical documents: Byrne's Euclid, Werner's Nomenclature of Colours, Thomas Wright's 1742 Clavis Cælestis, Updike's Printing Types, The Naturalist's Library. Actively maintained, latest entry July 2026. The blog posts documenting each hunt read like detective stories, turning the archive into narrative.
- **[lynnandtonic.com](https://lynnandtonic.com)** — Lynn Fisher. Ten different versions over ten years with content largely unchanged; she calls it an annual "refresh" rather than a redesign. In one version, widening the browser cracks illustrations open to reveal more inside, so the responsive breakpoint *is* the interaction. Every past version preserved at `/archive/2019/`, `/archive/2022/`, each with a published case study. Essentially all CSS, essentially no JavaScript.
- **[maggieappleton.com](https://maggieappleton.com)** — Digital garden of illustrated visual essays on design, programming, anthropology. Sections: `/essays`, `/garden`, `/patterns`, `/topics`, `/now`. Hand-drawn illustration rather than stock photography is what makes it unmistakable.
- **[tholman.com](https://tholman.com)** — Tim Holman. Flat, text-centric, no navigation chrome. Projects appear as one continuous middle-dot-separated stream, a wall of things built, mixing serious tools with jokes. Restraint on the site, wildness in the linked work.
- **[thesephist.com](https://thesephist.com)** — Linus Lee. The counter-example: a very visible AI researcher whose site is four links (posts, projects, stream, rss) and plain text.

## Family 6: First-load animations that are elegant and fast

Concrete patterns, mostly from the Codrops case study of Joffrey Spitzer's portfolio (Astro, GSAP with ScrollTrigger/Flip/SplitText, Lenis, Three.js, Tailwind, Prismic, Netlify):

1. **Stepped counter, not a smooth one.** A 0-to-100 counter eased with `steps(14)` produces chunky mechanical progression. Reads as a deliberate instrument rather than a generic spinner.
2. **FLIP morph as the transition itself.** GSAP's Flip plugin captures an element's rect on the outgoing page and animates it into its new position on the incoming page. On his About page the nav link physically becomes the page title. Continuity of a shared element beats any crossfade.
3. **`clip-path` wipe over already-rendered content.** The content is behind the mask, not withheld. This is the key structural difference from a real preloader.
4. **One shared easing curve everywhere.** He uses `expo.out` across every reveal. Consistency of curve is most of what makes motion read as designed rather than assembled.
5. **Character-level SplitText on exactly one line.** Hero only, never body copy.
6. **Persistent 3D scene across route changes.** A June 2026 Codrops tutorial by Ben Paine covers keeping a single WebGPU scene alive while a lightweight vanilla router swaps DOM, with DOM-element tracking mapping HTML positions into the scene. Transitions then cost nearly nothing because nothing reinitializes.
7. **No gate at all.** Bruno Simon's world loads progressively and you can drive immediately. If that site doesn't need a blocking loader, a typographic site certainly doesn't.

---

# (a) Candidate design languages

### 1. Instrument Panel
His own data becomes the visual system. Reading volume, lifting tonnage, YouTube diet, and talk history are rendered as a live, dense, typographically severe readout rather than chart widgets dropped into cards. The homepage states current facts continuously (what he is reading now, last lift, current watch mix) so the site is never static between posts. Anand Chowdhary is the reference for data plumbing; Felton is the reference for the *look*, since his reports are print objects rather than dashboards. Ciechanowski is the discipline check: every element must be load-bearing.

**Best fit:** anandchowdhary.com, feltron.com, ciechanow.ski
**Cons:** Requires live data pipelines that will break when an upstream API changes, and dead tiles look worse than no tiles. Sits one bad decision away from the decorative-metadata failure mode he explicitly rejects; the rule has to be that a number appears only if it changes what you think. Genuinely hard to make beautiful, since most quantified-self design collapses into a widget grid.

### 2. Stacked Panes
Content opens laterally instead of replacing the view. Clicking a book opens it beside the list; clicking a talk referenced in that book's notes opens beside that. The reading path stays visible as a row of collapsed spines. Directly expresses the genuinely interesting thing about his site, which is that books, talks, and watch history are cross-referenced rather than siloed.

**Best fit:** notes.andymatuschak.org, gwern.net's popup and transclusion layer
**Cons:** Mobile has no good answer and degrades to a plain stack, so you design twice. Deep linking, back-button behavior, and scroll restoration across panes are genuinely difficult and are where most implementations feel broken. Matuschak's no-index stance is hostile to first-time visitors and should not be copied literally. Zero WebGL, so it satisfies "non-linear" but not "3D."

### 3. Living Substrate
A rigorously typographic site sitting on one persistent GPU layer: either a single full-viewport GLSL fragment shader or one 3D object responding to scroll and cursor. The layer never unmounts across navigation, so route changes are nearly free. The 3D is material and atmosphere, never scenery, and the site would still function with it turned off.

**Best fit:** aristidebenoist.com, robbowen.digital, oryzo.ai, brand.ivress.co.jp
**Cons:** The full-bleed animated gradient shader is currently the most-cloned "premium" look on the web, so execution quality is the only thing separating it from a template. Needs a `prefers-reduced-motion` path and static fallback. Three.js is a few hundred KB even trimmed, though a raw fragment shader on a full-screen quad avoids that entirely and is the recommended route. Real risk the shader has nothing to do with him personally.

### 4. The Catalog
The site as specimen book or scientific catalog. Books, talks, and projects become plates in a collection, with visual language borrowed from printed reference works: rules, small caps, marginalia, dense indices, restrained ink-on-paper palette. Non-linearity comes from Gwern-style link popups and transclusions rather than spatial navigation, so any item can be previewed from anywhere without losing your place.

**Best fit:** c82.net, gwern.net, maggieappleton.com
**Cons:** Demands real content density and looks impoverished if underfed, though with 311 books logged he clears that bar. Historical-reference styling can tip into pastiche. Typographic work of this kind is slow and unforgiving, with most of the effort invisible. Also the least "3D" option on the table.

### 5. Explorable World
A navigable 3D space where sections are places. The most spectacular option and probably what he's imagining when he says 3D.

**Best fit:** bruno-simon.com, samsy.ninja, henryheffernan.com, aimees-papercraft-world.com
**Cons:** The honest list. Build cost measured in months, not weekends. Both samsy.ninja and henryheffernan.com returned nothing but a `<title>` tag to a text fetch, meaning no server-rendered content, no SEO, no link previews, nothing without JavaScript. Bruno Simon's own backend features are currently broken. Accessibility is effectively nil. Mobile performance and battery are real problems. Dates faster than anything else here. And for someone whose credibility comes from his work rather than his rendering skills, the maximal version can read as trying too hard. If he wants any of this, Aimee Weis's approach is the one to study, because a distinctive hand-made art direction is the only durable moat in this genre.

### 6. Annual Editions
Not a look but a structure: the site becomes a series. Each year gets a different formal experiment, every prior version stays permanently live at its own URL, and each ships with a short case study on what was tried. Redesigning stops being destructive.

**Best fit:** lynnandtonic.com, rauno.me's `/2022` and `/2023` archives, gwern's `/design-graveyard`
**Cons:** A commitment rather than a design, and doing it once just looks like a redesign. Doesn't answer what *this* year looks like, so it composes with one of the other five rather than replacing them.

**Researcher recommendation, given the constraints:** Instrument Panel as the organizing idea, Living Substrate as the surface treatment, and Stacked Panes for cross-referencing. That combination is genuinely non-linear, uses 3D as material rather than scenery, is grounded in data nobody else has, and none of it is clonable from a template.

---

# (b) Anti-patterns: what makes 3D and spatial personal sites read as slop

1. **The blocking preloader.** Roughly 60% of users abandon a site taking over three seconds. LCP is a direct ranking factor, and a full-screen preloader hides the largest element by definition, so a site whose content is ready at 1.5s but plays a 3s loader has an effective LCP over 3s. Preloaders are added precisely because the developer knows the site is slow, and they degrade both actual and perceived performance. If unavoidable, reveal content already rendered behind a mask rather than withholding it.
2. **Zero server-rendered HTML.** The pure-canvas sites return a `<title>` and nothing else. No search indexing, no link previews when someone shares a talk, no reader mode, nothing without JavaScript. Gwern's rule is correct: JavaScript enhances, it never gates the reading.
3. **Asset-store geometry.** A generic low-poly room, a floating island, a laptop on a desk. The tell is that the objects have no relationship to the person. Aimee Weis's papercraft and Jesse Zhou's ramen shop work because they were made, not sourced.
4. **The desktop-OS metaphor in 2026.** Searching for it returns almost exclusively GitHub templates and AI-builder demos. Fully commoditized. Rauno and Brian Lovin both built strong versions and both walked away.
5. **Navigation that is a puzzle.** If a recruiter or conference organizer has to learn a control scheme to find his talks, the interface has taken priority over the person. Bruno Simon can afford this because the interface *is* his product. For someone whose product is his thinking, it's a tax.
6. **Decoration masquerading as data.** Fake terminals that execute nothing, node graphs with six nodes, orbiting particles labeled as "skills," progress bars for proficiency. Same failure as category pills and self-assigned themes, just rendered in WebGL.
7. **Motion with no shared vocabulary.** Different easing curves, durations, and directions per element. The fix is boring and effective: one curve, two or three durations, applied everywhere.
8. **Scroll-jacking and unskippable cinematics.** A camera path you can't escape, sections that won't let you scroll past, momentum fighting the trackpad. Smooth scroll libraries like Lenis are fine; hijacking scroll position is not.
9. **No reduced-motion path.** `prefers-reduced-motion` is not optional at this level of animation, and "the animation is the site" is an architecture failure, not a defense.
10. **Features requiring a server you won't maintain.** Leaderboards, guestbooks, visitor counters, live multiplayer cursors. Bruno Simon's are broken right now. Static parts survive; dynamic parts rot, and broken features are worse than absent ones.
11. **The three-second brand moment.** A logo animation, a tagline typing itself out, a "scroll to begin" prompt. Each is a toll booth in front of content the visitor already decided they wanted.
12. **Effects with no argument.** The deepest test, which Ciechanowski passes and almost nobody else does: if you removed the 3D, would anything be harder to understand? If no, the 3D is decoration, and decoration is what makes a site read as a tech demo rather than as a person.

---

# Round 2: The handcrafted diorama vibe (2026-08-08)

## The anchor, decoded (most important finding)

No making-of exists for pallaviandprayash.com, but its precursor explains the entire aesthetic: **[prayash.io/journal/weightless](https://prayash.io/journal/weightless)** ("Weightless: Combining Music & Software to Create Art," March 2024). Prayash wrote a song, then built a real-time interactive visualizer and music video: Ableton Live, Korg Minilogue, OP-1 for audio; Blender, Three.js, react-three-fiber, custom GLSL for rendering. Low-poly assets — a mountain landscape, a 3D self-portrait, a guitar — in a "foggy silhouette aesthetic," with **real-time FFT audio analysis driving scene-element appearance**, hand-keyframed per song section.

The wedding diorama reads as handmade not because of shaders or grain, but because **every object is an index into his documented life**: the guitar is the Weightless guitar (he wrote the site's song), the torii gate is their Japan trip ([journal/for-nihon](https://prayash.io/journal/for-nihon)), the campfire is the wedding itself ([journal/just-married](https://prayash.io/journal/just-married)). Nothing is generic because nothing was chosen *for the scene* — it was chosen from a life and then modeled.

**Transferable move:** the scene must be an inventory of Chappy's actual objects — real book stacks, the barbell at its real current working weight, specific talk venues. Not "a laptop, a coffee cup, a plant."

## Fresh references — diorama and contained-scene

| Site | What it is | What to steal | Tech |
|---|---|---|---|
| [jordan-breton.com](https://jordan-breton.com) | Floating island diorama, FWA SOTD | **Fixed-point navigation, not free roam** — camera moves between composed vantage points on a contained object | Three.js |
| [aimees-papercraft-world.com](https://aimees-papercraft-world.com) | Notebook-paper world (built by Andrew Woan as an open tutorial) | 2D illustrated assets **baked onto** 3D geometry — craft signal from texture, not geometry | R3F, Blender, Krita |
| [worawork.vercel.app](https://worawork.vercel.app) | Zelda/Animal Crossing cozy environment | The cozy-palette reference: warm, saturated, soft-shadowed, small | Three.js |
| [weisdevice.xyz](https://weisdevice.xyz) | Island with robot, physical knobs, Game Boy pad | Physical affordances as navigation without becoming a puzzle | Three.js, GLSL, Howler, GSAP |
| [bilal.show](https://bilal.show) | Story inside a music box | The single contained object — "a diorama with a lid" as scope discipline | Three.js |
| [Andrew Woan's room tutorial](https://discourse.threejs.org/t/3d-portfolio-tutorial-made-with-react-three-fiber/53794) | Blender model of his actual room | Hotspots + camera transitions; "model something real that exists" | Three.js, TS, React |

## Fresh references — scroll-driven camera narratives

| Site | What it is | What to steal | Tech |
|---|---|---|---|
| [themonolithproject.net](https://themonolithproject.net) | Ethan Chiu: 13-scene scroll story, hand-drawn sketches resolving into lit 3D ([Codrops writeup](https://tympanus.net/codrops/2025/11/29/building-the-monolith-composable-rendering-systems-for-a-13-scene-webgl-epic/)) | **Sketch-to-rendered progression** — the world becomes more real as you scroll; 8 distinct scene transitions | Three.js, R3F, GSAP, custom deferred renderer |
| [equinox.space](https://equinox.space) | Little Workshop: interactive story among the stars | "Atmosphere and pacing rather than spectacle" — study the pacing | Three.js |
| [mola-zone.com](https://mola-zone.com) | Studio 9P album experience for Yamê: motorcycle ride across biomes | Scroll as continuous travel tied to a song's structure | Three.js, Blender |
| [messenger.abeto.co](https://messenger.abeto.co) | Deliver parcels around a tiny round planet, Awwwards SOTD | **The tiny round planet** — a sphere is a diorama you can walk around; no horizon lie needed | Three.js, three-mesh-bvh, Houdini, Blender |
| [sebastien-lempens.com](https://sebastien-lempens.com) | (Round 1 re-flag) best personal-site scroll-as-camera | One scrollbar carrying several camera grammars (first-person → vehicle → free-fall) | Three.js |

## Crafted 3D scene + real personal data: EMPTY — white space

Searched four ways; **no personal site combines a handcrafted 3D scene with live self-tracked data.** Closest existing thing: Prayash's own Weightless visualizer — live FFT driving low-poly scene appearance — the exact mechanism, pointed at sound instead of life data.

Candidate bindings: campfire height/particles ← current lifting volume; sky gradient ← actual local time; bookshelf count ← real Notion-synced number; firefly density ← recent talk/post activity. **The anti-decoration rule: the object must change because the number changed, and the number must be real.** A campfire that is always the same size is decoration; one that was visibly bigger last week is an instrument.

## Making low-poly feel premium (technical playbook)

From [Andrew Woan's Codrops build writeup](https://tympanus.net/codrops/2025/04/08/3d-world-in-the-browser-with-blender-and-three-js/):

- **Material variation, not modeling:** identical PBR textures mixed with noise masks and color ramps, layered to break uniformity. What looks like intricate modeling is simple geometry with sophisticated shader compositing.
- **Baking:** full-scene bake 4096², 32-bit EXR → PNG. Semantic texture groups (roof/interior/foliage). UVPACKMASTER atlas packing; fill empty atlas space. Delete non-visible geometry pre-bake; join objects sharing UVs to cut draw calls. Small assets bake tiny (bird: 256²).
- **Compression:** Draco via gltf-transform (quality 155-255); KTX beat WebP here; mono audio 44.1kHz. **A darker aesthetic naturally masks compression artifacts** — relevant to a dusk-gradient scene.
- **Loading:** four Suspense chunks so progress jumps 25/50/75/100; Zustand `isExperienceReady` gate; ~6s target; iPhone 12 as low-end baseline (catches WebGL context loss).
- **Cheap detail:** high remesh (0.01) then decimate; fire shaders with `depthWrite` off; `touch-action: none`.
- His philosophy: "it doesn't have to be perfect to be cool."

**Scroll camera authoring** ([Codrops, July 2026](https://tympanus.net/codrops/2026/07/07/building-a-scroll-driven-3d-gallery-using-a-blender-camera-path-with-three-js-and-gsap/)): draw a Bezier in Blender, Python-export sampled points to JSON (X→X, Z→Y, Y→−Z), rebuild as `CatmullRomCurve3`. Scroll sets `targetT`; GSAP `quickTo()` proxy eases toward it (~1s); camera = `curve.getPoint(t)`. GSAP Observer unifies wheel/touch/pointer. **The creative control lives in the curve, not the code** — reshape in Blender, re-export, the whole site's pacing changes with zero code edits.

**Filmic post** (Monolith writeup): composable post stack (chromatic aberration, atmosphere, color correction as separate modules); edge detection on depth+normals; shader assembly from injection points for hot-reload iteration.

**Lightmap baking references:** [@react-three/lightmap](https://unframework.com/portfolio/simple-global-illumination-lightmap-baker-for-threejs/), [tchayen's baked lighting in r3f](https://tchayen.com/baked-lighting-in-r3f), [PixelCapture Blender tutorial](https://pixel-capture.com/tutorials/lightmap-baking-in-blender), [Wawa Sensei's baking lesson](https://wawasensei.dev/tuto/build-a-3D-portfolio-with-react-three-fiber-baking-scene-with-blender).

## Round 2 synthesis — what to steal

1. **Scene as personal inventory** — every object is a real thing with a story already on the site. The entire difference between Prayash and an asset-store room; costs nothing technically.
2. **Fixed vantage points on a Blender-authored curve** — every frame stays art-directed.
3. **One contained object** (music box, tiny planet) — a bounded world never needs a horizon, never needs LOD, never grows.
4. **Baked lighting + noise-mask material variation** — offline-quality look at textured-mesh cost.
5. **Dark-leaning gradient palette** — matches the anchor, hides compression.
6. **Data-bound scene elements** — the unoccupied white space that makes it his rather than a genre entry.
7. **Progressive load, chunked jumpy progress, ~6s target, iPhone 12 floor.**

**Caution:** Prayash's site is a wedding site — one page, one moment, never updated. Chappy's must absorb new books weekly, new talks, new lifts, and still be there in three years. **Data drives instances and parameters; the scene file stays fixed.** Adding a book must never mean opening Blender.

---

# Round 3 feedback (2026-08-08) — pivot away from worlds

Chappy's reaction to the diorama/scroll-narrative references: **"These are all games. I don't want it to be like a game."** The closest match was messenger.abeto.co — specifically *"a globe that can spin"* — i.e., a bounded 3D object you can manipulate, not a world you inhabit. He also flagged overscope worry ("maybe this is just going to be too much").

Revised brief: **cool but highly functional, not over the top.** Composable creative elements inside a functional content site — discrete 3D objects, non-linear scroll moments, parallax, live data — not a whole-site metaphor. Direction shifts from Family 1/Explorable World to Family 2/Living Substrate + bounded interactive objects + a unified motion system. Element menu presented in-session; selections pending.
