"use client";

import { type ReactNode, useLayoutEffect, useRef } from "react";

/** Keyed by document inside the persistent sheet. With no per-route loading
 * fallback, React keeps the previous document visible until this one commits. */
export default function DocumentSheetContent({
  children,
}: {
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Reset only once the new document is ready. Let Next handle explicit
    // section links, including scrolling within the sheet to their anchor.
    if (location.hash) return;
    const scroller = content.current?.closest<HTMLElement>(
      "[data-modal-scroller]",
    );
    if (scroller) scroller.scrollTop = 0;
  }, []);
  return (
    <div ref={content} className="dl-sheet-document">
      {children}
    </div>
  );
}
