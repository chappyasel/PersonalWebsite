"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  originEntrance,
  originExit,
  takeModalOrigin,
} from "~/lib/originFlight";
import { closeOverlayChrome, openOverlayChrome } from "~/lib/overlayChrome";
import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";
import { cn } from "~/lib/utils";

import {
  SheetCloseControl,
  SheetControlCluster,
  SheetExpandControl,
} from "./SheetControls";
import { prefersFullPage } from "./sheetRoute";

/** True inside a mounted sheet. Content shared between a full page and its
 * intercepted presentation reads this to pick navigation style — e.g. the
 * variation picker soft-navigates in a sheet (staying in it) but
 * hard-navigates on the full page (where an intercepted modal over a full
 * page would be wrong). */
export const InModalSheetContext = createContext(false);

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableChildren(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    const style = getComputedStyle(element);
    return (
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  });
}

type ModalSheetProps = {
  label: string;
  expandHref: string;
  variant?: "document" | "card";
  className?: string;
  /** Fires true once the entrance has settled, false the moment a close
   * begins (and on unmount). The homepage wires this to the 3D world's
   * stand-down flag — a prop, so pages without the world never import its
   * store. */
  onPresenceChange?: (present: boolean) => void;
  children: ReactNode;
};

/**
 * The chrome for an intercepted route presented over the page that launched
 * it, in the book-notes modal's dress: centered card, the same shadow and
 * enter/exit motion (the origin pop when the launcher recorded a source
 * rect), and the same corner cluster — expand (the zero-navigation takeover;
 * the hard <a> underneath is only the modified-click/reduced-motion
 * fallback) and close. The launching page stays alive underneath; the URL
 * reads the destination's, and Esc, the backdrop, or the X pop history back.
 *
 * `variant="document"` is a full-height reading surface (routine, manual, an
 * exercise page); `variant="card"` hugs its content (the workout preview).
 *
 * On a phone-sized viewport there is no sheet at all. Launchers already make
 * a full-page load there (sheetRoute.ts), and this is the net under them:
 * interception is implicit — any soft navigation to the route mounts this —
 * so a launcher that skipped the check, or a back/forward restore after a
 * resize, would otherwise present the cramped card. The soft navigation has
 * already put the destination URL in history, so a replace lands on the full
 * page with back still on the launcher. Nothing renders meanwhile; the
 * launching page stays up until the document changes.
 */
export default function ModalSheet(props: ModalSheetProps) {
  const [bypassed] = useState(prefersFullPage);
  useEffect(() => {
    if (bypassed) window.location.replace(props.expandHref);
  }, [bypassed, props.expandHref]);
  if (bypassed) return null;
  return <PresentedSheet {...props} />;
}

