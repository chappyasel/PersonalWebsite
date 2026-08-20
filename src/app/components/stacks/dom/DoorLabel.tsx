"use client";

import {
  doorLabelActivation,
  getSceneInteraction,
  projectDoor,
  runSceneInteractionActivation,
} from "../scene/interactionRegistry";
import { progressRef, useStacks } from "../store";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { clampDoorLabelX, clampDoorLabelY } from "./doorLabelPlacement";

const INITIAL_DWELL_MS = 350;
const TRANSITION_MS = 200;
/** A door-to-door change must let the old label finish fading before its
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

export default function DoorLabel() {
  const hovered = useStacks((s) => s.hovered);
  const focused = useStacks((s) => s.focusedInteraction);
  const dragging = useStacks((s) => s.dragging);
  const modalOpen = useStacks((s) => s.modalOpen);
  const panelState = useStacks((s) => s.panelState);
  const [shown, setShown] = useState<{
    id: string;
    label: string;
    external: boolean;
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
  const hadDoor = useRef(false);
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
      const scrollEl = useStacks.getState().scrollEl;
      if (
        scrollEl &&
        event.target instanceof Node &&
        !scrollEl.contains(event.target)
      )
        return;
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointermove", track, { passive: true });
    return () => window.removeEventListener("pointermove", track);
  }, []);

  useEffect(() => {
    const interactionId = focused ?? hovered;
    const spec = getSceneInteraction(interactionId);
    const activation = doorLabelActivation(spec);
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
      hadDoor.current = false;
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
      : hadDoor.current
        ? SWITCH_DWELL_MS
        : INITIAL_DWELL_MS;
    hadDoor.current = true;
    const timeout = window.setTimeout(() => {
      const next = {
        id: spec.id,
        label: activation.label.replace(/\s*↗\s*$/, ""),
        external: activation.kind === "door" && activation.external,
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
      const projected = projectDoor(shown.id);
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
        const x = clampDoorLabelX(
          anchor.x,
          element.offsetWidth,
          window.innerWidth,
          dockRect,
        );
        const activeSheet = document.querySelector<HTMLElement>(
          "[data-stacks-mobile-panel][data-stacks-panel]",
        );
        const desiredY = anchor.y - 10;
        const y = clampDoorLabelY(
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
        element.style.setProperty("--door-label-x", `${x}px`);
        element.style.setProperty("--door-label-y", `${y}px`);
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
      data-stacks-door-label
      style={
        {
          transform:
            "translate3d(var(--door-label-x, 0px), var(--door-label-y, 0px), 0) translate(-50%, -100%)",
        } as React.CSSProperties
      }
      className={`${focused ? "pointer-events-auto" : "pointer-events-none"} fixed left-0 top-0 z-30 w-max max-w-[240px]`}
    >
      <style>{`
        [data-door-tether] { opacity: 0; }
        [data-stacks-door-label][data-docked] [data-door-tether] { opacity: 0.55; }
      `}</style>
      <span
        aria-hidden
        data-door-tether=""
        className="pointer-events-none absolute left-1/2 top-full h-4 w-px -translate-x-1/2 bg-foreground transition-opacity"
      />
      {/* Projection is written to the unanimated wrapper above. Entrance
          motion stays on this child, so a transform transition can never
          interpolate live screen coordinates from their 0px fallbacks. */}
      <button
        type="button"
        disabled={!focused}
        role={focused ? undefined : "status"}
        aria-live={focused ? undefined : "polite"}
        onClick={() => {
          if (focused === shown.id) runSceneInteractionActivation(shown.id);
        }}
        className={`flex max-w-[240px] origin-bottom items-center justify-center border-0 bg-transparent p-0 text-left text-[13px] leading-[1.25] text-foreground transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
          focused ? "min-h-12 min-w-12" : "min-h-0"
        } ${
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-1.5 scale-[0.96] opacity-0"
        }`}
      >
        <span className="stacks-glass-tooltip flex min-w-0 items-start gap-1 rounded-lg border px-2.5 py-1.5">
          <span className="min-w-0 whitespace-normal break-words">
            {shown.label}
          </span>
          {shown.external ? (
            <ArrowUpRightIcon
              aria-hidden="true"
              className="mt-px shrink-0"
              size={13}
              weight="bold"
            />
          ) : null}
        </span>
      </button>
    </div>
  );
}
