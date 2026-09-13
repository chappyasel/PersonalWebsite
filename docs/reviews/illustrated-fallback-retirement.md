# Illustrated fallback replacement

The homepage no longer renders `FlatHome`. `RoomHomePage` and `StacksHome`
now use `RoomDocument` when the interactive room cannot initialize. The old
component and its Grainient background and horizon footer are removed from
homepage delivery. Independent reading pages retain their own layouts.

Reduced motion and Save-Data select the illustrated room with WebGL disabled.
The existing motion preference skips the entrance. A blocked application bundle
still reaches native fragment navigation after the prepaint timeout. Late
hydration retains that readable document and the route's initial section.

`RoomDocument` uses the approved drawings, the room's pastel atmosphere, and
server-rendered section content. Its CSS selects one section and one artwork
source at a time. It needs no event handler to follow section links. A
synchronous Suspense fallback keeps this content available even when scripts
cannot reveal streamed results. Before book and training data resolve, those
sections link to their full pages without inventing statistics. Card entrances
are disabled in this document so missing observers cannot leave text blurred.

Golf now opts into the illustrated boot. Its compact green overview uses the
course's dimensions and cup position. It is not a registered shelf capture;
`matchRequired: false` allows the ordinary camera to appear after the renderer
passes its readiness gates. The golf game remains a 3D experience. Selecting a
shelf restores the registration requirement.

Validation on the integrated working tree:

- 290 tests passed across the boot adapters, machine, delivery, document,
  shell, and artwork component tests. The document and page tests also passed
  after the final link changes.
- Seventeen search-wiring and OG-input tests passed. The two updated
  first-load browser tests passed, covering deferred drawings and direct
  Books entry. An initial simultaneous timeout cleared on rerun.
- Node 24 type checking and targeted ESLint passed.
- `node scripts/verify-illustrated-document.mjs --base=http://localhost:3334`
  passed all ten headless cases: JavaScript disabled on desktop and phone,
  direct section/hash destinations, dark theme, blocked bundles, reduced
  motion, Save-Data, unavailable WebGL, and automatic Golf entry. Native
  navigation, unblurred content, and the absence of the old page are asserted.
- `pnpm check:room-artwork` passed all 24 variants and 528 owner comparisons.
  Existing drawing bytes and source receipts were not regenerated.

The separate entrance verifier reports the ongoing shared chrome edits as a
2D-name shadow and a low mobile corner. This commit does not include those
chrome edits. Its fallback checks and source checks above pass.

Field Notes: excluded by quality-bar test 2. Automatic fallback delivery is
not a qualifying visitor action; existing discoveries remain unchanged.
