# Overlay behavior

Screen overlays register with `src/lib/overlays/coordinator.ts`. DOM viewers
place `OverlayPresence` inside their retained presentation, under an element
marked `data-overlay-surface`. Photo viewers use their existing PhotoView
portal. Physical props register directly and release after returning to rest.

The registration lasts through the exit animation. `open` includes the
entrance; `closing` starts the return of the room's visible controls while
input remains blocked. Origin flights call `beginOverlayClose` before measuring
their exit geometry. Releasing a registration is safe to repeat.

Input is blocked from mount through release. Opening an overlay eases scene
speed from normal to zero over 1.5 seconds. Dismissing the final open overlay starts
the return to normal speed immediately, over another 1.5 seconds. Interrupted
transitions retrace the same curve from their current speed, so a partial
reversal takes only the remaining fraction of the ramp. Speed changes linearly
through the middle, with short rounded ends. A child closing back to an open
parent keeps the background paused.

`settle()` marks the end of the authored entrance. Rendering can sleep once
both the entrance and the slowdown have finished. DOM presentations use their
entrance durations in `OverlayPresence`; physical props settle when their
approach reaches the target.

`freezeRoom` stops rendering when nothing needs live scene frames. Closing,
photo handoffs, and inspected objects can still render. `useRoomFrame` scales
ambient callbacks during the transition and skips them at rest.
`InspectedObjectFrames` lets the selected prop's descendants run at normal
speed. Required handoff callbacks explicitly opt in. The shared scene clock
integrates speed into elapsed time, so shader animations and delta-driven
simulation stay in step without jumping when speed changes. Foreground
gestures, camera transitions, and physical handoffs retain real frame deltas.
The unit scheduler resolves its accumulated interval before applying the
background speed, so it cannot overwrite the slowdown.

The performance HUD is portaled above the modal layers at its last header
position. It stays visible as a passive readout while an overlay owns input.

The CR orb eases shared scene time toward twice speed while hovered, focused,
or held. Wind, water, camera drift, physics, and insects use that same time;
insects do not apply another multiplier. Overlay slowdown multiplies this
speed and can still bring it to zero. Foreground gestures retain real time.
The live **CR orb scene speed** checkbox disables the boost, and reduced
motion bypasses it. This extends the existing `ripple-effect` interaction.
It adds no separate qualifying action under Field Notes quality-bar test 2.

Photo viewers share `ImageZoomGestures`. Native non-passive listeners cancel
browser pinch zoom and route trackpad and Safari gestures to the active image.
Touchscreen handling stays with PhotoView; all zoom paths are capped at 3×.
Zoomed scene photos use the full viewport for clipping and pan limits, and
their caption moves into the bottom controls. At normal size, the caption
returns below the image. Covered viewers yield to the top overlay.

## Shared rules

- The newest overlay owns Escape. A second Escape during its exit cannot
  dismiss the parent. A focused select or menu receives Escape first.
- Layers follow registration order. Covered presentations become inert and
  hidden from assistive technology, unless they contain the active child.
- Background scrolling stays locked until the last DOM overlay leaves.
- Books, document sheets, and photo viewers use the coordinator's focus
  containment. Radix presentations retain their existing focus scope.
  Parents yield to children. Custom viewers restore focus after releasing.
- Room navigation and camera pointer tracking yield to DOM overlays.
  Release events still reach scene listeners so keys and drags cannot stick.
- Tooltips and popovers use the active overlay's floating layer. They do not
  independently take control of the room.
- Existing routes retain ownership of browser history. The coordinator
  dismisses through their callback and never modifies the URL itself.
- All backdrops over the live or illustrated room share a 16% tint, including
  mobile Field Notes. Standalone pages retain their reading and media backdrop
  colors. Blur stays with each viewer; reading panels still avoid it.

## Presentation families

| Kind          | Presentation and rendering                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`     | Compact, top-positioned search. Pauses after entry and the room-edge spring settles.                                                                  |
| `document`    | Books and reading sheets. Share modal motion and pause after entry; keep origin flights.                                                              |
| `image`       | Document photographs. Keep pinch, zoom, and gallery navigation. Pause the background renderer.                                                        |
| `scene-image` | Photographs inspected from the room. Render through the physical handoff, then freeze. In the illustrated room, keep the surrounding layout in place. |
| `video`       | Player and gallery controls. Shares document modal motion and the document image backdrop. Pauses the background renderer.                            |
| `album`       | Field Notes. Keeps the album and page turns interactive while the background pauses after entry.                                                      |
| `object`      | A prop brought toward the camera. Keeps rendering and pointer input needed to turn the selected prop; unrelated scene animation pauses.               |
| `drawer`      | Existing filter and share sheets. Pause after entry, keeping sheet motion and Radix focus handling.                                                   |

Motion settings live in `src/lib/overlays/motion.ts`. Reduced-motion visitors
skip DOM modal transforms; physical viewers retain their existing reduced-motion
paths. Background speed easing lives in `src/lib/overlays/backgroundMotion.ts`.
System and site reduced-motion settings bypass the ramp. Scene Diagnostics
provides the live **Gradual overlay pause** checkbox under Simulate, Camera.
The checkbox resets on reload and does not change production quality settings.
The disabled path does no easing work. New backdrop effects must still follow
the Scene Diagnostics policy.

## Adding a presentation

Put `OverlayPresence` inside the DOM retained by Radix, Framer Motion, or the
viewer engine, and supply its kind and dismissal callback. Mark a separate
preceding backdrop with `data-overlay-backdrop`. Shared shadcn sheets already
do this. Do not manage body overflow or add another global Escape listener.

Use `ownsOverlayInput` before any viewer-specific global keyboard work. Use
`surfaceRef` when a third-party viewer's callbacks can run while it is covered.
Keep selection, playback, URL changes, and authored animation inside the viewer.

Verify nested opening, dismissal during an exit, focus return, scroll cleanup,
and unmount during playback. A closing overlay must never wake the room under
another overlay. Ordinary checks use component tests, typecheck, and lint;
browser inspection requires an explicit request in this repository.

This change adds no discovery. Field Notes quality-bar test 1 rules it out:
the existing content remains the same, and shared dismissal behavior is not
something visitors need a discovery to find. Mode combinations add no new
content or meaningful qualifying action.
