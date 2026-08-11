// The current v8 Talk and Project photographs came from the owner's local
// photo library without recoverable post IDs. The four traced archive photos
// this list used to expose have all left the scene, so retaining their links
// here would make the accessible DOM claim that unrelated new prints were
// their source. An empty list is intentional: provenance is never guessed.
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
export const PHOTO_SOURCES: { href: string; label: string }[] = [];
