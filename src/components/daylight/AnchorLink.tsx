"use client";

import { useCallback, useState } from "react";

import { CheckIcon, LinkIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";

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
}: {
  id: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      window.history.replaceState(null, "", `#${id}`);
      const flash = () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      };
      if (navigator.clipboard) {
        void navigator.clipboard.writeText(url).then(flash, () => undefined);
      } else {
        flash();
      }
    },
    [id],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy link to this section"
            className={`shrink-0 rounded-md p-1 text-muted-foreground/30 opacity-0 transition-all hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 group-hover/sec:opacity-100 ${className}`}
          >
            <span className="relative block h-[15px] w-[15px]">
              <AnimatePresence initial={false}>
                {copied ? (
                  <motion.span
                    key="check"
                    className="absolute inset-0"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.2 }}
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
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
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
