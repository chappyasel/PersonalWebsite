export const DOOR_LABEL_VIEWPORT_GUTTER = 12;

export type DockBounds = { left: number; width: number };
export type SheetBounds = { top: number; height: number };

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

/** Mobile panels remain mounted on desktop inside a display:none wrapper.
 * Ignore that wrapper's zero rectangle rather than treating its top edge as
 * a collision boundary for every desktop label. */
export function clampDoorLabelY(
  projectedY: number,
  labelHeight: number,
  viewportHeight: number,
  sheet: SheetBounds | null,
) {
  const desiredY = projectedY - 10;
  const sheetTop = sheet && sheet.height > 0 ? sheet.top : viewportHeight;
  return Math.max(
    DOOR_LABEL_VIEWPORT_GUTTER + labelHeight,
    Math.min(
      Math.min(
        viewportHeight - DOOR_LABEL_VIEWPORT_GUTTER,
        sheetTop - DOOR_LABEL_VIEWPORT_GUTTER,
      ),
      desiredY,
    ),
  );
}
