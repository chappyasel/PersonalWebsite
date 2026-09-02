export type PointerIntersection = Readonly<{
  eventObject: object;
}>;

/**
 * R3F tracks hover by intersected child mesh, then bubbles the event to the
 * interactive parent. Crossing between two meshes can therefore send the
 * parent a pointer-out even while the replacement mesh still hits that same
 * parent. Only release the parent's hover after every such hit is gone.
 */
export function pointerOutLeavesInteraction(
  eventObject: object,
  intersections: readonly PointerIntersection[],
) {
  return !intersections.some(
    (intersection) => intersection.eventObject === eventObject,
  );
}
