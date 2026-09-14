/** Observe native horizontal travel without capturing pointers or cancelling
 * scrolling. Only a separate, forceful outward swipe opens search. */
export function listenForLeftEdgeSearch({
  target,
  canStart,
  canFinish,
  openSearch,
  viewportWidth,
}: {
  target: Window;
  canStart: (touch: Touch, target: EventTarget | null) => boolean;
  canFinish: () => boolean;
  openSearch: () => void;
  viewportWidth: () => number;
}) {
  let swipe: {
    id: number;
    x: number;
    y: number;
    at: number;
    farthestX: number;
    distance: number;
  } | null = null;
  const cancel = () => {
    swipe = null;
  };
  const start = (event: TouchEvent) => {
    cancel();
    const touch = event.touches[0];
    // Leave the browser's edge-back gesture and all multi-touch gestures alone.
    if (
      event.defaultPrevented ||
      event.touches.length !== 1 ||
      !touch ||
      touch.clientX < 28 ||
      !canStart(touch, event.target)
    )
      return;
    swipe = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      at: event.timeStamp,
      farthestX: touch.clientX,
      distance: Math.max(112, Math.min(160, viewportWidth() * 0.3)),
    };
  };
  const move = (event: TouchEvent) => {
    if (!swipe) return;
    const touch = Array.from(event.touches).find(
      (touch) => touch.identifier === swipe?.id,
    );
    if (event.touches.length !== 1 || !touch || !canFinish()) return cancel();
    const dx = touch.clientX - swipe.x;
    const dy = Math.abs(touch.clientY - swipe.y);
    if (dy > 24 && dy * 2.5 > Math.abs(dx)) return cancel();
    if (touch.clientX < swipe.farthestX - 24) return cancel();
    swipe.farthestX = Math.max(swipe.farthestX, touch.clientX);
  };
  const end = (event: TouchEvent) => {
    const current = swipe;
    cancel();
    if (!current || event.touches.length !== 0 || !canFinish()) return;
    const touch = Array.from(event.changedTouches).find(
      (touch) => touch.identifier === current.id,
    );
    if (!touch) return;
    const dx = touch.clientX - current.x;
    const dy = Math.abs(touch.clientY - current.y);
    const elapsed = event.timeStamp - current.at;
    if (
      elapsed > 0 &&
      elapsed <= 450 &&
      dx >= current.distance &&
      dx >= dy * 2.5 &&
      dx / elapsed >= 0.65 &&
      touch.clientX >= current.farthestX - 24
    )
      openSearch();
  };
  target.addEventListener("touchstart", start, { passive: true });
  target.addEventListener("touchmove", move, { passive: true });
  target.addEventListener("touchend", end, { passive: true });
  target.addEventListener("touchcancel", cancel, { passive: true });
  target.addEventListener("blur", cancel);
  return () => {
    cancel();
    target.removeEventListener("touchstart", start);
    target.removeEventListener("touchmove", move);
    target.removeEventListener("touchend", end);
    target.removeEventListener("touchcancel", cancel);
    target.removeEventListener("blur", cancel);
  };
}
