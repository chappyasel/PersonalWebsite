# Major route transition prototype

Current question: does zooming into the actual clicked link, card, or 3D prop
make a major page change feel like entering that object?

Source zoom is enabled in production and locally, with no query parameter.
Scene Diagnostics → Render has a live off switch that resets on reload. The
floating comparison bar and earlier variants only appear in development.
Production always uses source zoom, including when a URL carries an old variant.

Books and Weightlifting portal links stay on the current main-site origin.
Production Books, Weightlifting, Manual, and Routine root entry points redirect
to their main-site paths so returning home can animate too. Deep subdomain URLs,
API requests, and RSC requests retain their existing routing. Book links use the
main site's `/books/<id>` or the standalone Books host's `/<id>` as appropriate.

Local subdomain document requests redirect to `127.0.0.1`, preserving the port.
Proxy URL normalization stays disabled in development to avoid relative redirect
loops. Run `pnpm dev` and use the port printed by the server.

## Zoom from the clicked source

A DOM launcher supplies its measured bounding rectangle. A 3D portal supplies
its interaction ID, which the controller resolves through the scene's existing
live projection bridge. Geometry is measured only for an accepted navigation;
the off path does not project objects or create effect layers.

The browser captures the outgoing screen, including its rendered scene, and
pushes toward the source by at most 1.2×. The destination stays at its native
size while a rounded clip expands from the source rectangle to the viewport
over 620ms. The outgoing image fades early. This avoids the pixelation caused
by enlarging the old screenshot up to 16×, though the smaller push can still
soften it slightly. The effect now reads more as opening the clicked object
than diving deep into it. Clipped sources use their visible area. If an origin
is unavailable, the reveal uses a centred fallback rectangle.

Returning home defers the canvas mount and its eager preload until the native
reveal finishes. Shader and scene startup otherwise compete with the animation.
The existing boot screen and readiness gates still handle loading afterward.
Cancellation, the diagnostics off switch, and a three-second backstop release
the deferral. Reduced motion and other variants keep their existing startup behavior. Slow mode doubles the backstop along with the animation.

Local browser measurements on September 10, 2026, for Books → Home with loaded
route code: before this change, the reveal took 1537ms with an 875ms frame gap.
Afterward, a repeated return took 635ms with no frame gaps over 50ms during the
reveal. A first run after hot reload still had a 184ms hitch. These measurements
cover the reveal only; the room still rebuilds afterward, and keeping it mounted
between routes remains a separate change.

Without native View Transitions, a panel expands from the same source bounds,
the route changes under cover, and the panel fades away. The comparison bar
reports this fallback. Reduced motion still navigates immediately. Cold route
compilation can cause a native snapshot to be skipped; the bar reports it.

This pass handles links, cards, and registered 3D portal actions. Existing
modal open/expand treatments remain separate. Returning via a title link zooms
from that title; it does not yet reverse into a remembered source card or keep
the old room mounted.

## Earlier signature shutters

Two panels close in 240ms. Navigation starts once they meet, and the panels
open over 320ms as soon as the destination route commits. There is no fixed
pause and no replay of the boot illustration. A loading label appears only
when the destination keeps the doors closed for more than 500ms. The route
commit retains a ten-second backstop so failed development navigation cannot
leave the overlay up indefinitely.

Returning to a cold homepage can reveal its real boot screen. The shutters do
not wait for a second 3D loading sequence behind closed doors. Preserving a
previously loaded room across routes is a later change.

The pass uses CSS transforms through the Web Animations API. It mounts the
panels synchronously and does not wait for an animation frame to begin. Each
animation has a deadline and releases its animations and listeners on exit.
Reduced motion navigates immediately. Failed animations still navigate, and
rapid repeat clicks cannot start overlapping passes. The 0.5× control doubles
both motion durations.

## Navigation coverage

Ordinary same-origin links between Home, Books, Weightlifting, Systems, Manual,
Routine, and Liar's Dice participate. Same-section navigation keeps its existing
behavior, including book-to-book modals and in-page links.

On the main local host, normal clicks on the Books and Weightlifting site
portals use `/books` and `/weightlifting` in the same tab. This includes linked
placard cards that normally call `window.open`. Their declared destinations
let the controller intercept both clicks and Enter. Subject filters survive.
Individual book links, nested controls, modified clicks, and unrelated external
links retain their normal behavior.

`SheetLink` and `SheetExpandControl` declare that their existing transitions
should be preserved. The shutter controller leaves them alone, including the
small-viewport full-page behavior of document launchers. This pass does not add
modal-to-page expansion or modal-state restoration.

Page title links return through the selected effect to their matching shelf: Books to
`#books`, Weightlifting to `#training`, and Systems documents to `#systems`.
Root links resolve on the current local origin even if a helper spells the host
as localhost while the tab uses an IP address.

The scene's `useOpenTarget` hook sends a cancelable navigation request to the
same controller used by DOM links. This covers the 3D prop path that previously
called `router.push` directly and bypassed the shutters. An absent controller
leaves the prop's original navigation in place. Sheet launches and arbitrary
external prop links keep their existing behavior.

Existing standalone subdomain tabs should be reloaded once to enter the shared
local app. Production subdomain migration, browser Back/Forward transitions,
and other imperative controllers such as universal search are not part of this
prototype.

## Other comparisons

The floating bar retains the earlier experiments:

- A, shutters: the short panel close/open described above.

- B, screen swipe: browser snapshots move sideways.
- C, perspective cards: browser snapshots shrink and rotate as they slide.
- D, Books shelf: an SVG counterpart of the Books unit exchanges covers with
  the library. D adds an experimental featured-books row to the library.

Choose these in the bar. An optional `variant` parameter retains that choice
on reload. Returning to source zoom removes it. D's Books boot illustration is available
at `/?variant=bookshelf#books`; plain `/#books` uses the ordinary boot again.

D projects the shared Books layout into SVG. Its boot retains the original
binding colors throughout the zoom and uses the live camera for the endpoint.
Furniture paints before books, with depth ordering within each group. The
illustration approximates cover perspective, omits some fixture details, and
requires recapture after a viewport or theme change. The room keeps rendering
behind a held 2D preview, so this does not measure a standalone 2D mode.

B and C require native View Transitions and fall back to shutters when that API
is absent. Their route-update callback resolves at React's layout commit;
waiting for animation frames inside capture can deadlock it. Cold development
compilation can still cause native capture to be skipped, which the bar reports.

## Verification and scope

Automated checks cover DOM and projected 3D source bounds, origin zoom geometry,
the panel fallback, shutter sequencing and cancellation, reduced motion,
stalled-animation fallback, real card click/keyboard launchers, retained modal
behavior, SVG ordering and border colors, and default development/production
policy. No interactive browser inspection has been performed for this pass.

Field Notes: no discovery added. Changing a navigation treatment fails quality
bar test 2; it does not add a meaningful visitor action.

Branch: `prototype/major-route-transitions`. The illustrated shelf remains an
experiment. Source zoom is the current candidate for full-page navigation;
modal-state-aware expansion and preserving the room are later work.
