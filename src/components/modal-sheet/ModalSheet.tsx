"use client";

import { ArrowsOutSimpleIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import {
  originEntrance,
  originExit,
  takeModalOrigin,
} from "~/lib/originFlight";
import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";
import { cn } from "~/lib/utils";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

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

/**
 * The chrome for an intercepted route presented over the page that launched
 * it, in the book-notes modal's dress: centered card, the same shadow and
 * enter/exit motion (the origin pop when the launcher recorded a source
 * rect), and the same corner cluster — expand (a hard <a>, the books app's
 * trick for stepping out of an intercepted route into the real full page)
 * and close. The launching page stays alive underneath; the URL reads the
 * destination's, and Esc, the backdrop, or the X pop history back.
 *
 * `variant="document"` is a full-height reading surface (routine, manual, an
 * exercise page); `variant="card"` hugs its content (the workout preview).
 */
export default function ModalSheet({
  label,
  expandHref,
  variant = "document",
  className,
  onPresenceChange,
  children,
}: {
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
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(true);
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
  // layout — and only then does the hard navigation fire. The browser
  // paint-holds the old document until the new one is ready, so the swap
  // lands on a nearly identical frame. Mid-flight the sheet stops being a
  // sheet (attribute and caller class stripped), so chrome that hides
  // itself in-sheet — back links, theme toggles — is already back while
  // the card grows. Modified clicks and reduced motion fall through to the
  // plain <a>.
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
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    presenceRef.current?.(false);
    const root = shell.closest("[data-modal-sheet]");
    if (root instanceof HTMLElement) {
      root.removeAttribute("data-modal-sheet");
      if (className)
        root.classList.remove(...className.split(" ").filter(Boolean));
    }
    shell
      .querySelector("[data-sheet-cluster]")
      ?.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 160,
        fill: "forwards",
      });
    const rect = shell.getBoundingClientRect();
    // Pin the shell where it stands, then fly the box itself — a transform
    // would stretch the rendered pixels; animating the box reflows them.
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
      { duration: 420, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" },
    );
    flight.onfinish = () => window.location.assign(expandHref);
  };

  const close = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
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
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    // The page underneath keeps its scroll position; only the sheet scrolls.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
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
      const shell = shellRef.current;
      if (!shell) return;
      if (event.target instanceof Node && shell.contains(event.target)) return;
      shell.focus({ preventScroll: true });
    };
    const trapTab = (event: KeyboardEvent) => {
      if (isUniversalSearchOpen()) return;
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
          data-modal-sheet
          className={cn("fixed inset-0 z-50", className)}
        >
          {/* Dim only, no backdrop-filter: Chromium smears a backdrop blur
              across overlapping siblings after viewport resizes (the whole
              card went soft), and no layer pinning reliably kept the card
              out of that pass. */}
          <motion.div
            ref={backdropRef}
            className="absolute inset-0 bg-stone-900/70 dark:bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28 }}
            onClick={close}
          />
          <div
            className="absolute inset-0 flex items-center justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pt-[max(1.25rem,env(safe-area-inset-top))]"
            onClick={close}
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
              <div
                data-sheet-cluster
                className={cn(
                  "absolute z-10 flex items-center gap-2",
                  isCard ? "right-3 top-3" : "right-4 top-4",
                )}
              >
                <TooltipProvider>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      {/* A hard <a>, not Link: the full-page render must step
                          out of this intercepted route. The document variant
                          springs to the viewport first; the card's full page
                          is a narrow centered layout a fullscreen grow would
                          mismatch, so it navigates plainly. */}
                      <a
                        href={expandHref}
                        onClick={isCard ? undefined : expand}
                        className={cn(
                          "flex items-center justify-center rounded-full bg-muted shadow-sm transition-all duration-200 ease-in-out hover:bg-primary/20",
                          isCard ? "size-8" : "size-10",
                        )}
                        aria-label="Open full page"
                      >
                        <ArrowsOutSimpleIcon
                          size={isCard ? 16 : 20}
                          weight="bold"
                          className="text-primary"
                        />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Open full page</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={close}
                        className={cn(
                          "flex items-center justify-center rounded-full bg-muted shadow-sm transition-all duration-200 ease-in-out hover:bg-primary/20",
                          isCard ? "size-8" : "size-10",
                        )}
                        aria-label="Close"
                      >
                        <XIcon
                          size={isCard ? 16 : 20}
                          weight="bold"
                          className="text-primary"
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Close</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
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
