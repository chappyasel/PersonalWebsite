"use client";

// Persistent labeled unit rail — vertical on desktop (left edge), icon row on
// mobile (centred under the top chrome). Click = pushState + damped travel.
// Both layouts use the same selected-section pill dimensions, duration, and
// easing; only the axis changes to suit the vertical/horizontal rails.
//
// Both form factors mark a unit with its section glyph. The rail normally uses
// the canonical section name; a unit may opt into a shorter navigation-only
// label without changing the title of the destination it opens.
import { publishAboutBootStage } from "../boot/aboutBootStage";
import {
  GOLF_STOP_POSITION,
  UNITS,
  UNIT_COUNT,
  unitUrlForLocation,
} from "../data";
import { TOUCH_HORIZONTAL_DOMINANCE, TOUCH_SLOP_PX } from "../mobile/gesture";
import { haptic } from "../mobile/liveness";
import { closeStacksPanel, railRightPxRef, useStacks } from "../store";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useTapFirstCapability } from "~/lib/useTapFirstCapability";

import { MOBILE_RAIL_FONT_CLAMP } from "./mobileSheetGeometry";

/** Desktop row height, in rem. The rows are `h-9` and the travelling thumb
 * translates by this per unit, so the two must agree — one number, used
 * twice, rather than a class and a magic multiplier that drift apart. */
const ROW_REM = 2.25;
/** Every mobile button shares this step, in em of the rail row's font-size
 * (a rem clamp that grows 1x to 1.2x with the viewport), keeping all seven
 * icons centered as one row through root type-scale changes and the
 * tablet's larger chrome alike. */
const MOBILE_STEP_REM = 2.75;
/** Shared marker geometry: the desktop and mobile rails should feel like two
 * orientations of one control, not unrelated navigation treatments. */
const INDICATOR_LENGTH_REM = 1.25;
const INDICATOR_THICKNESS_REM = 0.25;
const GOLF_BALL_DIAMETER_REM = 0.75;

