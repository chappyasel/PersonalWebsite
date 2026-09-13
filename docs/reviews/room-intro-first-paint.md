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

One persistent wordmark starts centered above the shelf and moves into the
corner over 1.5 seconds. It survives hydration without restarting. Navigation
starts around 2.8 seconds after the hydrated entrance begins, following the
cards. A small loading line above the shelf replaces the two-line pill.
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

No visible browser was opened. This automatic intro does not meet Field
Notes quality-bar test 2, so it adds no discovery.
