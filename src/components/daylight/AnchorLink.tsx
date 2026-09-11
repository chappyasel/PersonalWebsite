"use client";

import { CheckIcon, LinkIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";

import { sectionShareUrl } from "~/lib/site/sectionShare";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/**
 * The one copy-section-link affordance for every daylight section header —
 * routine and manual share this so the gesture never drifts between the
 * pages. A button revealed on mouse hover and hidden on touch devices.
 * Render inside the `group/sec` Tailwind group. It copies a shareable
 * deep link, reflects it in the address bar, and flashes an animated check.
 * Keyboard-focusable, with a tooltip naming the action.
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
      const link = sectionShareUrl(base, id);
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
            onKeyDown={(event) => event.stopPropagation()}
            aria-label="Copy link to this section"
            // Revealing content during touch-emulated hover can consume the
            // first tap in Safari before the section's click handler runs.
            className={`shrink-0 rounded-md p-1 text-muted-foreground/30 transition-all duration-200 active:scale-[0.82] [@media_not_all_and_(hover:hover)_and_(pointer:fine)]:hidden [@media_(hover:hover)_and_(pointer:fine)]:-translate-x-0.5 [@media_(hover:hover)_and_(pointer:fine)]:opacity-0 [@media_(hover:hover)_and_(pointer:fine)]:hover:bg-muted/60 [@media_(hover:hover)_and_(pointer:fine)]:hover:text-foreground [@media_(hover:hover)_and_(pointer:fine)]:focus-visible:opacity-100 [@media_(hover:hover)_and_(pointer:fine)]:group-hover/sec:translate-x-0 [@media_(hover:hover)_and_(pointer:fine)]:group-hover/sec:opacity-100 ${className}`}
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
