export const DOOR_LABEL_VIEWPORT_GUTTER = 12;

export type DockBounds = { left: number; width: number };

/** A desktop dock remains mounted below 1200px, but CSS makes it display:none.
 * Its DOMRect is then {left: 0, width: 0}; treating that zero-width rectangle
 * as a safe-area edge clamps every label to the left gutter. */
export function doorLabelRightEdge(
  viewportWidth: number,
  dock: DockBounds | null,
) {
  const viewportRight = viewportWidth - DOOR_LABEL_VIEWPORT_GUTTER;
  return dock && dock.width > 0 && dock.left > DOOR_LABEL_VIEWPORT_GUTTER
    ? Math.min(viewportRight, dock.left - DOOR_LABEL_VIEWPORT_GUTTER)
    : viewportRight;
}

export function clampDoorLabelX(
  projectedX: number,
  labelWidth: number,
  viewportWidth: number,
  dock: DockBounds | null,
) {
  const half = Math.min(120, labelWidth / 2);
  const minimum = DOOR_LABEL_VIEWPORT_GUTTER + half;
  const maximum = Math.max(
    minimum,
    doorLabelRightEdge(viewportWidth, dock) - half,
  );
  return Math.max(minimum, Math.min(maximum, projectedX));
}
