/**
 * The layout gizmo's handles win the hit test even when a prop stands in
 * front of them.
 *
 * React Three Fiber sorts intersections by distance and then walks them in
 * order, stopping at the first handler that calls `stopPropagation`. Both
 * sides of the layout editor do: drei's `PivotControls` stops the press that
 * starts a drag, and `Grabbable`'s group stops the press that selects a prop.
 * So whichever surface the ray reaches FIRST owns the gesture, and a prop
 * standing between the camera and an arrow quietly takes every press aimed at
 * that arrow. The gizmo already draws over everything (`depthTest={false}`),
 * which is what makes the failure so confusing: the handle is right there, lit
 * and hovering, and pressing it selects the shampoo bottle in front of it.
 *
 * Distance is the wrong answer for a tool that is deliberately drawn on top.
 * This moves the gizmo's own hits to the front of the list and leaves
 * everything else in its existing order, so a press anywhere on a handle
 * reaches the handle.
 */
type HitTarget = { readonly parent: HitTarget | null };

export function promoteGizmoIntersections<T extends { object: HitTarget }>(
  items: readonly T[],
  gizmoRoot: HitTarget | null,
): readonly T[] {
  if (!gizmoRoot || items.length < 2) return items;

  const belongsToGizmo = (item: T) => {
    let node: HitTarget | null = item.object;
    while (node) {
      if (node === gizmoRoot) return true;
      node = node.parent;
    }
    return false;
  };

  // Nothing to do in the common cases: no gizmo hit at all (the pointer is
  // somewhere else entirely) or one that already won on distance.
  const first = items.findIndex(belongsToGizmo);
  if (first <= 0) return items;

  return [
    ...items.filter(belongsToGizmo),
    ...items.filter((item) => !belongsToGizmo(item)),
  ];
}
