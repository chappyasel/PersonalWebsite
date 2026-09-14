"use client";

import { useCallback, useEffect, useState } from "react";

import { SectionIcon } from "./sectionIcons";
import { jumpToSection } from "./sectionJump";

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

  // A section jump, not a bare scroll: it replaces the hash and fires the
  // jump event, so a folded section (or layer) opens as the rail lands on it.
  const scrollTo = useCallback((id: string) => {
    jumpToSection(id);
  }, []);

  return { activeId, scrollTo };
}

/**
 * The full-page rail appears only when daylight.css can fit it beside a
 * centred reading column. Sheets and narrower pages hide it.
 */
export function DaylightTOCSidebar({ items }: { items: TOCItem[] }) {
  const { activeId, scrollTo } = useActiveSection(items);

  return (
    <nav
      className="dl-toc sticky top-12 h-fit self-start"
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