function subscribeToRailLocation(onChange: () => void) {
  const unsubscribe = useStacks.subscribe(onChange);
  window.addEventListener("hashchange", onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    unsubscribe();
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function currentRailHash() {
  return window.location.hash;
}

/** Move the two ends of an indicator separately. The end facing the
 * destination gets there first, stretching the mark along its rail; the other
 * end catches up with a softer spring. */
function useElasticIndicatorEdges({
  displayedUnit,
  inset,
  length,
  step,
  unit = "rem",
}: {
  displayedUnit: number;
  inset: number;
  length: number;
  step: number;
  /** The mobile rail sizes in em of a viewport-scaled row; desktop in rem. */
  unit?: "rem" | "em";
}) {
  const reduceMotion = useReducedMotion();
  const initialStart = displayedUnit * step + inset;
  const startEdge = useMotionValue(initialStart);
  const endEdge = useMotionValue(initialStart + length);
  const start = useTransform(startEdge, (value) => `${value}${unit}`);
  const size = useTransform<number, string>(
    [startEdge, endEdge],
    ([start = 0, end = 0]) => `${Math.max(0, end - start)}${unit}`,
  );

  useEffect(() => {
    const targetStart = displayedUnit * step + inset;
    const targetEnd = targetStart + length;

    if (reduceMotion) {
      startEdge.set(targetStart);
      endEdge.set(targetEnd);
      return;
    }

    const movingForward = targetStart > (startEdge.get() + endEdge.get()) / 2;
    const leadingEdge = movingForward ? endEdge : startEdge;
    const trailingEdge = movingForward ? startEdge : endEdge;
    const leadingTarget = movingForward ? targetEnd : targetStart;
    const trailingTarget = movingForward ? targetStart : targetEnd;

    const lead = animate(leadingEdge, leadingTarget, {
      type: "spring",
      stiffness: 510,
      damping: 32,
      mass: 0.62,
    });
    const trail = animate(trailingEdge, trailingTarget, {
      type: "spring",
      stiffness: 350,
      damping: 28,
      mass: 0.78,
      delay: 0.035,
    });

    return () => {
      lead.stop();
      trail.stop();
    };
  }, [displayedUnit, endEdge, inset, length, reduceMotion, startEdge, step]);

  return { size, start };
}

function ElasticDesktopIndicator({
  displayedUnit,
  golfBall,
}: {
  displayedUnit: number;
  golfBall: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const length = golfBall ? GOLF_BALL_DIAMETER_REM : INDICATOR_LENGTH_REM;
  const { size: height, start: top } = useElasticIndicatorEdges({
    displayedUnit,
    inset: (ROW_REM - length) / 2,
    length,
    step: ROW_REM,
  });
  const crossSize = golfBall ? GOLF_BALL_DIAMETER_REM : INDICATOR_THICKNESS_REM;

  return (
    <motion.span
      aria-hidden
      data-stacks-rail-indicator="desktop"
      data-stacks-golf-ball={golfBall || undefined}
      className="stacks-on-background-mark pointer-events-none absolute rounded-full bg-foreground/85"
      animate={{
        left: `${(INDICATOR_THICKNESS_REM - crossSize) / 2}rem`,
        width: `${crossSize}rem`,
      }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 430, damping: 30, mass: 0.68 }
      }
      style={{
        top,
        height,
      }}
    />
  );
}

function ElasticMobileIndicator({
  displayedUnit,
  golfBall,
}: {
  displayedUnit: number;
  golfBall: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const length = golfBall ? GOLF_BALL_DIAMETER_REM : INDICATOR_LENGTH_REM;
  const { size: width, start: left } = useElasticIndicatorEdges({
    displayedUnit,
    inset: (MOBILE_STEP_REM - length) / 2,
    length,
    step: MOBILE_STEP_REM,
    unit: "em",
  });
  const crossSize = golfBall ? GOLF_BALL_DIAMETER_REM : INDICATOR_THICKNESS_REM;

  return (
    <motion.span
      aria-hidden
      data-stacks-rail-indicator="mobile"
      data-stacks-golf-ball={golfBall || undefined}
      className="stacks-on-background-mark pointer-events-none absolute rounded-full bg-foreground/85"
      animate={{
        bottom: `${0.25 - (crossSize - INDICATOR_THICKNESS_REM) / 2}em`,
        height: `${crossSize}em`,
      }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 430, damping: 30, mass: 0.68 }
      }
      style={{
        left,
        width,
      }}
    />
  );
}

export default function UnitRail() {
  const tapFirst = useTapFirstCapability();
  const activeUnit = useStacks((s) => s.activeUnit);
  const golfFocused = useStacks((s) => s.golfFocused);
  const unitMapPreview = useStacks((s) => s.unitMapPreview);
  const currentHash = useSyncExternalStore(
    subscribeToRailLocation,
    currentRailHash,
    () => "",
  );
  const displayedUnit = unitMapPreview ?? activeUnit;
  const showGolfBall = currentHash === "#golf" && unitMapPreview === null;
  const [initialActiveUnit] = useState(activeUnit);
  const railRef = useRef<HTMLElement>(null);
  const mobileRailRef = useRef<HTMLElement>(null);
  const desktopButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const mobileScrub = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    target: number;
    active: boolean;
    cancelled: boolean;
  } | null>(null);
  const suppressNextMobileClick = useRef(false);

  // Publish the rail's measured right edge for CameraRig's About-stop solver:
  // the initial framing slides right until the shelf's projected left edge
  // clears this by a margin. Measured, not assumed — label widths move with
  // the serif font's swap-in and root type-size changes. The boot stage solves
  // against the same edge, so it follows the shelf the measurement moves.
  useLayoutEffect(() => {
    const measure = () => {
      const nav = railRef.current;
      if (!nav) return;
      const rect = nav.getBoundingClientRect();
      const right = rect.width > 0 ? rect.right : 0;
      railRightPxRef.current = right;
      useStacks.getState().setDesktopNavRightPx(right);
      publishAboutBootStage(right);
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

  useLayoutEffect(() => {
    const rail = mobileRailRef.current;
    if (!rail) return;
    // The icon rail is DOM chrome layered above the WebGL element. iOS can
    // create a zero-width selection around an SVG after a double tap, so the
    // canvas-level guard cannot help here. Cancel it at the owning control.
    const preventNativeSelection = (event: Event) => {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
    };
    rail.addEventListener("selectstart", preventNativeSelection);
    rail.addEventListener("contextmenu", preventNativeSelection);
    rail.addEventListener("dblclick", preventNativeSelection);
    return () => {
      rail.removeEventListener("selectstart", preventNativeSelection);
      rail.removeEventListener("contextmenu", preventNativeSelection);
      rail.removeEventListener("dblclick", preventNativeSelection);
    };
  }, []);

  const go = (index: number) => {
    const { travelTo, panelState, modalOpen } = useStacks.getState();
    if (!travelTo || modalOpen) return false;
    useStacks.getState().setFocusedInteraction(null);
    const pushSectionHistory = () => {
      window.history.pushState(
        null,
        "",
        unitUrlForLocation(
          window.location.pathname,
          window.location.search,
          index,
        ),
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
          .stacks-unit-rail-mobile,
          .stacks-unit-rail-mobile * {
            -webkit-touch-callout: none;
            -webkit-tap-highlight-color: transparent;
            -webkit-user-drag: none;
            -webkit-user-select: none;
            user-select: none;
          }
          /* The curtain remains the main entrance. As it nears the edges,
             establish the current section first, then resolve the remaining
             destinations outward from it. Each button owns its transform so
             the horizontal scrub surface and travelling thumb stay still. */
          .stacks-unit-rail-mobile .stacks-rail-row {
            opacity: 0;
            transform: translateY(8px) scale(0.92);
          }
          .stacks-unit-rail-mobile [data-stacks-rail-indicator="mobile"] {
            transform: scaleX(0);
            transform-origin: center;
          }
          .stacks-world-shell[data-revealed]
            .stacks-unit-rail-mobile
            .stacks-rail-row {
            animation: stacks-mobile-rail-item-in 400ms
              var(--stacks-ease, ease-out) both;
            animation-delay: calc(
              480ms + var(--stacks-mobile-rail-delay, 0ms)
            );
          }
          .stacks-world-shell[data-revealed]
            .stacks-unit-rail-mobile
            [data-stacks-rail-indicator="mobile"] {
            animation: stacks-mobile-rail-indicator-in 360ms
              var(--stacks-ease, ease-out) 560ms both;
          }
          .stacks-world-shell[data-load-path="warm"][data-revealed]
            .stacks-unit-rail-mobile
            .stacks-rail-row {
            animation-duration: 300ms;
            animation-delay: calc(
              180ms + var(--stacks-mobile-rail-delay, 0ms)
            );
          }
          .stacks-world-shell[data-load-path="warm"][data-revealed]
            .stacks-unit-rail-mobile
            [data-stacks-rail-indicator="mobile"] {
            animation-duration: 280ms;
            animation-delay: 240ms;
          }
        }
        @keyframes stacks-mobile-rail-item-in {
          from { opacity: 0; transform: translateY(8px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes stacks-mobile-rail-indicator-in {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @media (width >= 1200px) {
          .stacks-unit-rail-desktop .stacks-rail-row {
            opacity: 0;
            transform: translateX(-8px);
          }
          .stacks-unit-rail-desktop [data-stacks-rail-indicator="desktop"] {
            scale: 1 0;
            transform-origin: center;
          }
          .stacks-world-shell[data-revealed]
            .stacks-unit-rail-desktop
            .stacks-rail-row {
            animation: stacks-desktop-rail-item-in 420ms
              var(--stacks-ease, ease-out) both;
            animation-delay: calc(
              520ms + var(--stacks-desktop-rail-delay, 0ms)
            );
          }
          .stacks-world-shell[data-revealed]
            .stacks-unit-rail-desktop
            [data-stacks-rail-indicator="desktop"] {
            animation: stacks-desktop-rail-indicator-in 360ms
              var(--stacks-ease, ease-out) both;
            animation-delay: calc(
              600ms + var(--stacks-desktop-indicator-delay, 0ms)
            );
          }
          .stacks-world-shell[data-load-path="warm"][data-revealed]
            .stacks-unit-rail-desktop
            .stacks-rail-row {
            animation-duration: 300ms;
            animation-delay: calc(
              220ms + var(--stacks-desktop-rail-warm-delay, 0ms)
            );
          }
          .stacks-world-shell[data-load-path="warm"][data-revealed]
            .stacks-unit-rail-desktop
            [data-stacks-rail-indicator="desktop"] {
            animation-duration: 280ms;
            animation-delay: calc(
              280ms + var(--stacks-desktop-indicator-warm-delay, 0ms)
            );
          }
        }
        @keyframes stacks-desktop-rail-item-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes stacks-desktop-rail-indicator-in {
          from { scale: 1 0; }
          to { scale: 1 1; }
        }
        /* Inactive glyphs and labels share one ink strength. The glyph still
           steps back in scale, while the full-strength icon and moving thumb
           mark the current position. */
        .stacks-rail-icon {
          opacity: 0.78;
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
        .stacks-rail-tooltip {
          visibility: hidden;
          opacity: 0;
          transform: translate(-50%, -4px) scale(0.96);
          transition:
            visibility 0s linear 140ms,
            opacity 140ms ease-out,
            transform 180ms var(--stacks-ease, ease-out);
        }
        .stacks-rail-row:focus-visible .stacks-rail-tooltip {
          visibility: visible;
          opacity: 1;
          transform: translate(-50%, 0) scale(1);
          transition-delay: 0s;
        }
        @media (hover: hover) {
          .stacks-rail-row:hover .stacks-rail-tooltip {
            visibility: visible;
            opacity: 1;
            transform: translate(-50%, 0) scale(1);
            transition-delay: 180ms;
          }
        }
        /* One shared focus treatment. The button's responsive border radius
           remains intact instead of being replaced by a second ring shape. */
        .stacks-rail-row:focus-visible {
          outline: 2px solid hsl(var(--foreground) / 0.45);
          outline-offset: 2px;
        }
        /* At twelve pixels, three dimples are enough to read as a golf ball
           without turning the navigation marker into a tiny illustration. */
        [data-stacks-golf-ball] {
          background-image:
            radial-gradient(circle at 31% 30%, hsl(0 0% 0% / 0.34) 0 0.045rem, transparent 0.06rem),
            radial-gradient(circle at 68% 40%, hsl(0 0% 0% / 0.3) 0 0.04rem, transparent 0.055rem),
            radial-gradient(circle at 45% 70%, hsl(0 0% 0% / 0.28) 0 0.04rem, transparent 0.055rem);
        }
        @media (prefers-reduced-motion: reduce) {
          .stacks-unit-rail-mobile .stacks-rail-row,
          .stacks-world-shell[data-revealed]
            .stacks-unit-rail-mobile
            .stacks-rail-row {
            opacity: 1;
            transform: none;
            animation: none;
          }
          .stacks-unit-rail-mobile [data-stacks-rail-indicator="mobile"],
          .stacks-world-shell[data-revealed]
            .stacks-unit-rail-mobile
            [data-stacks-rail-indicator="mobile"] {
            transform: none;
            animation: none;
          }
          .stacks-unit-rail-desktop .stacks-rail-row,
          .stacks-world-shell[data-revealed]
            .stacks-unit-rail-desktop
            .stacks-rail-row {
            opacity: 1;
            transform: none;
            animation: none;
          }
          .stacks-unit-rail-desktop [data-stacks-rail-indicator="desktop"],
          .stacks-world-shell[data-revealed]
            .stacks-unit-rail-desktop
            [data-stacks-rail-indicator="desktop"] {
            scale: 1;
            animation: none;
          }
          .stacks-rail-tooltip {
            transition: none;
          }
        }
      `}</style>
      {/* Desktop: vertical labeled rail */}
      <nav
        ref={railRef}
        aria-label="Sections"
        className="stacks-unit-rail-desktop pointer-events-auto absolute left-5 top-1/2 z-30 hidden -translate-y-1/2 min-[1200px]:left-7 min-[1200px]:block"
      >
        <div
          className="relative flex flex-col"
          style={
            {
              "--stacks-desktop-indicator-delay": `${initialActiveUnit * 40}ms`,
              "--stacks-desktop-indicator-warm-delay": `${initialActiveUnit * 24}ms`,
            } as React.CSSProperties
          }
        >
          {/* The same 20px × 4px pill used by mobile, rotated for the vertical
              rail and kept left of the glyph. Its two ends use the same
              elastic travel as the mobile underline. */}
          <ElasticDesktopIndicator
            displayedUnit={showGolfBall ? GOLF_STOP_POSITION : activeUnit}
            golfBall={showGolfBall}
          />
          {UNITS.map((unit, i) => {
            const Icon = unit.icon;
            const current = i === activeUnit;
            const active = !golfFocused && current;
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
                tabIndex={current ? 0 : -1}
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
                style={
                  {
                    "--stacks-desktop-rail-delay": `${i * 40}ms`,
                    "--stacks-desktop-rail-warm-delay": `${i * 24}ms`,
                  } as React.CSSProperties
                }
              >
                <span className="stacks-rail-inner flex items-center gap-2.5">
                  <Icon
                    aria-hidden
                    weight="bold"
                    className="stacks-rail-icon size-[22px] shrink-0"
                  />
                  <span className="stacks-rail-label">{railLabel}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      {/* Mobile: seven direct icon buttons. The row remains scrub-capable:
          horizontal touch movement previews the travel-synced Placard and
          commits one destination on release. Vertical movement stays native. */}
      <nav
        ref={mobileRailRef}
        aria-label="Sections"
        className="stacks-unit-rail-mobile pointer-events-none absolute inset-x-0 z-30 flex justify-center min-[1200px]:hidden"
      >
        <div
          className="pointer-events-auto relative flex"
          // The row's font-size grows 1x to 1.2x with the viewport on the
          // sheet title's curve (mobileSheetGeometry); the buttons, glyphs
          // and indicator below are all in em of it. The scrub math reads
          // the buttons' rects, so it needs no unit.
          style={{
            touchAction: "pan-y pinch-zoom",
            fontSize: MOBILE_RAIL_FONT_CLAMP,
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== "touch") return;
            suppressNextMobileClick.current = false;
            mobileScrub.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              target: activeUnit,
              active: false,
              cancelled: false,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const scrub = mobileScrub.current;
            if (scrub?.pointerId !== event.pointerId) return;
            if (scrub.cancelled) return;

            if (!scrub.active) {
              const dx = event.clientX - scrub.startX;
              const dy = event.clientY - scrub.startY;
              if (Math.hypot(dx, dy) < TOUCH_SLOP_PX) return;
              if (Math.abs(dx) <= Math.abs(dy) * TOUCH_HORIZONTAL_DOMINANCE) {
                scrub.cancelled = true;
                suppressNextMobileClick.current = true;
                useStacks.getState().setUnitMapPreview(null);
                return;
              }
              scrub.active = true;
              suppressNextMobileClick.current = true;
            }

            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const fraction = Math.min(
              1,
              Math.max(0, (event.clientX - rect.left) / rect.width),
            );
            const preview = Math.round(fraction * (UNIT_COUNT - 1));
            if (preview === scrub.target) return;
            scrub.target = preview;
            useStacks.getState().setUnitMapPreview(preview);
            haptic(6);
          }}
          onPointerUp={(event) => {
            const scrub = mobileScrub.current;
            if (scrub?.pointerId !== event.pointerId) return;
            mobileScrub.current = null;
            useStacks.getState().setUnitMapPreview(null);
            if (scrub.active && scrub.target !== activeUnit) go(scrub.target);
            if (scrub.active || scrub.cancelled) {
              requestAnimationFrame(() => {
                suppressNextMobileClick.current = false;
              });
            }
          }}
          onPointerCancel={(event) => {
            if (mobileScrub.current?.pointerId !== event.pointerId) return;
            mobileScrub.current = null;
            suppressNextMobileClick.current = false;
            useStacks.getState().setUnitMapPreview(null);
          }}
        >
          <ElasticMobileIndicator
            displayedUnit={showGolfBall ? GOLF_STOP_POSITION : displayedUnit}
            golfBall={showGolfBall}
          />
          {UNITS.map((unit, i) => {
            const Icon = unit.icon;
            const current = i === activeUnit;
            const selected = i === displayedUnit;
            const active = !golfFocused && selected;
            const railLabel = unit.railLabel ?? unit.label;
            return (
              <button
                key={unit.slug}
                ref={(element) => {
                  mobileButtonRefs.current[i] = element;
                }}
                type="button"
                aria-label={railLabel}
                aria-describedby={
                  tapFirst ? undefined : `stacks-rail-tooltip-${unit.slug}`
                }
                aria-current={!golfFocused && current ? "page" : undefined}
                tabIndex={current ? 0 : -1}
                data-active={active || undefined}
                onClick={() => {
                  if (suppressNextMobileClick.current) {
                    suppressNextMobileClick.current = false;
                    return;
                  }
                  go(i);
                }}
                onKeyDown={(event) => onRailKeyDown(event, i, mobileButtonRefs)}
                className="stacks-on-background-text stacks-rail-row relative flex h-[3em] items-center justify-center rounded-xl pb-[0.25em] text-foreground"
                style={
                  {
                    width: `${MOBILE_STEP_REM}em`,
                    "--stacks-mobile-rail-delay": `${Math.abs(i - activeUnit) * 30}ms`,
                  } as React.CSSProperties
                }
              >
                <Icon
                  aria-hidden
                  weight="bold"
                  className="stacks-rail-icon size-[1.375em] shrink-0"
                />
                {!tapFirst && (
                  <span
                    id={`stacks-rail-tooltip-${unit.slug}`}
                    role="tooltip"
                    className="field-notes-glass-tooltip stacks-rail-tooltip pointer-events-none absolute left-1/2 top-[calc(100%_-_0.1rem)] z-40 w-max max-w-40 rounded-md border px-2.5 py-1.5 font-serif text-xs leading-none backdrop-blur-xl backdrop-saturate-150"
                  >
                    {railLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
