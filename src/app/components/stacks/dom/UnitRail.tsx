"use client";

// Persistent labeled unit rail — vertical on desktop (left edge), dot row on
// mobile (centred under the top chrome). Click = pushState + damped travel.
// The progress thumb reads the transient progressRef on its own rAF loop;
// nothing re-renders per frame.
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
    const { travelTo, panelState, modalOpen } = useStacks.getState();
    if (!travelTo || panelState !== "closed" || modalOpen) return;
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
      {/* Mobile: dot row on its OWN row, centred, below the top chrome.

          It used to sit at right-4 top-4, which put it in the same corner as
          the theme toggle (right-4 top-3, a 40px button, so 12–52px down).
          Both were absolutely positioned and neither knew about the other, so
          the seventh dot landed under the moon glyph — reported from a 390px
          portrait screenshot, and it gets worse as the viewport narrows
          because the dots grow rightward from a fixed right edge into the
          toggle's box.

          Giving the row the full width instead of the corner is what makes
          the collision impossible rather than merely unlikely: the toggle
          owns the strip above 52px, the name owns the left of it, and this
          row starts at 56px, so no width can bring them together.

          The tap targets are the other half of the fix. The dots were 8px
          boxes — the whole button, not just the ink — which is a quarter of
          a comfortable finger. Each is now 32x44 (`h-11 w-8`), laid out edge
          to edge so there is no dead gap between neighbours to fall into.

          44 in BOTH axes was the first cut and it is in the screenshots: a
          308px row of 8px dots at 44px centres stops reading as one control
          and, over the night sky, starts reading as more stars. Seven 44px
          targets also leave 6px of margin at 320px. 44 is kept on the axis
          where a thumb actually misses — a dot row is a horizontal target
          and vertical aim is the sloppy direction — and 32 across is still
          four times the old hit area and well past the 24px floor. */}
      {/* pointer-events on the BUTTONS, not the nav. The nav spans the full
          width so the row can centre, and an interactive container that wide
          would deaden a 44px strip straight across the room — including the
          empty space either side of the dots, where there is nothing to
          click but the scene behind. */}
      <nav
        aria-label="Sections"
        className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center md:hidden"
      >
        {UNITS.map((unit, i) => (
          <button
            key={unit.slug}
            type="button"
            aria-label={unit.railLabel}
            aria-current={i === activeUnit ? "true" : undefined}
            onClick={() => go(i)}
            className="pointer-events-auto flex h-11 w-8 items-center justify-center"
          >
            {/* Bars, not dots, and that is about the sky behind them.
                Round 8px marks put this row in a straight visual tie with the
                starfield: same shape, same size, and the stars sit at whatever
                x the current unit's sky happens to put them. Two separate
                readers counted a doubled dot at position 4, which was a star
                a few px off a real one — and travelling to another unit just
                moves the collision to a different pair, so it is the shape
                that is wrong, not the placement. A short bar cannot be
                mistaken for a point of light. Width also carries the active
                state better than a scale did: a bar that grows reads as
                progress along a row, where a dot that swells only reads as a
                slightly bigger dot. */}
            <span
              aria-hidden
              className={`h-[3px] rounded-full transition-all duration-300 ${
                i === activeUnit
                  ? "w-4 bg-foreground/85"
                  : "w-2.5 bg-muted-foreground/45"
              }`}
            />
          </button>
        ))}
      </nav>
    </>
  );
}
