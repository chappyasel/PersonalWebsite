import { useLayoutEffect } from "react";

/** PhotoView portals are direct children of body. Observe that boundary, not
 * the room subtree: html:has(.PhotoView-Portal) combined with descendant chrome
 * rules makes unrelated content commits invalidate the entire resident UI. */
export function usePhotoViewerChrome() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    let portals: Element[] = [];
    const update = () => {
      const state = portals.some(
        (portal) => !portal.classList.contains("PhotoView-Slider__willClose"),
      )
        ? "open"
        : portals.length > 0
          ? "closing"
          : null;
      if (root.getAttribute("data-photo-view") === state) return;
      if (state) root.setAttribute("data-photo-view", state);
      else root.removeAttribute("data-photo-view");
    };
    const portalObserver = new MutationObserver(update);
    const observePortals = () => {
      portalObserver.disconnect();
      portals = Array.from(document.body.children).filter((child) =>
        child.classList.contains("PhotoView-Portal"),
      );
      for (const portal of portals) {
        portalObserver.observe(portal, { attributeFilter: ["class"] });
      }
      update();
    };
    const bodyObserver = new MutationObserver(observePortals);
    bodyObserver.observe(document.body, { childList: true });
    observePortals();
    return () => {
      bodyObserver.disconnect();
      portalObserver.disconnect();
      root.removeAttribute("data-photo-view");
    };
  }, []);
}
