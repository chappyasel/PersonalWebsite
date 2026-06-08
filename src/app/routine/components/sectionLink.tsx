"use client";

import { useCallback, useEffect, useState } from "react";

import { CheckIcon, LinkIcon } from "@phosphor-icons/react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/**
 * Scrolls to (and optionally expands) a section when the URL hash matches its
 * id — on initial load and on subsequent hashchange events. Pass `setOpen` for
 * collapsible sections so a deep link auto-expands them.
 */
export function useHashTarget(id: string, setOpen?: (open: boolean) => void) {
  useEffect(() => {
    function handle() {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (hash !== id) return;
      setOpen?.(true);
      const scrollToEl = () =>
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      // Scroll once immediately, then again after the expand animation
      // settles — the section's own content adds the room needed to bring
      // its header to the top. scroll-margin-top clears the sticky TOC.
      requestAnimationFrame(scrollToEl);
      window.setTimeout(scrollToEl, 380);
    }
    handle();
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, [id, setOpen]);
}

/**
 * Strip the URL fragment without triggering a navigation or scroll. Called when
 * a section is manually toggled so the CSS `:target` rule stops forcing it open.
 */
export function releaseHash() {
  if (typeof window !== "undefined" && window.location.hash) {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
}

/**
 * Trailing spacer that only takes up height when the page is loaded with (or
 * navigated to) a hash. Gives near-bottom sections enough room below to scroll
 * their header to the top, without adding blank space during normal browsing.
 */
export function HashScrollSpacer() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const check = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      // Only reserve room when the hash points at a real section on the page —
      // a typo'd or stale hash shouldn't leave dangling blank space.
      setActive(Boolean(hash) && Boolean(document.getElementById(hash)));
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  return active ? <div aria-hidden className="h-[75vh]" /> : null;
}

/**
 * Hover-revealed "#" affordance that copies a shareable deep link to the
 * section and reflects it in the address bar. Render inside an element marked
 * with the `group/sec` Tailwind group so it fades in on header hover.
 */
export function AnchorLink({
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
            {copied ? (
              <CheckIcon size={15} weight="bold" className="text-emerald-500" />
            ) : (
              <LinkIcon size={15} weight="bold" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {copied ? "Link copied!" : "Copy link to section"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
