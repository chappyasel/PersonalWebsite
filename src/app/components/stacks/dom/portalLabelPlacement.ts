export const PORTAL_LABEL_VIEWPORT_GUTTER = 12;

export type DockBounds = { left: number; width: number };
export type SheetBounds = { top: number; height: number };

/** A desktop dock remains mounted below 1200px, but CSS makes it display:none.
 * Its DOMRect is then {left: 0, width: 0}; treating that zero-width rectangle
 * as a safe-area edge clamps every label to the left gutter. */
export function portalLabelRightEdge(
  viewportWidth: number,
  dock: DockBounds | null,
) {
  const viewportRight = viewportWidth - PORTAL_LABEL_VIEWPORT_GUTTER;
  return dock && dock.width > 0 && dock.left > PORTAL_LABEL_VIEWPORT_GUTTER
    ? Math.min(viewportRight, dock.left - PORTAL_LABEL_VIEWPORT_GUTTER)
    : viewportRight;
}

export function clampPortalLabelX(
  projectedX: number,
  labelWidth: number,
  viewportWidth: number,
  dock: DockBounds | null,
) {
  const half = Math.min(120, labelWidth / 2);
  const minimum = PORTAL_LABEL_VIEWPORT_GUTTER + half;
  const maximum = Math.max(
    minimum,
    portalLabelRightEdge(viewportWidth, dock) - half,
  );
  return Math.max(minimum, Math.min(maximum, projectedX));
}

/** Mobile panels remain mounted on desktop inside a display:none wrapper.
 * Ignore that wrapper's zero rectangle rather than treating its top edge as
 * a collision boundary for every desktop label. */
export function clampPortalLabelY(
  projectedY: number,
  labelHeight: number,
  viewportHeight: number,
  sheet: SheetBounds | null,
) {
  const desiredY = projectedY - 10;
  const sheetTop = sheet && sheet.height > 0 ? sheet.top : viewportHeight;
  return Math.max(
    PORTAL_LABEL_VIEWPORT_GUTTER + labelHeight,
    Math.min(
      Math.min(
        viewportHeight - PORTAL_LABEL_VIEWPORT_GUTTER,
        sheetTop - PORTAL_LABEL_VIEWPORT_GUTTER,
      ),
      desiredY,
    ),
  );
}
