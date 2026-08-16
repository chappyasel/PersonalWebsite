"use client";

// Persistent labeled unit rail — vertical on desktop (left edge), icon row on
// mobile (centred under the top chrome). Click = pushState + damped travel.
// Both layouts use the same selected-section pill dimensions, duration, and
// easing; only the axis changes to suit the vertical/horizontal rails.
//
// Both form factors mark a unit with its section glyph. The rail normally uses
// the canonical section name; a unit may opt into a shorter navigation-only
// label without changing the title of the destination it opens.
import { UNITS, UNIT_COUNT } from "../data";
import { closeStacksPanel, railRightPxRef, useStacks } from "../store";
import { useLayoutEffect, useRef } from "react";

/** Desktop row height, in rem. The rows are `h-9` and the travelling thumb
 * translates by this per unit, so the two must agree — one number, used
 * twice, rather than a class and a magic multiplier that drift apart. */
const ROW_REM = 2.25;
/** Every mobile button shares this rem-sized step, keeping all seven icons
 * centered as one row through root type-scale changes. */
const MOBILE_STEP_REM = 2.75;
/** Shared marker geometry: the desktop and mobile rails should feel like two
 * orientations of one control, not unrelated navigation treatments. */
const INDICATOR_LENGTH_REM = 1.25;
const INDICATOR_THICKNESS_REM = 0.25;

