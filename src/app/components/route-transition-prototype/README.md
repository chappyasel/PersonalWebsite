# Major route transition prototype

Major page changes open from the clicked link, card, or 3D prop. Returning to
the room closes the departing page toward that entry point.

Source zoom is enabled in production and locally, with no query parameter.
Scene Diagnostics → Render has a live off switch that resets on reload. The
floating comparison bar has been removed. Earlier variants remain available
only through explicit development URLs.
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

## Room round trips

Room to Books, Weightlifting, Systems, Manual, Routine, and the other main
sections keep the source reveal. Returning to the room reverses the rectangle:
the viewport edges close inward toward the original entry point over 620ms,
revealing the room around the departing page. Both pages stay at native size.
The departing page fades throughout the close: 35% opacity halfway through,
4% at 80%, and transparent at the endpoint.

The history entry stores a small source descriptor and the room generation.
DOM sources receive a temporary identity attribute; 3D sources retain their
interaction ID. No element references, screenshots, or page content enter
history state. Same-page history replacements by Next or page filters
retain the descriptor; replacements into another page do not. The controller remeasures after the destination layout commits,
including the resumed camera's resize. An expired room, removed element, or
source outside the viewport uses a centered 6% pullback and fade instead.

Browser Back and Forward between the room and these sections use the same
direction rules. Back uses the departing page's source descriptor, even if
the destination room entry remembers an older trip.
A small head script registers the history listener before Next hydrates. The
controller binds to it when loaded and holds Next's restore until the old
snapshot exists, then replays the original state exactly once. It never adds an entry or
calls history.go. A newer traversal cancels the previous pass. Disabling the
controller releases a held restore. Same-section changes, book detail routes,
and modal history retain their own behavior. A bounded in-memory record
restores each page visit's scroll position after the delayed route commit.
The departing room ignores history events and URL mirroring once the URL
belongs to another page. This adapter depends on Next's
App Router popstate listener; recheck it when upgrading Next.

Scene Diagnostics has a live "Retrace the room entry point" switch for
comparison. It resets on reload. Turning it off restores the original source
zoom and stops the room history interception. Reduced motion bypasses capture.
Browsers without native snapshots use a short panel pullback on return.

The shared layout retains a previously ready room for up to three minutes.
While parked, its frame loop, input listeners, and audio are paused. Returning
before expiry reuses the canvas. After expiry, startup waits until the native
transition finishes, then the existing boot screen handles loading. A
three-second backstop releases that deferral if capture stalls.

Without native View Transitions, entering a page expands a panel from the
source bounds, changes the route under cover, and fades the panel away. Cold
route compilation can cause native capture to be skipped; navigation continues.

## Earlier signature shutters

Two panels close in 240ms. Navigation starts once they meet, and the panels
open over 320ms as soon as the destination route commits. There is no fixed
pause and no replay of the boot illustration. A loading label appears only
when the destination keeps the doors closed for more than 500ms. The route
commit retains a ten-second backstop so failed development navigation cannot
leave the overlay up indefinitely.

Returning to a cold homepage can reveal its real boot screen. The shutters do
not wait for a second 3D loading sequence behind closed doors. A ready room remains available during the three-minute return window.

The pass uses CSS transforms through the Web Animations API. It mounts the
panels synchronously and does not wait for an animation frame to begin. Each
animation has a deadline and releases its animations and listeners on exit.
Reduced motion navigates immediately. Failed animations still navigate, and
rapid repeat clicks cannot start overlapping passes.

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
modal-state restoration. Expanding a Systems, Manual, or Routine sheet keeps
the same intercepted presentation and history entry. Its visible return link
uses the sheet's own source collapse and one history Back. A mounted sheet,
including an expanded one, bypasses the full-page history capture. The root
sheet slot has an explicit empty homepage route so a separate navigation to
`/` also clears the overlay instead of retaining its previous content.

Switching between Systems, Manual, and Routine keeps the current document
visible while the next route resolves. These intercepted routes have no
`loading.tsx` fallback, and their links request full-document prefetches.
The clicked link supplies bounds relative to the sheet's reading area. That
area uses the same 620ms source reveal, gentle outgoing push, and full-resolution
incoming clip as full-page navigation. The surrounding sheet stays fixed.
Its scroll resets at commit, while explicit section hashes retain Next's anchor
navigation. The global page-animation switch and reduced motion bypass capture
and source measurement. Without native snapshots, the ready reading area uses
the same clip reveal directly. The sheet's size, expanded state, launch origin,
and single history entry survive the switch.

Page title links return through source zoom to their matching shelf: Books to
`#books`, Weightlifting to `#training`, and Systems documents to `#systems`.
Root links resolve on the current local origin even if a helper spells the host
as localhost while the tab uses an IP address.

The scene's `useOpenTarget` hook sends a cancelable navigation request to the
same controller used by DOM links. This covers the 3D prop path that previously
called `router.push` directly and bypassed the shutters. An absent controller
leaves the prop's original navigation in place. Sheet launches and arbitrary
external prop links keep their existing behavior.

Existing standalone subdomain tabs should be reloaded once to enter the shared
app. Browser history animation covers room round trips.
Other imperative controllers such as universal search keep their own behavior.

## Other comparisons

Earlier experiments remain in the source for reference:

- A, shutters: the short panel close/open described above.

- B, screen swipe: browser snapshots move sideways.
- C, perspective cards: browser snapshots shrink and rotate as they slide.
- D, Books shelf: an SVG counterpart of the Books unit exchanges covers with
  the library. D adds an experimental featured-books row to the library.

An explicit development `variant` parameter selects an earlier experiment.
Without it, source zoom runs. D's Books boot illustration is available
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
compilation can still cause native capture to be skipped, without blocking navigation.

## Verification and scope

Automated checks cover DOM and projected 3D source bounds, origin zoom geometry,
the panel fallback, shutter sequencing and cancellation, reduced motion,
stalled-animation fallback, real card click/keyboard launchers, retained modal
behavior, SVG ordering and border colors, and default development/production
policy. Directional tests cover source identity, resized bounds, expired-room
fallback, history-state preservation, one-time restore, rapid traversal, and
disabling during capture. Weightlifting regressions cover a complete prop/title
round trip, resized source bounds, Back/Forward with an older room history
entry, and scroll restoration. The picker is absent in development and production.

Production Chromium checks on September 11, 2026 covered the library heading
and title-link round trip, resized source bounds, Back/Forward, preserved
reading position and history length, book-modal Back, rapid traversal, and
the expired-room fallback. The earlier scaled return was inspected at its midpoint. The subsequent
edge-inward clip correction was checked with geometry and navigation tests.

Field Notes: no discovery added. Changing a navigation treatment fails quality
bar test 2; it does not add a meaningful visitor action.

Branch: `prototype/major-route-transitions`. The illustrated shelf remains an
experiment. Source zoom handles full-page navigation;
room round trips use the reverse close.
