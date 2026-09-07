"use client";

import { useCallback, useEffect, useState } from "react";

import { SectionIcon } from "./sectionIcons";

export interface TOCItem {
  id: string;
  label: string;
  /** Fallback for icon resolution when the id has no dedicated glyph. */
  emoji?: string;
  /** Nested under the item before it (the systems page lists its seven
   * layers under their section). Indents the row; the rail dot stays put. */
  depth?: 1;
}

function useActiveSection(items: TOCItem[]) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return { activeId, scrollTo };
}

/**
 * In-flow sidebar column from lg up — an overlay hung off a zero-width nav
 * clips off the left edge of 1024–1150px viewports, so the rail takes real
 * width and the page adds a right-hand spacer (DaylightTOCSpacer) once there
 * is room to re-center the content column.
 */
export function DaylightTOCSidebar({ items }: { items: TOCItem[] }) {
  const { activeId, scrollTo } = useActiveSection(items);

  return (
    <nav
      className="dl-toc sticky top-12 mr-10 hidden h-fit w-[11.5rem] shrink-0 self-start font-sans lg:block"
      aria-label="Sections"
    >
      <p className="mb-3 py-[0.3rem] text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
        Sections
      </p>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => scrollTo(item.id)}
          data-active={activeId === item.id}
          className="dl-toc-link transition-colors"
          style={item.depth ? { paddingLeft: "0.875rem" } : undefined}
        >
          <SectionIcon
            id={item.id}
            emoji={item.emoji}
            size={15}
            className="shrink-0 opacity-75"
          />
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

/**
 * Restores exact centering of the content column on wide screens by
 * mirroring the sidebar's footprint (11.5rem + 2.5rem gap); below 1160px it
 * disappears so the sidebar never pushes content off the right edge.
 */
export function DaylightTOCSpacer() {
  return (
    <div aria-hidden className="hidden w-56 shrink-0 min-[1160px]:block" />
  );
}
