"use client";
import { useEffect, useState } from "react";

import { SECTION_JUMP_EVENT } from "./sectionJump";

/**
 * Scrolls to (and optionally expands) a section when the URL hash matches its
 * id — on initial load, on hashchange, and on an in-page section jump (which
 * replaces the hash, so no hashchange fires). Pass `setOpen` for collapsible
 * sections so a deep link auto-expands them.
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
    window.addEventListener(SECTION_JUMP_EVENT, handle);
    return () => {
      window.removeEventListener("hashchange", handle);
      window.removeEventListener(SECTION_JUMP_EVENT, handle);
    };
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
