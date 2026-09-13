# Room intro and first paint

The initial response now includes every empty shelf before book, cover-color,
or activity queries resolve. A parsing-time script selects the pathname or
hash stop from the scene registry. All 24 generated light/dark and
desktop/phone variants are inline, adding 25,188 gzip bytes. Their SVG bytes
come from the verified shelf artifacts. Hydration uses those same inline
images while the selected objects load; neighboring artwork waits until
the entrance finishes.

About uses its current viewport camera before hydration, including phone
perspective. Its small standalone projection adapter takes geometry from
the shelf contracts and is tested against the normal About projector.

One persistent wordmark starts at 20% of viewport height and stays centered
above the shelf until every item
finishes appearing. It then moves into the corner over 850 milliseconds while
the shelf settles, the mobile sheet slides up, and the navigation fades in.
It survives hydration without restarting. A larger loading heading stays
centered above the shelf with three cycling dots and the original stage-aware
notes. The notes remain outside screen-reader announcements. There is no pill
background.
Reduced motion, gesture skips, retries, and automatic 3D handoff keep their
existing behavior. No new delay was added to the WebGL asset loader.

Verification passed:

- Focused shell, URL, entrance, About, and artifact tests; typecheck and ESLint.
- Production build and postbuild boundary checks.
- Artifact checks across 24 variants and 528 owner masks.
- Headless first paint on all seven stops with framework scripts blocked.
- About first-paint corner residual: zero on 390×844, 0.023 SVG units on
  1440×900, with no hydration errors.
- Headless desktop/mobile assembly and five automatic cold-load 3D entries.
  The desktop placement check was repeated alone after concurrent browser
  work skipped its intermediate frames; the isolated check passed.

The follow-up raised the mobile name and loading message into the top row,
above the navigation. The live name uses the same position so it does not
jump during the 3D handoff.

A frame trace also caught a hydration gap. Navigation initially treats Talks
as a neighboring shelf before resolving the URL. When Talks becomes selected,
the generic neighbor transition used to fade it from zero opacity after the
server shell disappeared. The selected entrance shelf now skips that fade.
The entrance checker records frames from the server shell onward and rejects
wrong selections, missing shelf frames, and mobile loading/nav overlap.

The follow-up passed 80 focused tests, typecheck and targeted ESLint. Headless
Talks and Books checks passed at 1440×900 and 390×844, including joint name,
content and navigation arrival. All five automatic cold-load 3D entries also
passed. The production build and boundary checks
passed before the CSS positioning follow-up.

The opening now centers the visible wood at 55% of viewport height. Generated
metadata measures alpha bounds from the existing empty shelf SVGs. About uses
its projected plank and support bounds. The image and registration bytes stay
unchanged. Desktop traversal uses the scene's 4.4-unit intervals at the mean
resting camera scale; narrow layouts retain compact gaps. The 2D name has no
text shadow.

The placement follow-up passed 61 focused tests and all 24 artifact variants
with 528 owner comparisons. Headless checks measure the wood center in the
actual inline SVG and confirm the final camera frame remains unchanged.

No visible browser was opened. This automatic intro does not meet Field
Notes quality-bar test 2, so it adds no discovery.
