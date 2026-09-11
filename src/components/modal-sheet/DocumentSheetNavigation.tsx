"use client";

import { useRouter } from "next/navigation";
import {
  type ReactNode,
  createContext,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import { originZoomGeometry } from "~/app/components/route-transition-prototype/originZoom";
import "~/app/components/route-transition-prototype/prototype.css";
import { useRouteTransitionPrototype } from "~/app/components/route-transition-prototype/store";

export const DocumentSheetNavigationContext = createContext<
  ((href: string, source: HTMLElement) => boolean) | null
>(null);

/** The sheet owns navigation and history; only its reading area participates
 * in the same source reveal used for full pages. */
export default function DocumentSheetNavigation({
  documentPath,
  children,
}: {
  documentPath: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pending = useRef<{
    path: string;
    resolve: (ready: boolean) => void;
  } | null>(null);
  const active = useRef<((completeNavigation?: boolean) => void) | null>(null);

  useLayoutEffect(() => {
    if (pending.current?.path === documentPath) pending.current.resolve(true);
  }, [documentPath]);

  useEffect(() => {
    const unsubscribe = useRouteTransitionPrototype.subscribe((state) => {
      if (!state.enabled) active.current?.(true);
    });
    return () => {
      unsubscribe();
      active.current?.();
    };
  }, []);

  function navigate(href: string, source: HTMLElement) {
    const path = new URL(href, location.href).pathname;
    if (
      path === documentPath ||
      !useRouteTransitionPrototype.getState().enabled ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return false;
    if (active.current) return true;
    const scroller = source.closest<HTMLElement>("[data-modal-scroller]");
    if (!scroller) return false;
    const frame = scroller.getBoundingClientRect();
    if (!frame.width || !frame.height) return false;
    const link = source.getBoundingClientRect();
    const geometry = originZoomGeometry(
      {
        left: link.left - frame.left,
        top: link.top - frame.top,
        width: link.width,
        height: link.height,
      },
      frame.width,
      frame.height,
    );
    const root = document.documentElement;
    const previousName = scroller.style.viewTransitionName;
    let native: ViewTransition | undefined;
    let animation: Animation | undefined;
    let animationDeadline: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    let issued = false;
    let release!: (ready: boolean) => void;
    const committed = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    pending.current = { path, resolve: release };
    const deadline = setTimeout(() => cleanup(true), 10_000);
    const cleanup = (completeNavigation = false) => {
      if (cancelled) return;
      if (completeNavigation && !issued) {
        issued = true;
        startTransition(() => router.replace(href));
      }
      cancelled = true;
      clearTimeout(deadline);
      clearTimeout(animationDeadline);
      release(false);
      native?.skipTransition();
      animation?.cancel();
      scroller.style.viewTransitionName = previousName;
      delete root.dataset.sheetNavigation;
      root.style.removeProperty("--sheet-origin-zoom");
      root.style.removeProperty("--sheet-origin-clip");
      pending.current = null;
      active.current = null;
    };
    active.current = cleanup;
    const commit = async () => {
      if (cancelled) return false;
      issued = true;
      startTransition(() => router.replace(href));
      return committed;
    };
    void (async () => {
      try {
        if (typeof document.startViewTransition === "function") {
          scroller.style.viewTransitionName = "sheet-document";
          root.dataset.sheetNavigation = "";
          root.style.setProperty("--sheet-origin-zoom", geometry.zoom);
          root.style.setProperty("--sheet-origin-clip", geometry.clip);
          native = document.startViewTransition(async () => {
            if (!(await commit())) native?.skipTransition();
          });
          // A cold route may exceed the browser's capture deadline. Navigation
          // still commits, even when that browser skips its snapshot animation.
          void native.ready.catch(() => undefined);
          await Promise.allSettled([
            native.updateCallbackDone,
            native.finished,
          ]);
        } else if (await commit()) {
          if (cancelled || typeof scroller.animate !== "function") return;
          animation = scroller.animate(
            [
              { clipPath: geometry.clip, opacity: 0, offset: 0 },
              { opacity: 1, offset: 0.12 },
              {
                clipPath: "inset(0px 0px 0px 0px round 0px)",
                opacity: 1,
                offset: 1,
              },
            ],
            { duration: 620, easing: "cubic-bezier(.22,1,.36,1)" },
          );
          await Promise.race([
            animation.finished.catch(() => undefined),
            new Promise<void>((resolve) => {
              animationDeadline = setTimeout(resolve, 1120);
            }),
          ]);
        }
      } catch {
        if (!issued && !cancelled) startTransition(() => router.replace(href));
      } finally {
        cleanup();
      }
    })();
    return true;
  }

  return (
    <DocumentSheetNavigationContext.Provider value={navigate}>
      {children}
    </DocumentSheetNavigationContext.Provider>
  );
}
