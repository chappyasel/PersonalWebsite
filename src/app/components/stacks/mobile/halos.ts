export const TOUCH_HALO_MIN_PX = 48;
export const TOUCH_EDGE_GUTTER_PX = 24;

export type ProjectedInteractionBounds = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  depth: number;
  priority?: number;
  exactHit?: boolean;
  visualLeft?: number;
  visualTop?: number;
  visualRight?: number;
  visualBottom?: number;
};

export function expandAndClipTouchHalo(
  bounds: ProjectedInteractionBounds,
  viewport: { width: number; height: number; sheetTop: number },
): ProjectedInteractionBounds | null {
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  const width = Math.max(TOUCH_HALO_MIN_PX, bounds.right - bounds.left);
  const height = Math.max(TOUCH_HALO_MIN_PX, bounds.bottom - bounds.top);
  const availableWidth = viewport.width - TOUCH_EDGE_GUTTER_PX * 2;
  const availableHeight = viewport.sheetTop - TOUCH_EDGE_GUTTER_PX;
  if (availableWidth <= 0 || availableHeight <= 0) return null;
  const clippedWidth = Math.min(width, availableWidth);
  const clippedHeight = Math.min(height, availableHeight);
  const left = Math.min(
    viewport.width - TOUCH_EDGE_GUTTER_PX - clippedWidth,
    Math.max(TOUCH_EDGE_GUTTER_PX, cx - clippedWidth / 2),
  );
  const right = left + clippedWidth;
  const top = Math.min(
    viewport.sheetTop - clippedHeight,
    Math.max(TOUCH_EDGE_GUTTER_PX, cy - clippedHeight / 2),
  );
  const bottom = top + clippedHeight;
  if (right <= left || bottom <= top) return null;
  return {
    ...bounds,
    visualLeft: bounds.left,
    visualTop: bounds.top,
    visualRight: bounds.right,
    visualBottom: bounds.bottom,
    left,
    right,
    top,
    bottom,
  };
}

function distanceToBounds(x: number, y: number, b: ProjectedInteractionBounds) {
  const dx = Math.max(
    (b.visualLeft ?? b.left) - x,
    0,
    x - (b.visualRight ?? b.right),
  );
  const dy = Math.max(
    (b.visualTop ?? b.top) - y,
    0,
    y - (b.visualBottom ?? b.bottom),
  );
  return Math.hypot(dx, dy);
}

/** Exact visible ray hit wins, followed by proximity, authored priority, and
 * finally camera depth. Stable id ordering prevents frame-to-frame flicker. */
export function resolveTouchHalo(
  x: number,
  y: number,
  bounds: ProjectedInteractionBounds[],
) {
  return (
    bounds
      .filter((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)
      .sort((a, b) => {
        if (Boolean(a.exactHit) !== Boolean(b.exactHit))
          return a.exactHit ? -1 : 1;
        const distance = distanceToBounds(x, y, a) - distanceToBounds(x, y, b);
        if (distance) return distance;
        const priority = (b.priority ?? 0) - (a.priority ?? 0);
        if (priority) return priority;
        return a.depth - b.depth || a.id.localeCompare(b.id);
      })[0] ?? null
  );
}