export default function UnitRail() {
  const activeUnit = useStacks((s) => s.activeUnit);
  const railRef = useRef<HTMLElement>(null);
  const desktopButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Publish the rail's measured right edge for CameraRig's About-stop solver:
  // the initial framing slides right until the shelf's projected left edge
  // clears this by a margin. Measured, not assumed — label widths move with
  // the serif font's swap-in and root type-size changes.
  useLayoutEffect(() => {
    const measure = () => {
      const nav = railRef.current;
      if (!nav) return;
      const rect = nav.getBoundingClientRect();
      const right = rect.width > 0 ? rect.right : 0;
      railRightPxRef.current = right;
      useStacks.getState().setDesktopNavRightPx(right);
    };
    measure();
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      window.removeEventListener("resize", measure);
      railRightPxRef.current = 0;
      useStacks.getState().setDesktopNavRightPx(0);
    };
  }, []);

  const go = (index: number) => {
    const { travelTo, panelState, modalOpen } = useStacks.getState();
    if (!travelTo || modalOpen) return false;
    const pushSectionHistory = () => {
      const slug = UNITS[index]!.slug;
      window.history.pushState(
        null,
        "",
        index === 0 ? window.location.pathname : `#${slug}`,
      );
    };
    if (panelState === "open" || panelState === "opening") {
      // The tab is outside the expanded sheet. Collapse first, but do not eat
      // the navigation the visitor actually requested; the resident target
      // sheet can arrive while the shared detent settles to peek.
      closeStacksPanel();
      travelTo(index);
      // closeStacksPanel owns a pending history.back(). Pushing the section
      // hash before that pop commits lets the back operation erase the new
      // URL. Travel immediately, but publish its hash only after the shared
      // sheet detent has returned to closed.
      const unsubscribe = useStacks.subscribe((state) => {
        if (state.panelState !== "closed") return;
        unsubscribe();
        pushSectionHistory();
      });
      return true;
    } else if (panelState === "closing") {
      return false;
    }
    pushSectionHistory();
    travelTo(index);
    return true;
  };

  const onRailKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
    refs: React.RefObject<Array<HTMLButtonElement | null>>,
  ) => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = Math.min(UNIT_COUNT - 1, index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = Math.max(0, index - 1);
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = UNIT_COUNT - 1;
    }
    if (next === null) return;
    event.preventDefault();
    // Keep the window-level world bridge from handling the same arrow a
    // second time. The rail owns both travel and its roving focus position.
    event.stopPropagation();
    if (go(next)) requestAnimationFrame(() => refs.current[next]?.focus());
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
          transform: scale(0.94);
          transition: opacity 0.38s var(--stacks-ease, ease-out), transform 0.38s var(--stacks-ease, ease-out);
        }
        .stacks-rail-row:focus-visible .stacks-rail-icon {
          opacity: 1;
          transform: scale(1);
        }
        /* Hover gated on a real pointer. A tap leaves sticky :hover behind on
           touch, which would strand one mark of the mobile row lit as though
           it were the active unit. */
        @media (hover: hover) {
          .stacks-rail-row:hover .stacks-rail-icon {
            opacity: 1;
            transform: scale(1);
          }
        }
        /* Selection wins over hover/focus so the current section remains the
           strongest state even while its button owns the pointer or focus. */
        .stacks-rail-row[data-active] .stacks-rail-icon {
          opacity: 1;
          transform: scale(1.06);
        }
        .stacks-rail-label {
          opacity: 0.78;
          transition: opacity 0.38s var(--stacks-ease, ease-out);
        }
        .stacks-rail-row[data-active] .stacks-rail-label,
        .stacks-rail-row:focus-visible .stacks-rail-label {
          opacity: 1;
        }
        @media (hover: hover) {
          .stacks-rail-row:hover .stacks-rail-label { opacity: 1; }
        }
        /* One shared focus treatment. The button's responsive border radius
           remains intact instead of being replaced by a second ring shape. */
        .stacks-rail-row:focus-visible {
          outline: 2px solid hsl(var(--foreground) / 0.45);
          outline-offset: 2px;
        }
      `}</style>
      {/* Desktop: vertical labeled rail */}
      <nav
        ref={railRef}
        aria-label="Sections"
        className="stacks-unit-rail-desktop pointer-events-auto absolute left-5 top-1/2 z-30 hidden -translate-y-1/2 min-[1200px]:left-7 min-[1200px]:block"
      >
        <div className="relative flex flex-col">
          {/* The same 20px × 4px pill used by mobile, rotated for the vertical
              rail and kept left of the glyph. It moves from selected section
              to selected section with the same duration/ease. */}
          <span
            aria-hidden
            data-stacks-rail-indicator="desktop"
            className="stacks-on-background-mark pointer-events-none absolute left-0 top-2 rounded-full bg-foreground/85 transition-transform duration-500 will-change-transform motion-reduce:transition-none"
            style={{
              width: `${INDICATOR_THICKNESS_REM}rem`,
              height: `${INDICATOR_LENGTH_REM}rem`,
              transform: `translateY(${activeUnit * ROW_REM}rem)`,
              transitionTimingFunction: "var(--stacks-ease)",
            }}
          />
          {UNITS.map((unit, i) => {
            const Icon = unit.icon;
            const active = i === activeUnit;
            const railLabel = unit.railLabel ?? unit.label;
            return (
              <button
                key={unit.slug}
                ref={(element) => {
                  desktopButtonRefs.current[i] = element;
                }}
                type="button"
                onClick={() => go(i)}
                onKeyDown={(event) =>
                  onRailKeyDown(event, i, desktopButtonRefs)
                }
                tabIndex={active ? 0 : -1}
                aria-current={active ? "page" : undefined}
                data-active={active || undefined}
                // The desktop rail uses a larger mark and label but a tighter
                // 2.25rem step, improving scanability without stretching the
                // seven-item group down the scene. pl-4 is the thumb's lane.
                className={`stacks-on-background-text stacks-rail-row group flex h-9 items-center rounded-lg pl-4 text-left font-serif text-[1.05rem] tracking-wide transition-colors duration-300 focus-visible:text-foreground ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="stacks-rail-inner flex items-center gap-2.5">
                  <Icon
                    aria-hidden
                    weight="bold"
                    className="stacks-rail-icon size-[22px] shrink-0 text-foreground"
                  />
                  <span className="stacks-rail-label">{railLabel}</span>
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
          glyphs at 22px in the stronger shared foreground, and a moving pill
          survives underneath as the position indicator. A visitor gets to
          see WHICH seven things the row is, which the dashes never told them.

          Seven 2.75rem columns is 19.25rem, so the row still fits a 320px
          screen with margin. The indicator animates its layout position rather
          than a promoted transform on mobile: iOS Safari intermittently kept
          old transform-layer raster tiles as a trail of tiny dashes. */}
      {/* pointer-events on the BUTTONS, not the nav. The nav spans the full
          width so the row can centre, and an interactive container that wide
          would deaden a strip straight across the room — including the empty
          space either side, where there is nothing to click but the scene
          behind. */}
      <nav
        aria-label="Sections"
        className="stacks-unit-rail-mobile pointer-events-none absolute inset-x-0 z-30 flex justify-center min-[1200px]:hidden"
      >
        <div className="relative flex">
          <span
            aria-hidden
            data-stacks-rail-indicator="mobile"
            className="stacks-on-background-mark pointer-events-none absolute bottom-1 rounded-full bg-foreground/85 transition-[left,width] duration-500 motion-reduce:transition-none"
            style={{
              left: `calc(${activeUnit * MOBILE_STEP_REM}rem + 0.75rem)`,
              width: `${INDICATOR_LENGTH_REM}rem`,
              height: `${INDICATOR_THICKNESS_REM}rem`,
              transitionTimingFunction: "var(--stacks-ease)",
            }}
          />
          {UNITS.map((unit, i) => {
            const Icon = unit.icon;
            const active = i === activeUnit;
            const railLabel = unit.railLabel ?? unit.label;
            return (
              <button
                key={unit.slug}
                ref={(element) => {
                  mobileButtonRefs.current[i] = element;
                }}
                type="button"
                aria-label={railLabel}
                aria-current={active ? "page" : undefined}
                tabIndex={active ? 0 : -1}
                data-active={active || undefined}
                onClick={() => go(i)}
                onKeyDown={(event) => onRailKeyDown(event, i, mobileButtonRefs)}
                className="stacks-on-background-text stacks-rail-row pointer-events-auto relative flex h-12 items-center justify-center rounded-xl pb-1 text-foreground"
                style={{ width: `${MOBILE_STEP_REM}rem` }}
              >
                <Icon
                  aria-hidden
                  weight="bold"
                  className="stacks-rail-icon size-[22px] shrink-0 text-foreground"
                />
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
