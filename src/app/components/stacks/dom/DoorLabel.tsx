"use client";

import { getSceneInteraction, projectDoor } from "../scene/interactionRegistry";
import { progressRef, useStacks } from "../store";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import {
  DOOR_LABEL_VIEWPORT_GUTTER,
  clampDoorLabelX,
} from "./doorLabelPlacement";

const INITIAL_DWELL_MS = 350;
const TRANSITION_MS = 200;
/** A door-to-door change must let the old label finish fading before its
 * contents are replaced, and a full exit must stay mounted through the last
 * transition frame. */
const SWITCH_DWELL_MS = TRANSITION_MS + 20;
const EXIT_MS = TRANSITION_MS + 20;

function isFinePointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export default function DoorLabel() {
  const hovered = useStacks((s) => s.hovered);
  const activeUnit = useStacks((s) => s.activeUnit);
  const dragging = useStacks((s) => s.dragging);
  const modalOpen = useStacks((s) => s.modalOpen);
  const panelState = useStacks((s) => s.panelState);
  const [shown, setShown] = useState<{
    id: string;
    label: string;
    external: boolean;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const shownRef = useRef<typeof shown>(null);
  const node = useRef<HTMLDivElement>(null);
  const hadDoor = useRef(false);
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
    const spec = getSceneInteraction(hovered);
    const door = spec?.activation?.kind === "door" ? spec.activation : null;
    const eligible =
      isFinePointer() &&
      door &&
      spec?.activeUnits.includes(activeUnit) &&
      !dragging &&
      !modalOpen &&
      panelState === "closed";
    if (!eligible || !door || !spec) {
      if (enterFrame.current !== null) cancelAnimationFrame(enterFrame.current);
      positionedId.current = null;
      setVisible(false);
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
      exitTimer.current = window.setTimeout(() => {
        shownRef.current = null;
        setShown(null);
      }, EXIT_MS);
      hadDoor.current = false;
      return;
    }
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    if (shownRef.current && shownRef.current.id !== spec.id) setVisible(false);
    const delay = hadDoor.current ? SWITCH_DWELL_MS : INITIAL_DWELL_MS;
    hadDoor.current = true;
    const timeout = window.setTimeout(() => {
      const next = {
        id: spec.id,
        label: door.label.replace(/\s*↗\s*$/, ""),
        external: door.external,
      };
      positionedId.current = null;
      setVisible(false);
      shownRef.current = next;
      setShown(next);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [activeUnit, dragging, hovered, modalOpen, panelState]);

  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    let previousProgress = progressRef.current;
    const place = () => {
      if (Math.abs(progressRef.current - previousProgress) > 0.000_002) {
        if (enterFrame.current !== null)
          cancelAnimationFrame(enterFrame.current);
        positionedId.current = null;
        setVisible(false);
        exitTimer.current = window.setTimeout(() => {
          shownRef.current = null;
          setShown(null);
        }, EXIT_MS);
        return;
      }
      previousProgress = progressRef.current;
      const element = node.current;
      const projected = projectDoor(shown.id);
      if (!element || !projected || projected.behind) {
        if (element) element.style.visibility = "hidden";
        if (positionedId.current === shown.id) {
          positionedId.current = null;
          setVisible(false);
        }
      } else {
        const dock = document.querySelector<HTMLElement>(
          '[data-stacks-desktop-dock]:not([data-hidden="true"])',
        );
        const dockRect = dock?.getBoundingClientRect() ?? null;
        const x = clampDoorLabelX(
          projected.x,
          element.offsetWidth,
          window.innerWidth,
          dockRect,
        );
        const y = Math.max(
          DOOR_LABEL_VIEWPORT_GUTTER + element.offsetHeight,
          Math.min(
            window.innerHeight - DOOR_LABEL_VIEWPORT_GUTTER,
            projected.y - 10,
          ),
        );
        // The positioned node is also the glass node. Keeping positioning on
        // a transformed parent made that parent the tooltip's compositing
        // boundary in Chromium, so its child could not blur the scene.
        element.style.setProperty("--door-label-x", `${x}px`);
        element.style.setProperty("--door-label-y", `${y}px`);
        element.style.visibility = "visible";
        if (positionedId.current !== shown.id) {
          positionedId.current = shown.id;
          if (enterFrame.current !== null)
            cancelAnimationFrame(enterFrame.current);
          // Paint one fully positioned, transparent frame before beginning
          // the entrance. Otherwise the transform's 0px CSS-variable
          // fallbacks can become the transition's starting coordinates.
          enterFrame.current = requestAnimationFrame(() => {
            if (shownRef.current?.id === shown.id) setVisible(true);
          });
        }
      }
      frame = requestAnimationFrame(place);
    };
    frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [shown]);

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
      className="pointer-events-none fixed left-0 top-0 z-30 w-max max-w-[240px]"
    >
      {/* Projection is written to the unanimated wrapper above. Entrance
          motion stays on this child, so a transform transition can never
          interpolate live screen coordinates from their 0px fallbacks. */}
      <div
        role="status"
        aria-live="polite"
        className={`stacks-glass-tooltip flex max-w-[240px] origin-bottom items-start gap-1 rounded-lg border px-2.5 py-1.5 text-left text-[13px] leading-[1.25] text-foreground transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-1.5 scale-[0.96] opacity-0"
        }`}
      >
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
      </div>
    </div>
  );
}
