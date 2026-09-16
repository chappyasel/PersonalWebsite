"use client";

import { useLayoutEffect, useRef } from "react";
import type { OverlayRenderProps } from "react-photo-view/dist/types";

import { ownsOverlayInput } from "~/lib/overlays/coordinator";

type GestureEvent = Event & { scale: number };
export const IMAGE_MAX_ZOOM = 3;
const clampScale = (scale: number) =>
  Math.max(1, Math.min(IMAGE_MAX_ZOOM, scale));

/** Keep browser pinch zoom inside the active photo viewer. Touchscreen pinch
 * and ordinary image dragging remain owned by react-photo-view. */
export function ImageZoomGestures({
  scale,
  onScale,
  visible,
  index,
}: Pick<OverlayRenderProps, "scale" | "onScale" | "visible" | "index">) {
  const marker = useRef<HTMLSpanElement>(null);
  const current = useRef({ scale, onScale, visible });
  useLayoutEffect(() => {
    const bounded = clampScale(scale);
    current.current = { scale: bounded, onScale, visible };
    marker.current
      ?.closest<HTMLElement>(".PhotoView-Portal")
      ?.style.setProperty(
        "--image-stage-zoom-weight",
        String(Math.max(0, 1 - (bounded - 1) / 0.2)),
      );
    // Also bound the viewer's own wheel, double-click, and touchscreen paths.
    if (visible && scale !== bounded) onScale(bounded);
  }, [scale, onScale, visible]);

  useLayoutEffect(() => {
    const surface = marker.current?.closest<HTMLElement>(".PhotoView-Portal");
    if (!surface) return;
    let gestureScale: number | null = null;
    let touchPinch = false;
    const zoom = (next: number) => {
      if (!current.current.visible || !Number.isFinite(next)) return;
      const bounded = clampScale(next);
      current.current.scale = bounded;
      current.current.onScale(bounded);
    };
    const claim = (event: Event) => {
      if (!ownsOverlayInput(surface)) return false;
      // React's delegated wheel listener is passive. A native non-passive
      // listener is needed to cancel page zoom before forwarding image zoom.
      event.preventDefault();
      event.stopPropagation();
      return true;
    };
    const wheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !claim(event)) return;
      // Some Safari versions emit both event families for one pinch.
      if (gestureScale !== null || touchPinch) return;
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? surface.clientHeight
            : 1;
      zoom(current.current.scale * Math.exp(-event.deltaY * unit * 0.01));
    };
    const gestureStart = (event: Event) => {
      if (!claim(event)) return;
      gestureScale = current.current.scale;
    };
    const gestureChange = (event: Event) => {
      if (!claim(event) || touchPinch || gestureScale === null) return;
      const factor = (event as GestureEvent).scale;
      if (factor > 0) zoom(gestureScale * factor);
    };
    const gestureEnd = (event: Event) => {
      if (gestureScale !== null) claim(event);
      gestureScale = null;
    };
    const touch = (event: TouchEvent) => {
      touchPinch = event.touches.length >= 2;
    };
    const options = { capture: true, passive: false };
    surface.addEventListener("wheel", wheel, options);
    surface.addEventListener("gesturestart", gestureStart, options);
    surface.addEventListener("gesturechange", gestureChange, options);
    surface.addEventListener("gestureend", gestureEnd, options);
    surface.addEventListener("touchstart", touch, {
      capture: true,
      passive: true,
    });
    surface.addEventListener("touchend", touch, {
      capture: true,
      passive: true,
    });
    surface.addEventListener("touchcancel", touch, {
      capture: true,
      passive: true,
    });
    return () => {
      surface.style.removeProperty("--image-stage-zoom-weight");
      surface.removeEventListener("wheel", wheel, true);
      surface.removeEventListener("gesturestart", gestureStart, true);
      surface.removeEventListener("gesturechange", gestureChange, true);
      surface.removeEventListener("gestureend", gestureEnd, true);
      surface.removeEventListener("touchstart", touch, true);
      surface.removeEventListener("touchend", touch, true);
      surface.removeEventListener("touchcancel", touch, true);
    };
  }, [index]);
  return (
    <span
      ref={marker}
      hidden
      aria-hidden
      data-image-zoomed={scale > 1.01 ? "" : undefined}
    />
  );
}
