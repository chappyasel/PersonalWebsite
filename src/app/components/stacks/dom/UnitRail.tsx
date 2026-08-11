"use client";

// Persistent labeled unit rail — vertical on desktop (left edge), icon row on
// mobile (centred under the top chrome). Click = pushState + damped travel.
// The progress thumb reads the transient progressRef on its own rAF loop;
// nothing re-renders per frame.
//
// Both form factors name the unit with `unit.label` and mark it with
// `unit.icon`, which are the section's OWN name and glyph (see data.ts) — the
// rail used to carry a second, shorter set of names that disagreed with the
// placards they led to.
import { useEffect, useRef } from "react";

import { UNIT_COUNT, UNITS } from "../data";
import { progressRef, useStacks } from "../store";

/** Desktop row height, in rem. The rows are `h-10` and the travelling thumb
 * translates by this per unit, so the two must agree — one number, used
 * twice, rather than a class and a magic multiplier that drift apart. */
const ROW_REM = 2.5;

export default function UnitRail() {
  const activeUnit = useStacks((s) => s.activeUnit);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const thumb = thumbRef.current;
      if (thumb) {
        // Track height is (UNIT_COUNT - 1) gaps of one row.
        thumb.style.transform = `translateY(${progressRef.current * (UNIT_COUNT - 1) * ROW_REM}rem)`;
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
      <style>{`
        /* ── The contrast floor ──────────────────────────────────────────
           Every mark in this rail floats on a live 3D scene, and the thing
           behind any given one is whatever the traverse and the theme put
           there: a night sky, a lit bridge tower, a white morning. A fixed
           grey has no guaranteed contrast against that, which is why the
           mobile row read as a few faint dashes.

           So each mark carries its own backing rather than relying on the
           scene to be dark or light. The halo is drawn in the BACKGROUND
           colour, so it lightens around dark glyphs on the light theme and
           darkens around light ones on dark — the same trick the shared
           section headings already use (text-shadow 0 0 20px white, black in
           dark).

           The two 1px passes are a RING, not a glow, and the order matters:
           each drop-shadow shadows the output of the one before it, so two
           1px passes compound into a near-solid 2px outline that separates
           the stroke from whatever it is lying on. That is what does the
           work over a large mid-tone mass; a soft blur alone cannot, because
           a blur wide enough to cover 14px type is a smear. The 4px pass
           behind them is the soft part, and it is what carries a mark that
           sits on plain sky.

           drop-shadow rather than text-shadow because it has to cover the
           icon as well as the label, and one filter stack serves both.

           HOW FAR THIS GOES, measured rather than asserted, on all seven
           units in both themes with the filter forced off for comparison:

             MOBILE row (the marks are icons, so the 3:1 non-text floor):
               light  3.57 worst, 2.98 with the halo off
               dark   5.07 worst, 3.37 with the halo off
             DESKTOP rail (the marks are 14px labels, so 4.5:1 is the bar):
               light  2.77 worst, 1.30 with the halo off
               dark   6.56 worst, 4.46 with the halo off

           So the halo is doing real work — it roughly doubles the worst case
           on the punishing side — but the desktop rail does NOT have a floor
           the way the mobile row does, and saying it did would be a lie the
           next person would have to discover. The mobile row lives in a strip
           of sky whose luminance moves 1.4x across the whole traverse. The
           desktop rail crosses the entire room, 4.9x on light, and About
           parks a mid-tone orange armchair directly behind it: every label on
           unit 0 lands at 2.8–3.5 against 1.3–1.8 unhaloed. A 2px ring cannot
           take 14px type over a large mid-tone mass to AA; only a backing
           surface or moving the mass would, and both are somebody else's
           call. The residual is unit 0 on light, and it is logged, not
           papered over. */
        .stacks-rail-row {
          filter:
            drop-shadow(0 0 1px hsl(var(--background)))
            drop-shadow(0 0 1px hsl(var(--background)))
            drop-shadow(0 0 4px hsl(var(--background) / 0.85));
        }
        /* Inactive marks step back rather than disappear, and 0.85 is
           measured rather than picked: scoring every mark's own glyph against
           its own local backdrop, on all seven units in both themes, 0.70
           held 4.3:1 on dark but only 2.5:1 on light — under the 3:1 AA floor
           for a non-text indicator, which is what these are. At 0.85 the
           worst mobile mark is 3.42:1 light, 4.47:1 dark.

           The active mark stays at 1 and keeps a bar twice as wide, so
           stepping the rest up does not cost the row its "you are here". */
        .stacks-rail-icon {
          opacity: 0.85;
          transition: opacity 0.3s ease-out;
        }
        .stacks-rail-row[data-active] .stacks-rail-icon,
        .stacks-rail-row:focus-visible .stacks-rail-icon {
          opacity: 1;
        }
        /* Hover gated on a real pointer. A tap leaves sticky :hover behind on
           touch, which would strand one mark of the mobile row lit as though
           it were the active unit. */
        @media (hover: hover) {
          .stacks-rail-row:hover .stacks-rail-icon { opacity: 1; }
        }
        /* The plate's ring, so the rail and the placard acknowledge a
           keyboard the same way. */
        .stacks-rail-row:focus-visible {
          outline: 2px solid hsl(var(--foreground) / 0.45);
          outline-offset: 2px;
          border-radius: 5px;
        }
        @media (prefers-reduced-motion: no-preference) {
          /* Hover leans the row toward the room it opens, and settles back on
             the same long ease everything else in the world uses. The
             transform lives on an INNER span so it never has to share the
             property with the arrival animation below. */
          .stacks-rail-inner {
            transition: transform 0.42s var(--stacks-ease, cubic-bezier(0.16, 1, 0.3, 1));
          }
          .stacks-rail-row:focus-visible .stacks-rail-inner {
            transform: translateX(3px);
          }
          @media (hover: hover) {
            .stacks-rail-row:hover .stacks-rail-inner {
              transform: translateX(3px);
            }
          }
          /* Becoming the active unit. Attribute-driven, so it fires on the
             change itself without re-mounting the button (which would kill
             the colour transition beside it). */
          .stacks-rail-row[data-active] .stacks-rail-icon {
            animation: stacks-rail-arrive 520ms var(--stacks-ease, cubic-bezier(0.16, 1, 0.3, 1));
          }
        }
        @keyframes stacks-rail-arrive {
          from { transform: scale(0.72); opacity: 0.3; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
      {/* Desktop: vertical labeled rail */}
      <nav
        aria-label="Sections"
        className="pointer-events-auto absolute left-5 top-1/2 z-30 hidden -translate-y-1/2 md:block lg:left-7"
      >
        <div className="relative flex flex-col">
          {/* A short vertical bar rather than the dot this used to be. It now
              slides down a column of icons, and a bar sliding beside a list
              reads as a position along it where a dot beside icons reads as
              one more mark in the set. It also rhymes with the mobile row,
              which is bars for its own reasons. */}
          <div
            ref={thumbRef}
            aria-hidden
            className="absolute left-0 top-[13px] h-3.5 w-[2px] rounded-full bg-foreground/70 will-change-transform"
          />
          {UNITS.map((unit, i) => {
            const Icon = unit.icon;
            const active = i === activeUnit;
            return (
              <button
                key={unit.slug}
                type="button"
                onClick={() => go(i)}
                aria-current={active ? "true" : undefined}
                data-active={active || undefined}
                // ~20% up from the h-8 / text-xs this was: the rail is the
                // map of the whole page and it was reading as a footnote.
                // pl-4 is the thumb's lane, so the icons start clear of it.
                className={`stacks-rail-row group flex h-10 items-center pl-4 text-left font-serif text-sm tracking-wide transition-colors duration-300 ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="stacks-rail-inner flex items-center gap-2.5">
                  <Icon
                    aria-hidden
                    weight="duotone"
                    className="stacks-rail-icon size-4 shrink-0"
                  />
                  {unit.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      {/* Mobile: unit row on its OWN row, centred, below the top chrome.

          It used to sit at right-4 top-4, which put it in the same corner as
          the theme toggle (right-4 top-3, a 40px button, so 12–52px down).
          Both were absolutely positioned and neither knew about the other, so
          the seventh mark landed under the moon glyph — reported from a 390px
          portrait screenshot, and it gets worse as the viewport narrows
          because the row grows rightward from a fixed right edge into the
          toggle's box.

          Giving the row the full width instead of the corner is what makes
          the collision impossible rather than merely unlikely: the toggle
          owns the strip above 52px, the name owns the left of it, and this
          row starts at 56px, so no width can bring them together.

          WHY IT IS NOW ICONS. The row was seven 3px dashes in a muted grey,
          and over a sky whose luminance changes with every unit that is
          genuinely hard to see — the owner's "the top nav should be larger /
          easier to see". Two things were wrong and only one of them was
          size: a 10x3px mark is small, but a mark with no contrast floor is
          invisible at any size. So the marks are now the sections' own
          glyphs at 19px, they carry the halo above, and the bar survives
          underneath as the position indicator. A visitor also gets to see
          WHICH seven things the row is, which the dashes never told them.

          Seven 44px columns is 308px, so the row still fits a 320px screen
          with margin, and 44 remains the axis a thumb actually misses. */}
      {/* pointer-events on the BUTTONS, not the nav. The nav spans the full
          width so the row can centre, and an interactive container that wide
          would deaden a strip straight across the room — including the empty
          space either side, where there is nothing to click but the scene
          behind. */}
      <nav
        aria-label="Sections"
        className="pointer-events-none absolute inset-x-0 top-14 z-30 flex justify-center md:hidden"
      >
        {UNITS.map((unit, i) => {
          const Icon = unit.icon;
          const active = i === activeUnit;
          return (
            <button
              key={unit.slug}
              type="button"
              aria-label={unit.label}
              aria-current={active ? "true" : undefined}
              data-active={active || undefined}
              onClick={() => go(i)}
              className="stacks-rail-row pointer-events-auto flex h-12 w-11 flex-col items-center justify-center gap-1 text-foreground"
            >
              <Icon
                aria-hidden
                weight="duotone"
                className="stacks-rail-icon size-[19px] shrink-0"
              />
              {/* Bars, not dots, and that is about the sky behind them.
                  Round marks put this row in a straight visual tie with the
                  starfield: same shape, same size, and the stars sit at
                  whatever x the current unit's sky happens to put them. Two
                  separate readers counted a doubled dot at position 4, which
                  was a star a few px off a real one — and travelling to
                  another unit just moves the collision to a different pair,
                  so it is the shape that is wrong, not the placement. Width
                  also carries the active state better than a scale did: a bar
                  that grows reads as progress along a row, where a dot that
                  swells only reads as a slightly bigger dot. */}
              <span
                aria-hidden
                className={`h-[3px] rounded-full transition-all duration-300 ${
                  active ? "w-4 bg-foreground/90" : "w-2 bg-foreground/50"
                }`}
              />
            </button>
          );
        })}
      </nav>
    </>
  );
}
