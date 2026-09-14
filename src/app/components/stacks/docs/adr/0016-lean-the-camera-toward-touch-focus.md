# Lean the camera toward the selected object

After a quick click or tap establishes selection, the camera will make a
restrained Focus Lean toward that Identity Prop. The reframe enlarges the prop
without changing Units or losing its surrounding composition, and it restores
the authored composition when focus clears.

Focus Lean begins only after a stationary click or tap resolves as a quick release. It
does not move the scene beneath an unresolved swipe or hold, and it does not
run while carrying.

This improves the visibility of small scene details while preserving their
place in the World. It is chosen over a dedicated inspection view, which would
interrupt the continuous room, and pinch-to-zoom, which would compete with
browser zoom and accessibility behavior.

Selection also adds three degrees of downward camera pitch around the existing look target on desktop and touch. The pitch follows the selection easing and is omitted for reduced motion and capture views. Scene Diagnostics exposes a live Selection downward pitch checkbox; the override resets on reload.

World wheel input, keyboard travel, and the first native horizontal scroll clear selection immediately, including wheel input at a room boundary. Zoom, pitch, and the selected object response ease back to their normal state. Browser pinch zoom and scrolling inside a reading card keep their existing behavior.

After scrolling stops, desktop selection can zoom from any position between shelves. Touch retains its authored-stop snapping. A wheel gesture dismisses selection once; its deferred native scroll event must not clear a newer selection at the same scroll position.

Pressing a different object preserves the current selection until the stationary release transfers it. This keeps zoom and pitch engaged throughout the handoff, without an outward camera movement between objects. Cancelled presses preserve the old selection; background presses and travel still dismiss it. Grabbable props return to their authored scale after press compression, with no persistent selection enlargement. The camera lean and held object reaction provide selection feedback.
