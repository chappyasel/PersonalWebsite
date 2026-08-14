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
import { UNITS, UNIT_COUNT } from "../data";
import {
  closeStacksPanel,
  progressRef,
  railRightPxRef,
  useStacks,
} from "../store";
import { useEffect, useLayoutEffect, useRef } from "react";

/** Desktop row height, in rem. The rows are `h-9` and the travelling thumb
 * translates by this per unit, so the two must agree — one number, used
 * twice, rather than a class and a magic multiplier that drift apart. */
const ROW_REM = 2.25;
/** Every mobile button shares this rem-sized step, keeping all seven icons
 * centered as one row through root type-scale changes. */
const MOBILE_STEP_REM = 2.75;

export default function UnitRail() {
  const activeUnit = useStacks((s) => s.activeUnit);
  const thumbRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);

  // Publish the rail's measured right edge (its widest row is "Featured
  // Talks") for CameraRig's About-stop solver: the initial framing slides
  // right until the shelf's projected left edge clears this by a margin.
  // Measured, not assumed — label widths move with the serif font's swap-in
  // and with root type-size changes, hence the fonts.ready re-measure.
  useLayoutEffect(() => {
    const measure = () => {
      const nav = railRef.current;
      if (!nav) return;
      const rect = nav.getBoundingClientRect();
      railRightPxRef.current = rect.width > 0 ? rect.right : 0;
    };
    measure();
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      window.removeEventListener("resize", measure);
      railRightPxRef.current = 0;
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastProgress = Number.NaN;
    const tick = () => {
      const progress = progressRef.current;
      const thumb = thumbRef.current;
      // The camera loop publishes continuously, including while the room is
      // at rest. Avoid dirtying two DOM styles every animation frame when the
      // shared progress value has not changed; rem-based transforms still
      // respond to a root font-size change without another write.
      if (progress !== lastProgress) {
        // Track height is (UNIT_COUNT - 1) gaps of one row.
        if (thumb) {
          thumb.style.transform = `translateY(${progress * (UNIT_COUNT - 1) * ROW_REM}rem)`;
        }
        lastProgress = progress;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const go = (index: number) => {
    const { travelTo, panelState, modalOpen } = useStacks.getState();
    if (!travelTo || modalOpen) return;
    if (panelState === "open" || panelState === "opening") {
      // The tab is outside the expanded sheet. Collapse first, but do not eat
      // the navigation the visitor actually requested; the resident target
      // sheet can arrive while the shared detent settles to peek.
      closeStacksPanel();
    } else if (panelState === "closing") {
      return;
    }
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
        /* Compact widths put the persistent name and icon rail over a wide
           range of shelf/sky values. The strengthened World foreground tokens
           now provide the contrast directly, so chrome remains one clean
           colour instead of gaining a reverse-theme outline. */
        @media (width < 1200px) {
          .stacks-unit-rail-mobile {
            top: calc(env(safe-area-inset-top, 0px) + 3.5rem);
            padding-left: env(safe-area-inset-left, 0px);
            padding-right: env(safe-area-inset-right, 0px);
          }
        }
        /* Inactive glyphs step back just enough to leave the full-opacity
           icon plus moving thumb as the current-position signal. They stay
           near foreground strength because the scene beneath is variable. */
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
        ref={railRef}
        aria-label="Sections"
        className="pointer-events-auto absolute left-5 top-1/2 z-30 hidden -translate-y-1/2 min-[1200px]:left-7 min-[1200px]:block"
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
            className="absolute left-0 top-[11px] h-3.5 w-[2px] rounded-full bg-foreground/70 will-change-transform"
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
                // The desktop rail uses a larger mark and label but a tighter
                // 2.25rem step, improving scanability without stretching the
                // seven-item group down the scene. pl-4 is the thumb's lane.
                className={`stacks-rail-row group flex h-9 items-center rounded-lg pl-4 text-left font-serif text-[1.05rem] tracking-wide transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-foreground/40 ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="stacks-rail-inner flex items-center gap-2.5">
                  <Icon
                    aria-hidden
                    weight="bold"
                    className="stacks-rail-icon size-[19px] shrink-0"
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
          glyphs at 19px in the stronger shared foreground, and a stationary
          bar survives underneath as the position indicator. A visitor gets to see
          WHICH seven things the row is, which the dashes never told them.

          Seven 2.75rem columns is 19.25rem, so the row still fits a 320px
          screen with margin. Each button owns its own underline. The former
          single underline was continuously translated on a promoted GPU
          layer; iOS Safari intermittently retained its old raster tiles as a
          trail of tiny dashes. Stationary underlines only crossfade, so there
          is no moving texture for WebKit to smear. */}
      {/* pointer-events on the BUTTONS, not the nav. The nav spans the full
          width so the row can centre, and an interactive container that wide
          would deaden a strip straight across the room — including the empty
          space either side, where there is nothing to click but the scene
          behind. */}
      <nav
        aria-label="Sections"
        className="stacks-unit-rail-mobile pointer-events-none absolute inset-x-0 z-20 flex justify-center min-[1200px]:hidden"
      >
        <div className="relative flex">
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
                className="stacks-rail-row pointer-events-auto relative flex h-12 items-center justify-center rounded-xl pb-1 text-foreground focus-visible:ring-2 focus-visible:ring-foreground/50"
                style={{ width: `${MOBILE_STEP_REM}rem` }}
              >
                <Icon
                  aria-hidden
                  weight="bold"
                  className="stacks-rail-icon size-[22px] shrink-0"
                />
                <span
                  aria-hidden
                  className={`absolute bottom-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-foreground/85 transition-opacity duration-200 ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
