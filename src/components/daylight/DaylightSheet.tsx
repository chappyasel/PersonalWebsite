"use client";

import { XIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/**
 * A document page presented over the page that launched it. Client-side
 * navigations to /routine and /manual are intercepted into this sheet so the
 * launching page — including a booted 3D world — stays alive underneath. The
 * URL still reads /routine, deep links and refreshes still resolve to the
 * full page, and Esc, the backdrop, or the close control pop history back to
 * the untouched scene.
 */
export default function DaylightSheet({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.back();
    };
    window.addEventListener("keydown", onKey);
    // The page underneath keeps its scroll position; only the sheet scrolls.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [router]);

  return (
    <div className="dl-sheet" role="dialog" aria-modal="true" aria-label={label}>
      <button
        type="button"
        aria-label="Close"
        className="dl-sheet-backdrop"
        onClick={() => router.back()}
      />
      <div className="dl-sheet-panel bg-background">
        <div className="dl-sheet-closebar">
          <button
            type="button"
            aria-label={`Close ${label}`}
            className="dl-sheet-close"
            onClick={() => router.back()}
          >
            <XIcon weight="bold" className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
