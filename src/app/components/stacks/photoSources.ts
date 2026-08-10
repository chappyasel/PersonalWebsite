// The photographs in the shelf world whose source post is known for certain
// — the tweet ID is verbatim in the archive filename, so these four are
// traced, not inferred. Everything else in the room is a photograph with no
// recoverable origin, and gets no link rather than a guessed one.
//
// This lives in its own dependency-free module on purpose. Both the scene
// (which places the links as raycast targets) and PlacardLayer (which
// mirrors them into the DOM, because a canvas has no focus order and no
// accessible name, so a raycast-only link is unreachable by keyboard and
// invisible to a screen reader) need the same list. Putting it in
// scene/photos.tsx made PlacardLayer import that module, and with it drei,
// r3f and three — dragging the whole 3D stack into the initial entry that
// the flat and reduced-motion paths download. The canvas is deliberately a
// dynamic import; a shared constant must not be the thing that undoes it.
export const PHOTO_SOURCES: { href: string; label: string }[] = [
  {
    href: "https://x.com/i/status/1742265325423337870",
    label: "Under the bar, mid-set",
  },
  {
    href: "https://x.com/i/status/1778892048747417620",
    label: "At the whiteboard",
  },
  {
    href: "https://x.com/i/status/1798370655718744491",
    label: "Hosting, mic in hand",
  },
  {
    href: "https://x.com/i/status/1835742939928240302",
    label: "Reading NOISE",
  },
];
