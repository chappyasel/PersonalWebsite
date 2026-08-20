/** Coarse touch has no hover state, so forwarding its pointer moves into
 * React Three Fiber spends a scene-wide raycast without producing anything
 * the visitor can observe. Pointer down remains on the ordinary event path. */
export function shouldSkipSceneHoverRaycast(
  coarseTouch: boolean,
  event: Event,
) {
  return (
    coarseTouch &&
    "pointerType" in event &&
    (event as PointerEvent).pointerType === "touch"
  );
}

export function scenePointerMoveWithoutCoarseHover<TEvent extends Event>(
  coarseTouch: boolean,
  onPointerMove: (event: TEvent) => void,
) {
  return (event: TEvent) => {
    if (shouldSkipSceneHoverRaycast(coarseTouch, event)) return;
    onPointerMove(event);
  };
}
