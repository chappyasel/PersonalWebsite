"use client";

import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { overlayCoordinator } from "~/lib/overlays/coordinator";

import { useOverlayState } from "~/components/overlays/OverlayPresence";

/** Keep the readout at its header position when the header recedes for a modal. */
export function PersistentHud({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const overlay = useOverlayState();
  const mounted = position !== null;

  useLayoutEffect(() => {
    const element = anchor.current;
    if (!element) return;
    const place = () => {
      // Keep the last header position during its exit/return transforms.
      if (placed.current && overlayCoordinator.getSnapshot().depth > 0) return;
      const { left, top } = element.getBoundingClientRect();
      placed.current = true;
      setPosition((previous) =>
        previous?.left === left && previous.top === top
          ? previous
          : { left, top },
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    const header = element.closest(".stacks-wordmark");
    header?.addEventListener("transitionend", place);
    header?.addEventListener("animationend", place);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      header?.removeEventListener("transitionend", place);
      header?.removeEventListener("animationend", place);
      window.removeEventListener("resize", place);
    };
  }, []);

  useLayoutEffect(() => {
    if (!content.current || !anchor.current) return;
    const measure = () => {
      if (anchor.current && content.current)
        anchor.current.style.height = `${content.current.offsetHeight}px`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [mounted]);

  return (
    <>
      <div ref={anchor} aria-hidden style={{ width: 168, flexShrink: 0 }} />
      {position &&
        createPortal(
          <div
            ref={content}
            data-persistent-performance-hud=""
            inert={overlay.depth > 0}
            style={{
              position: "fixed",
              left: `clamp(8px, ${position.left}px, calc(100vw - 176px))`,
              top: `clamp(8px, ${position.top}px, calc(100dvh - 80px))`,
              zIndex:
                overlay.depth > 0 ? "var(--overlay-floating-layer, 5100)" : 60,
              pointerEvents: overlay.depth > 0 ? "none" : "auto",
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