function PresentedSheet({
  label,
  expandHref,
  variant = "document",
  className,
  onPresenceChange,
  children,
}: ModalSheetProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(true);
  // Expanded = the sheet has taken over the viewport and IS the page now:
  // same URL, no navigation. The sheet attribute and caller class come off
  // so in-sheet-hidden chrome (back links, theme toggles) returns.
  const [expanded, setExpanded] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const presenceRef = useRef(onPresenceChange);
  presenceRef.current = onPresenceChange;
  // Where the click came from, when the launcher recorded it. Intercepted
  // routes only ever mount on client navigations, so reading storage in the
  // initializer is safe.
  const [origin] = useState(() =>
    typeof window === "undefined" ? null : takeModalOrigin(),
  );

  // The iOS-pop expand: the card's real box springs out to the viewport —
  // content reflowing live, so by the end the card IS the full page's
  // layout — and then it simply STAYS. No navigation: the URL already reads
  // the destination, so the takeover is purely presentational, and back (or
  // Esc, or the content's own back link) still pops to the launcher. The
  // sheet stops being a sheet at flight start, so chrome that hides itself
  // in-sheet — back links, theme toggles — returns while the card grows.
  // Modified clicks and reduced motion fall through to the plain <a>, the
  // real full-page load.
  const expand = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    const shell = shellRef.current;
    if (!shell) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    if (isClosingRef.current || expanded) return;
    // Block close attempts only while the flight runs.
    isClosingRef.current = true;
    setExpanded(true);
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 420,
      easing: "ease",
      fill: "forwards",
    });
    const rect = shell.getBoundingClientRect();
    // Pin the shell where it stands, then fly the box itself — a transform
    // would stretch the rendered pixels; animating the box reflows them.
    // vw/dvh land as the resting inline styles so later viewport resizes
    // keep the takeover full-bleed.
    Object.assign(shell.style, {
      position: "fixed",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      maxWidth: "none",
      maxHeight: "none",
      margin: "0",
    });
    const flight = shell.animate(
      [
        {
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          borderRadius: "1rem",
        },
        {
          top: "0px",
          left: "0px",
          width: "100vw",
          height: "100dvh",
          borderRadius: "0rem",
        },
      ],
      { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    flight.onfinish = () => {
      Object.assign(shell.style, {
        top: "0px",
        left: "0px",
        width: "100vw",
        height: "100dvh",
        borderRadius: "0",
      });
      isClosingRef.current = false;
    };
  };

  // The world's chrome is held down for as long as the sheet owns the screen,
  // and released the moment a close begins so it is already returning while
  // the card flies home. Idempotent: the unmount path releases it too, for the
  // closes that never run through `close` (a back button, a hard navigation).
  const overlayHeldRef = useRef(false);
  const releaseOverlayChrome = () => {
    if (!overlayHeldRef.current) return;
    overlayHeldRef.current = false;
    closeOverlayChrome();
  };

  const close = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    releaseOverlayChrome();
    // The launcher un-suspends NOW, so the source card is already back on
    // the page while the sheet flies home onto it instead of popping in
    // after.
    presenceRef.current?.(false);
    const shell = shellRef.current;
    if (
      origin &&
      shell &&
      originExit(shell, origin, backdropRef.current, () => router.back())
    ) {
      return;
    }
    setOpen(false);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Dismissing on a backdrop click is anchored to where the press STARTED.
  // A bare `onClick={close}` on the backdrop closes the sheet for any click
  // React routes there, and a click is routed to the nearest common ancestor
  // of the press and the release — so a press on something inside the sheet
  // that unmounts under the pointer (a section collapsing, a toggle's exit
  // animation) or a text selection that drifts past the card's edge both
  // land on the backdrop and take the sheet down with them. Arming on
  // pointerdown means only a press that began on the backdrop can dismiss.
  const dismissArmedRef = useRef(false);
  const armDismiss = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target;
    dismissArmedRef.current = !(
      target instanceof Node && shellRef.current?.contains(target)
    );
  };
  const dismissIfArmed = (event: ReactMouseEvent<HTMLDivElement>) => {
    const armed = dismissArmedRef.current;
    dismissArmedRef.current = false;
    const target = event.target;
    if (!armed) return;
    if (target instanceof Node && shellRef.current?.contains(target)) return;
    close();
  };

  // Book-notes-style origin pop: the card starts as the source rect and
  // grows into place. WAAPI instead of framer for the entrance so the final
  // rect can be measured untransformed; framer still owns the exit.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell || !origin) return;
    originEntrance(shell, origin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isUniversalSearchOpen()) return;
      if (document.querySelector('[data-book-modal-shell="document"]')) return;
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    // The page underneath keeps its scroll position; only the sheet scrolls.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Raised at mount, not with presence: the chrome has to be on its way out
    // while the card grows, or it snaps off half a second late. The placard
    // dock is the one piece that waits, and it waits in CSS (StacksHome), so
    // the card still has a live source card to grow out of.
    overlayHeldRef.current = true;
    openOverlayChrome();
    // Presence is raised AFTER the entrance: on the homepage the world's
    // placards suspend themselves on it, and the source card must stay put
    // under the growing sheet — half a second of live launcher is harmless.
    const raise = window.setTimeout(() => presenceRef.current?.(true), 540);
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() => shellRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      window.clearTimeout(raise);
      releaseOverlayChrome();
      presenceRef.current?.(false);
      cancelAnimationFrame(frame);
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, []);

  // `aria-modal` describes a boundary; it does not create one. Keep both
  // sequential and programmatic focus inside the dialog while it is open —
  // same local trap as the books modal, so it works over any launcher.
  useEffect(() => {
    const containFocus = (event: FocusEvent) => {
      if (isUniversalSearchOpen()) return;
      if (document.querySelector('[data-book-modal-shell="document"]')) return;
      const shell = shellRef.current;
      if (!shell) return;
      if (event.target instanceof Node && shell.contains(event.target)) return;
      shell.focus({ preventScroll: true });
    };
    const trapTab = (event: KeyboardEvent) => {
      if (isUniversalSearchOpen()) return;
      if (document.querySelector('[data-book-modal-shell="document"]')) return;
      if (event.key !== "Tab") return;
      const shell = shellRef.current;
      if (!shell) return;
      const focusable = focusableChildren(shell);
      const first = focusable[0];
      const last = focusable.at(-1);
      const active = document.activeElement;

      if (!first || !last) {
        event.preventDefault();
        shell.focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && (active === shell || active === first)) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("focusin", containFocus);
    window.addEventListener("keydown", trapTab);
    return () => {
      document.removeEventListener("focusin", containFocus);
      window.removeEventListener("keydown", trapTab);
    };
  }, []);

  const isCard = variant === "card";

  return (
    <AnimatePresence onExitComplete={() => router.back()}>
      {open && (
        <div
          data-modal-sheet={expanded ? undefined : ""}
          className={cn("fixed inset-0 z-50", !expanded && className)}
        >
          {/* Dim only, no backdrop-filter: Chromium smears a backdrop blur
              across overlapping siblings after viewport resizes (the whole
              card went soft), and no layer pinning reliably kept the card
              out of that pass. */}
          <motion.div
            ref={backdropRef}
            className={cn(
              "absolute inset-0 bg-stone-900/70 dark:bg-black/70",
              expanded && "pointer-events-none",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28 }}
            onPointerDown={armDismiss}
            onClick={dismissIfArmed}
          />
          <div
            className="absolute inset-0 flex items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pt-[max(1.25rem,env(safe-area-inset-top))]"
            onPointerDown={armDismiss}
            onClick={dismissIfArmed}
          >
            <motion.div
              ref={shellRef}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className={cn(
                "relative w-full overflow-hidden rounded-2xl bg-background shadow-[0px_10px_50px_10px_rgba(0,0,0,0.25)] outline-none",
                isCard
                  ? "flex max-h-full max-w-[27.5rem] flex-col"
                  : "h-full max-w-5xl",
              )}
              onClick={(event) => event.stopPropagation()}
              initial={
                origin || reduceMotion
                  ? false
                  : { opacity: 0, scale: 0.965, y: 14 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.982, y: 8 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.34, ease: [0.16, 1, 0.3, 1] }
              }
            >
              {!expanded && (
                <SheetControlCluster
                  className={cn(
                    "absolute z-10",
                    isCard ? "right-3 top-3" : "right-4 top-4",
                  )}
                >
                  <SheetExpandControl
                    href={expandHref}
                    onClick={expand}
                    size={isCard ? "compact" : "regular"}
                  />
                  <SheetCloseControl
                    onClick={close}
                    size={isCard ? "compact" : "regular"}
                  />
                </SheetControlCluster>
              )}
              <div
                data-modal-scroller
                className={cn(
                  "overflow-y-auto overscroll-contain",
                  isCard ? "min-h-0 flex-1" : "h-full",
                )}
              >
                <InModalSheetContext.Provider value={true}>
                  {children}
                </InModalSheetContext.Provider>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
