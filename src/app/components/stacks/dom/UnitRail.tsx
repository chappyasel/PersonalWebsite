"use client";

// Persistent labeled unit rail — vertical on desktop (left edge), dot row on
// mobile (top right). Click = pushState + damped travel. The progress thumb
// reads the transient progressRef on its own rAF loop; nothing re-renders
// per frame.
import { useEffect, useRef } from "react";

import { UNIT_COUNT, UNITS } from "../data";
import { progressRef, useStacks } from "../store";

export default function UnitRail() {
  const activeUnit = useStacks((s) => s.activeUnit);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const thumb = thumbRef.current;
      if (thumb) {
        // Track height is (UNIT_COUNT - 1) gaps of 2rem (h-8 rows).
        thumb.style.transform = `translateY(${progressRef.current * (UNIT_COUNT - 1) * 2}rem)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const go = (index: number) => {
    const { travelTo } = useStacks.getState();
    if (!travelTo) return;
    const slug = UNITS[index]!.slug;
    window.history.pushState(
      null,
      "",
      index === 0 ? window.location.pathname : `#${slug}`,
    );
    travelTo(index);
  };

  return (
    <>
      {/* Desktop: vertical labeled rail */}
      <nav
        aria-label="Sections"
        className="pointer-events-auto absolute left-5 top-1/2 z-30 hidden -translate-y-1/2 md:block lg:left-7"
      >
        <div className="relative flex flex-col">
          <div
            ref={thumbRef}
            aria-hidden
            className="absolute -left-[3px] top-[7px] size-2.5 rounded-full border border-foreground/30 bg-foreground/70 will-change-transform"
          />
          {UNITS.map((unit, i) => (
            <button
              key={unit.slug}
              type="button"
              onClick={() => go(i)}
              className={`group flex h-8 items-center gap-3 text-left font-serif text-xs tracking-wide transition-colors duration-300 ${
                i === activeUnit
                  ? "text-foreground"
                  : "text-muted-foreground/70 hover:text-foreground"
              }`}
            >
              <span
                aria-hidden
                className={`size-1 rounded-full transition-all duration-300 ${
                  i === activeUnit
                    ? "bg-foreground/0"
                    : "bg-muted-foreground/50 group-hover:bg-foreground/70"
                }`}
              />
              {unit.railLabel}
            </button>
          ))}
        </div>
      </nav>
      {/* Mobile: dot row, top right (bottom is the placard sheet) */}
      <nav
        aria-label="Sections"
        className="pointer-events-auto absolute right-4 top-4 z-30 flex gap-2.5 md:hidden"
      >
        {UNITS.map((unit, i) => (
          <button
            key={unit.slug}
            type="button"
            aria-label={unit.railLabel}
            onClick={() => go(i)}
            className={`size-2 rounded-full transition-all duration-300 ${
              i === activeUnit
                ? "scale-125 bg-foreground/80"
                : "bg-muted-foreground/40"
            }`}
          />
        ))}
      </nav>
    </>
  );
}
