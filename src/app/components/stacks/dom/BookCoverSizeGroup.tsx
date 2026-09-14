"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

/** Current and recent books share one measured cover size. */
export function BookCoverSizeGroup({ children }: { children: ReactNode }) {
  const groupRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const details = group.querySelectorAll<HTMLElement>("[data-book-preview-details]");
    let frame: number | null = null;

    const measure = () => {
      frame = null;
      let height = 0;
      for (const detail of details) height = Math.max(height, detail.offsetHeight);
      // Hidden rows report zero. Keep the previous size while the panel is hidden.
      if (height === 0) return;
      const value = `${height}px`;
      if (group.style.getPropertyValue("--book-preview-cover-height") !== value) {
        group.style.setProperty("--book-preview-cover-height", value);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      // Cover width can reflow dates. Measure next frame, outside the observer
      // delivery, and let the following notification settle any changed wrapping.
      frame ??= requestAnimationFrame(measure);
    });
    for (const detail of details) observer.observe(detail);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [children]);

  return (
    <div ref={groupRef} className="placard-card-stack flex flex-col gap-4">
      {children}
    </div>
  );
}
