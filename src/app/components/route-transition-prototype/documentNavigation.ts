import { peekModalOrigin } from "~/lib/originFlight";

import { DOCUMENT_TRANSITION_KEY } from "./documentBootstrap";
import { prototypeDestination } from "./navigation";
import { type OriginRect, originZoomGeometry } from "./originZoom";
import { useRouteTransitionPrototype } from "./store";

/** Load the real page, preserving the signature without mounting an intercepted
 * sheet. Native document snapshots use the same keyframes as the app router;
 * the incoming page supplies a clip reveal when snapshots are unavailable. */
export function navigateFullDocument(
  href: string,
  {
    replace = false,
    source,
  }: { replace?: boolean; source?: HTMLElement | OriginRect | null } = {},
) {
  const destination = prototypeDestination(href, window.location.href);
  if (destination) {
    const enabled =
      useRouteTransitionPrototype.getState().enabled &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let geometry: ReturnType<typeof originZoomGeometry> | undefined;
    if (enabled) {
      const origin =
        source && "getBoundingClientRect" in source
          ? source.getBoundingClientRect()
          : source;
      const modal = !origin ? peekModalOrigin() : null;
      geometry = originZoomGeometry(
        origin ??
          (modal
            ? {
                left: modal.l,
                top: modal.t,
                width: modal.w,
                height: modal.h,
              }
            : null),
        window.innerWidth,
        window.innerHeight,
      );
    }
    const rect = geometry?.rect;
    const fallbackClip = rect
      ? `inset(${rect.top}px calc(100% - ${rect.left + rect.width}px) calc(100% - ${rect.top + rect.height}px) ${rect.left}px round 16px)`
      : undefined;
    try {
      window.sessionStorage.setItem(
        DOCUMENT_TRANSITION_KEY,
        JSON.stringify({
          from: window.location.href,
          to: destination.href,
          at: Date.now(),
          enabled,
          clip: geometry?.clip,
          fallbackClip,
          zoom: geometry?.zoom,
        }),
      );
    } catch {
      /* Native transitions can still use a centered source. */
    }
  }
  const target = destination?.href ?? href;
  if (replace) window.location.replace(target);
  else window.location.assign(target);
}
