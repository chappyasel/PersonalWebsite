"use client";

import { ArrowsOutSimpleIcon, XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { useStacks } from "~/app/components/stacks/store";

import { takeSheetOrigin } from "./sheetOrigin";

/**
 * A document page presented over the page that launched it, in the book-notes
 * modal's own dress: centered card, the same shadow and enter/exit motion,
 * and the same corner cluster — expand (a hard <a>, the books app's trick
 * for stepping out of an intercepted route into the real full page) and
 * close. The launching page — including a booted 3D world — stays alive
 * underneath; the URL still reads /routine, and Esc, the backdrop, or the X
 * pop history back to the untouched scene. The page's own theme toggle is
 * hidden in here (daylight.css) — the corner belongs to this cluster and the
 * theme follows the scene beneath.
 */
export default function DaylightSheet({
  label,
  expandHref,
  children,
}: {
  label: string;
  expandHref: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(true);
  const shellRef = useRef<HTMLDivElement>(null);
  // Where the click came from, when the launcher recorded it. Intercepted
  // routes only ever mount on client navigations, so reading storage in the
  // initializer is safe.
  const [origin] = useState(() =>
    typeof window === "undefined" ? null : takeSheetOrigin(),
  );

  const close = () => setOpen(false);

  // Book-notes-style origin pop: the card starts as the source rect and
  // grows into place. WAAPI instead of framer for the entrance so the final
  // rect can be measured untransformed; framer still owns the exit.
  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell || !origin) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const final = shell.getBoundingClientRect();
    if (final.width === 0) return;
    const scale = Math.max(origin.w / final.width, 0.1);
    const dx = origin.l + origin.w / 2 - (final.left + final.width / 2);
    const dy = origin.t + origin.h / 2 - (final.top + final.height / 2);
    shell.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          opacity: 0.35,
        },
        { transform: "none", opacity: 1 },
      ],
      { duration: 460, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // The page underneath keeps its scroll position; only the sheet scrolls.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The 3D world's scroll rig listens at the window and would keep flying
    // the camera under the sheet. modalOpen is the book modal's own stand-down
    // signal (ScrollBridges bails on it); on non-world pages nothing
    // subscribes and the flag is inert.
    useStacks.getState().setModalOpen(true);
    const frame = requestAnimationFrame(() => shellRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      useStacks.getState().setModalOpen(false);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <AnimatePresence onExitComplete={() => router.back()}>
      {open && (
        <div className="dl-sheet fixed inset-0 z-50">
          {/* Dim only, no backdrop-filter: Chromium smears a backdrop blur
              across overlapping siblings after viewport resizes (the whole
              card went soft), and no layer pinning reliably kept the card
              out of that pass. */}
          <motion.div
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
              className="relative h-full w-full max-w-5xl overflow-hidden rounded-2xl bg-background shadow-[0px_10px_50px_10px_rgba(0,0,0,0.25)] outline-none"
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
              <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      {/* A hard <a>, not Link: the full-page render must step
                          out of this intercepted route. */}
                      <a
                        href={expandHref}
                        className="flex size-10 items-center justify-center rounded-full bg-muted shadow-sm transition-all duration-200 ease-in-out hover:bg-primary/20"
                        aria-label="Open full page"
                      >
                        <ArrowsOutSimpleIcon
                          size={20}
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
                        className="flex size-10 items-center justify-center rounded-full bg-muted shadow-sm transition-all duration-200 ease-in-out hover:bg-primary/20"
                        aria-label="Close"
                      >
                        <XIcon size={20} weight="bold" className="text-primary" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Close</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div
                data-dl-scroller
                className="h-full overflow-y-auto overscroll-contain"
              >
                {children}
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
