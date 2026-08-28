"use client";

import {
  getSceneInteraction,
  portalLabelActivation,
  projectPortal,
  runSceneInteractionActivation,
} from "../scene/interactionRegistry";
import { progressRef, useStacks } from "../store";
import { ArrowSquareOutIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { clampPortalLabelX, clampPortalLabelY } from "./portalLabelPlacement";

const INITIAL_DWELL_MS = 350;
const TRANSITION_MS = 320;
/** A portal-to-portal change must let the old label finish fading before its
 * contents are replaced, and a full exit must stay mounted through the last
 * transition frame. */
const SWITCH_DWELL_MS = TRANSITION_MS + 20;
// Leave enough fully-transparent tail for a loaded frame to paint the end of
// the fade before React removes the node. A 20ms tail is less than two frames
// and could visually skip straight from opaque to unmounted under WebGL load.
const EXIT_MS = TRANSITION_MS + 100;

function isFinePointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export default function PortalLabel() {
  const hovered = useStacks((s) => s.hovered);
  const focused = useStacks((s) => s.focusedInteraction);
  const dragging = useStacks((s) => s.dragging);
  const modalOpen = useStacks((s) => s.modalOpen);
  const panelState = useStacks((s) => s.panelState);
  const [shown, setShown] = useState<{
    id: string;
    /** Title line: the destination of a Portal, or the object of an action. */
    label: string;
    detail: readonly string[];
    /** Verb line for a local action that also has a title. */
    action: string | null;
    /** Title-line glyph: square-out for a Portal off the site, arrows-out for
     * one on it or for a bare-verb action; null when the verb line below
     * carries the arrows-out icon. */
    arrow: "external" | "internal" | "action" | null;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const setLabelVisible = useCallback((next: boolean) => {
    visibleRef.current = next;
    setVisible(next);
  }, []);
  const shownRef = useRef<typeof shown>(null);
  const node = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const hadPortal = useRef(false);
  const eligibleRef = useRef(false);
  const desiredIdRef = useRef<string | null>(null);
  const exitTimer = useRef<number | null>(null);
  const enterFrame = useRef<number | null>(null);
  const positionedId = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
      if (enterFrame.current !== null) cancelAnimationFrame(enterFrame.current);
    },
    [],
  );

  useEffect(() => {
    pointer.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const track = (event: PointerEvent) => {
      const state = useStacks.getState();
      const scrollEl = state.scrollEl;
      if (
        scrollEl &&
        event.target instanceof Node &&
        !scrollEl.contains(event.target)
      ) {
        // R3F cannot dispatch pointerout after the pointer crosses onto DOM
        // chrome above its event surface. Drop the scene's old owner here so
        // a projected Portal Label cannot remain attached to a prop the cursor
        // left behind.
        if (state.hovered) state.setHovered(null);
        return;
      }
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", track, { passive: true });
    return () => window.removeEventListener("pointermove", track);
  }, []);

  useEffect(() => {
    const interactionId = focused ?? hovered;
    const spec = getSceneInteraction(interactionId);
    const activation = portalLabelActivation(spec);
    const eligible =
      (Boolean(focused) || isFinePointer()) &&
      activation &&
      !dragging &&
      !modalOpen &&
      panelState === "closed";
    if (!eligible || !activation || !spec) {
      eligibleRef.current = false;
      desiredIdRef.current = null;
      if (enterFrame.current !== null) {
        cancelAnimationFrame(enterFrame.current);
        enterFrame.current = null;
      }
      positionedId.current = null;
      setLabelVisible(false);
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
      exitTimer.current = window.setTimeout(() => {
        exitTimer.current = null;
        shownRef.current = null;
        setShown(null);
      }, EXIT_MS);
      hadPortal.current = false;
      return;
    }
    eligibleRef.current = true;
    desiredIdRef.current = spec.id;
    if (exitTimer.current !== null) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    if (shownRef.current && shownRef.current.id !== spec.id)
      setLabelVisible(false);
    const delay = focused
      ? 0
      : hadPortal.current
        ? SWITCH_DWELL_MS
        : INITIAL_DWELL_MS;
    hadPortal.current = true;
    const timeout = window.setTimeout(() => {
      const next =
        activation.kind === "portal"
          ? {
              id: spec.id,
              label: activation.label.replace(/\s*↗\s*$/, ""),
              detail: activation.detail ?? [],
              action: null,
              arrow: activation.external
                ? ("external" as const)
                : ("internal" as const),
            }
          : {
              id: spec.id,
              label: activation.title ?? activation.label,
              detail: activation.detail ?? [],
              action: activation.title ? activation.label : null,
              // A bare verb ("Hit golf ball") is its own title, so the →
              // sits on that line; with a title the verb line carries it.
              arrow: activation.title ? null : ("action" as const),
            };
      positionedId.current = null;
      setLabelVisible(false);
      shownRef.current = next;
      setShown(next);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [dragging, focused, hovered, modalOpen, panelState, setLabelVisible]);

  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    let previousProgress = progressRef.current;
    const place = () => {
      if (Math.abs(progressRef.current - previousProgress) > 0.000_002) {
        previousProgress = progressRef.current;
        if (enterFrame.current !== null) {
          cancelAnimationFrame(enterFrame.current);
          enterFrame.current = null;
        }
        positionedId.current = null;
        setLabelVisible(false);
        // Camera damping can continue by tiny amounts after the visitor has
        // already reached the next object. Keep the projection loop alive so
        // the same hover can enter once motion settles; stopping here stranded
        // linked props forever at opacity zero until pointerout.
        frame = requestAnimationFrame(place);
        return;
      }
      previousProgress = progressRef.current;
      const element = node.current;
      const projected = projectPortal(shown.id);
      if (element) {
        // Projection normally resolves from the object's geometry or carrier
        // origin. Pointer position remains an emergency fallback only when the
        // scene has not installed its projection context yet.
        let objectAnchored = false;
        let anchor = pointer.current;
        if (projected && !projected.behind) {
          objectAnchored = true;
          anchor = projected;
        }
        element.dataset.anchorSource = objectAnchored ? "object" : "pointer";
        const dock = document.querySelector<HTMLElement>(
          '[data-stacks-desktop-dock]:not([data-hidden="true"])',
        );
        const dockRect = dock?.getBoundingClientRect() ?? null;
        const x = clampPortalLabelX(
          anchor.x,
          element.offsetWidth,
          window.innerWidth,
          dockRect,
        );
        const activeSheet = document.querySelector<HTMLElement>(
          "[data-stacks-mobile-panel][data-stacks-panel]",
        );
        const desiredY = anchor.y - 10;
        const y = clampPortalLabelY(
          anchor.y,
          element.offsetHeight,
          window.innerHeight,
          activeSheet?.getBoundingClientRect() ?? null,
        );
        element.toggleAttribute(
          "data-docked",
          focused !== null && Math.abs(y - desiredY) > 2,
        );
        // The positioned node is also the glass node. Keeping positioning on
        // a transformed parent made that parent the tooltip's compositing
        // boundary in Chromium, so its child could not blur the scene.
        element.style.setProperty("--portal-label-x", `${x}px`);
        element.style.setProperty("--portal-label-y", `${y}px`);
        element.style.visibility = "visible";
        if (positionedId.current !== shown.id) positionedId.current = shown.id;
        if (
          eligibleRef.current &&
          desiredIdRef.current === shown.id &&
          !visibleRef.current &&
          enterFrame.current === null
        ) {
          // Paint one fully positioned, transparent frame before beginning
          // the entrance. Otherwise the transform's 0px CSS-variable
          // fallbacks can become the transition's starting coordinates.
          enterFrame.current = requestAnimationFrame(() => {
            enterFrame.current = null;
            if (
              shownRef.current?.id === shown.id &&
              desiredIdRef.current === shown.id
            )
              setLabelVisible(true);
          });
        }
      }
      frame = requestAnimationFrame(place);
    };
    frame = requestAnimationFrame(place);
    return () => {
      cancelAnimationFrame(frame);
      if (enterFrame.current !== null) {
        cancelAnimationFrame(enterFrame.current);
        enterFrame.current = null;
      }
      positionedId.current = null;
    };
  }, [focused, setLabelVisible, shown]);

  if (!shown) return null;
  return (
    <div
      ref={node}
      data-stacks-portal-label
      style={
        {
          left: "var(--portal-label-x, -10000px)",
          top: "var(--portal-label-y, -10000px)",
          transform: visible
            ? "translate(-50%, -100%) scale(1)"
            : "translate(-50%, calc(-100% + 6px)) scale(0.96)",
          transformOrigin: "bottom center",
          "--portal-label-opacity": visible ? "1" : "0",
        } as React.CSSProperties
      }
      className={`${focused ? "pointer-events-auto" : "pointer-events-none"} field-notes-glass-tooltip fixed z-30 w-max max-w-[240px] rounded-lg border px-2.5 py-1.5 backdrop-blur-xl backdrop-saturate-150`}
    >
      <style>{`
        [data-portal-tether] { opacity: 0; }
        [data-stacks-portal-label][data-docked] [data-portal-tether] { opacity: 0.55; }
      `}</style>
      <span
        aria-hidden
        data-portal-tether=""
        className="pointer-events-none absolute left-1/2 top-full h-4 w-px -translate-x-1/2 bg-white/60 transition-opacity"
      />
      {/* `left` and `top` own the live screen position. `transform` only owns
          entrance motion, so projection updates cannot become transition
          endpoints. The glass remains on this same compositing node. */}
      <button
        type="button"
        disabled={!focused}
        role={focused ? undefined : "status"}
        aria-live={focused ? undefined : "polite"}
        onClick={() => {
          if (focused === shown.id) runSceneInteractionActivation(shown.id);
        }}
        className={`relative flex min-h-0 max-w-[240px] items-center justify-center border-0 bg-transparent p-0 text-left text-[13px] leading-[1.25] ${
          focused
            ? "after:absolute after:left-1/2 after:top-1/2 after:h-12 after:w-full after:min-w-12 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
            : ""
        }`}
      >
        {/* Keep the focused label's hit area at least 48px tall without making
            the visible glass inherit that height. */}
        {/* Title line, then one line per detail, then the verb line of a
            local action. A Portal's title names where it goes, so its icon sits
            on that line (square-out off-site, arrows-out on-site) and is the
            whole "this is a link" signal; details describe the object and
            never wrap around the glyph. An action wears an arrows-out icon on
            its last line (or on its only line when it is a bare verb). A plain
            one-line label renders exactly as before. */}
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-start gap-1">
            <span
              className={`min-w-0 whitespace-normal break-words ${
                shown.detail.length || shown.action ? "font-medium" : ""
              }`}
            >
              {shown.label}
            </span>
            {shown.arrow === "external" ? (
              <ArrowSquareOutIcon
                aria-hidden="true"
                className="mt-px shrink-0"
                size={13}
                weight="bold"
              />
            ) : shown.arrow === "internal" ? (
              <ArrowsOutIcon
                aria-hidden="true"
                className="mt-px shrink-0"
                size={13}
                weight="bold"
              />
            ) : shown.arrow === "action" ? (
              <ArrowsOutIcon
                aria-hidden="true"
                className="mt-px shrink-0"
                size={13}
                weight="bold"
              />
            ) : null}
          </span>
          {shown.detail.map((line) => (
            <span
              key={line}
              data-portal-detail=""
              className="mt-0.5 min-w-0 whitespace-normal break-words text-[12px] leading-[1.3] text-white/60"
            >
              {line}
            </span>
          ))}
          {shown.action ? (
            // Keep the action indicator on the verb line when a separate
            // title and detail describe the object above it.
            <span
              data-portal-action=""
              className="mt-1 flex min-w-0 items-start gap-1 text-[12px] leading-[1.3]"
            >
              <span className="min-w-0 whitespace-normal break-words">
                {shown.action}
              </span>
              <ArrowsOutIcon
                aria-hidden="true"
                className="mt-px shrink-0"
                size={12}
                weight="bold"
              />
            </span>
          ) : null}
        </span>
      </button>
    </div>
  );
}
