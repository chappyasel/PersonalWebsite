"use client";

import { CheckIcon, LinkIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/**
 * The one copy-section-link affordance for every daylight section header —
 * routine and manual share this so the gesture never drifts between the
 * pages. A hover-revealed button (render inside an element carrying the
 * `group/sec` Tailwind group) that copies a shareable deep link, reflects it
 * in the address bar, and flashes an animated check. Keyboard-focusable, with
 * a tooltip naming the action.
 */
export default function AnchorLink({
  id,
  className = "",
  url,
}: {
  id: string;
  className?: string;
  /** The page's canonical URL when the address bar is not it (a book open
   * in a modal over the shelf or the homepage). The copied link is this
   * plus the fragment, and the address bar is left alone. */
  url?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const base =
        url ?? `${window.location.origin}${window.location.pathname}`;
      const link = `${base}#${id}`;
      if (!url) window.history.replaceState(null, "", `#${id}`);
      const flash = () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      };
      if (navigator.clipboard) {
        void navigator.clipboard.writeText(link).then(flash, () => undefined);
      } else {
        flash();
      }
    },
    [id, url],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy link to this section"
            className={`shrink-0 -translate-x-0.5 rounded-md p-1 text-muted-foreground/30 opacity-0 transition-all duration-200 hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 active:scale-[0.82] group-hover/sec:translate-x-0 group-hover/sec:opacity-100 ${className}`}
          >
            <span className="relative block h-[15px] w-[15px]">
              <AnimatePresence initial={false}>
                {copied ? (
                  <motion.span
                    key="check"
                    className="absolute inset-0"
                    initial={{ opacity: 0, scale: 0.3, rotate: -50 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{
                      opacity: 0,
                      scale: 0.5,
                      transition: { duration: 0.14, ease: "easeIn" },
                    }}
                    transition={{ type: "spring", stiffness: 520, damping: 21 }}
                  >
                    <CheckIcon
                      size={15}
                      weight="bold"
                      className="text-emerald-500"
                    />
                  </motion.span>
                ) : (
                  <motion.span
                    key="link"
                    className="absolute inset-0"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: 0.6,
                      transition: { duration: 0.1, ease: "easeIn" },
                    }}
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                  >
                    <LinkIcon size={15} weight="bold" />
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {copied ? "Link copied!" : "Copy link to section"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
