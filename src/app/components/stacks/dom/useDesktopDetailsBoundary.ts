"use client";

import { useStacks } from "../store";
import { type RefObject, useLayoutEffect } from "react";

export function useDesktopDetailsBoundary(
  dockRef: RefObject<HTMLDivElement | null>,
  hidden: boolean,
) {
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const publish = useStacks.getState().setDesktopDetailsLeftPx;
    if (!dock || hidden) {
      publish(null);
      return;
    }

    const measure = () => {
      const scroller = dock.querySelector<HTMLElement>(
        "[data-stacks-desktop-panel] .placard-scroll",
      );
      if (!scroller) {
        publish(null);
        return;
      }
      const paddingLeft = Number.parseFloat(
        window.getComputedStyle(scroller).paddingLeft,
      );
      // Every panel fills the dock. Measure its resting layout, not the
      // translated box during modal/chrome animations. Modal visibility must
      // not relocate the scene's tilt-shift line or remount its blur effect.
      const parentLeft = dock.offsetParent?.getBoundingClientRect().left ?? 0;
      publish(
        parentLeft +
          dock.offsetLeft +
          (Number.isFinite(paddingLeft) ? paddingLeft : 0),
      );
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(dock);
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
      publish(null);
    };
    // Every resident desktop scroller shares the same dock geometry and px-8
    // inset, so changing the active document cannot change this coordinate.
    // Re-measuring it at every unit crossing only forces layout during travel.
  }, [dockRef, hidden]);
}
