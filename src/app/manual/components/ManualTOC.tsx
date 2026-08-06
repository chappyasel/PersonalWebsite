"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";

import type { ManualSection } from "../types";

function useActiveSection(sections: ManualSection[]) {
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

    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return { activeId, scrollTo };
}

export function ManualTOCSidebar({
  sections,
}: {
  sections: ManualSection[];
}) {
  const { activeId, scrollTo } = useActiveSection(sections);

  return (
    <nav className="sticky top-12 hidden h-fit w-0 overflow-visible lg:block">
      <div className="mr-8 w-48 -translate-x-full space-y-1">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sections
        </p>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => scrollTo(section.id)}
            className="relative block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
          >
            {activeId === section.id && (
              <motion.div
                layoutId="toc-active"
                className="absolute inset-0 rounded-md bg-muted/80"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            <span
              className={`relative flex items-center gap-2 ${
                activeId === section.id
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <span className="text-base">{section.icon}</span>
              <span className="truncate">{section.title}</span>
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}

export function ManualTOCMobile({
  sections,
}: {
  sections: ManualSection[];
}) {
  const { activeId, scrollTo } = useActiveSection(sections);

  return (
    <nav className="sticky top-0 z-30 -ml-2 w-[calc(100%+16px)] rounded-[14px] bg-background/80 px-4 py-2 backdrop-blur-md lg:hidden">
      <div className="flex flex-wrap gap-1.5">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => scrollTo(section.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeId === section.id
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-muted-foreground"
            }`}
          >
            <span>{section.icon}</span>
            <span>{section.title}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
