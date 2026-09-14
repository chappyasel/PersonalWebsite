"use client";

import { isEditableShortcutTarget } from "../input/editableShortcutTarget";
import { roomWindowEvents } from "../room/roomEvents";
import {
  getSceneInteraction,
  portalLabelActivation,
  projectPortal,
  runSceneInteractionActivation,
  subscribeSceneInteractions,
} from "../scene/interactionRegistry";
import { progressRef, touchWorldRef, useStacks } from "../store";
import { ArrowSquareOutIcon, ArrowsOutIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";

import { fitPortalLabelText } from "./fitPortalLabelText";
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
  // A touchscreen laptop can report a coarse primary pointer while a mouse
  // is in use. The latest input takes precedence over device capability.
  if (touchWorldRef.interactionPointerType !== "unknown")
    return touchWorldRef.interactionPointerType !== "touch";
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** What the label would show for an activation, flattened for comparison. */
function activationLabelKey(
  activation:
    | { kind: string; label: string; title?: string; actionLabel?: string }
    | null
    | undefined,
) {
  if (!activation) return "";
  return `${activation.kind}:${activation.label}:${activation.title ?? ""}:${activation.actionLabel ?? ""}`;
}

export default function PortalLabel() {
  const hovered = useStacks((s) => s.hovered);
  const focused = useStacks((s) => s.focusedInteraction);
  const dragging = useStacks((s) => s.dragging);
  const modalOpen = useStacks((s) => s.modalOpen);
  const panelState = useStacks((s) => s.panelState);
  const interactionId = focused ?? hovered;
  const [shown, setShown] = useState<{
    id: string;
    /** Title line: the destination of a Portal, or the object of an action. */
    label: string;
    detail: readonly string[];
    /** Outcome line below the destination or object title. */
    action: string | null;
    /** Side icon: square-out for external portals, arrows-out otherwise. */
    arrow: "external" | "internal" | "action";
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const setLabelVisible = useCallback((next: boolean) => {
    visibleRef.current = next;
    setVisible(next);
  }, []);
  const shownRef = useRef<typeof shown>(null);
  const node = useRef<HTMLDivElement>(null);
  const hadPortal = useRef(false);
  const eligibleRef = useRef(false);
  const desiredIdRef = useRef<string | null>(null);
  const exitTimer = useRef<number | null>(null);
  // A registration can change under a resting pointer: an action whose verb
  // flips when it runs (the Mac's "Closer look" / "Put it back", the pixel
  // boards' modes) re-registers with the new label while the pointer never
  // leaves. Re-resolve for that one case only; the rest of the room
  // registering and unregistering as it travels is not this label's business.
  const [registryVersion, setRegistryVersion] = useState(0);
  const resolvedLabelRef = useRef("");
  useEffect(() => {
    const unsubscribe = subscribeSceneInteractions(() => {
      const id = desiredIdRef.current;
      if (!id) return;
      const key = activationLabelKey(
        portalLabelActivation(getSceneInteraction(id)),
      );
      if (key !== resolvedLabelRef.current)
        setRegistryVersion((version) => version + 1);
    });
    return () => {
      unsubscribe();
    };
  }, []);
  const enterFrame = useRef<number | null>(null);
  const positionedId = useRef<string | null>(null);

  useEffect(() => {
    let press: { pointerId: number; x: number; y: number; id: string } | null =
      null;
    const releasePress = () => {
      if (!press) return;
      const state = useStacks.getState();
      if (state.pressedInteraction === press.id)
        state.setPressedInteraction(null);
      press = null;
    };
    const finishPress = (event: PointerEvent) => {
      if (event.pointerId === press?.pointerId) releasePress();
    };
    const movePress = (event: PointerEvent) => {
      if (
        event.pointerId === press?.pointerId &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > 6
      )
        releasePress();
    };
    const dismiss = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" ||
        !event.isPrimary ||
        event.button !== 0
      )
        return;
      const state = useStacks.getState();
      if (
        state.modalOpen ||
        state.panelState !== "closed" ||
        state.dragging ||
        state.visionRidePhase !== "idle" ||
        !(event.target instanceof Node) ||
        !state.scrollEl?.contains(event.target)
      )
        return;
      const spec = getSceneInteraction(state.hovered);
      if (spec) {
        press = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          id: spec.id,
        };
        state.setPressedInteraction(spec.id);
      }
      // Keep the current camera focus until the stationary release transfers
      // selection. Clearing it during another prop's press reverses the zoom
      // for the duration of the click, then reverses it again on release.
      if (state.focusedInteraction && !spec) state.setFocusedInteraction(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        isEditableShortcutTarget(event.target)
      )
        return;
      const state = useStacks.getState();
      if (
        !state.focusedInteraction ||
        state.modalOpen ||
        state.panelState !== "closed"
      )
        return;
      event.preventDefault();
      state.setFocusedInteraction(null);
      state.setHovered(null);
    };
    roomWindowEvents.addEventListener("pointerdown", dismiss);
    roomWindowEvents.addEventListener("pointermove", movePress);
    roomWindowEvents.addEventListener("pointerup", finishPress);
    roomWindowEvents.addEventListener("pointercancel", finishPress);
    roomWindowEvents.addEventListener("lostpointercapture", finishPress);
    roomWindowEvents.addEventListener("blur", releasePress);
    roomWindowEvents.addEventListener("keydown", escape);
    return () => {
      roomWindowEvents.removeEventListener("pointerdown", dismiss);
      roomWindowEvents.removeEventListener("pointermove", movePress);
      roomWindowEvents.removeEventListener("pointerup", finishPress);
      roomWindowEvents.removeEventListener("pointercancel", finishPress);
      roomWindowEvents.removeEventListener("lostpointercapture", finishPress);
      roomWindowEvents.removeEventListener("blur", releasePress);
      releasePress();
      roomWindowEvents.removeEventListener("keydown", escape);
    };
  }, []);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
      if (enterFrame.current !== null) cancelAnimationFrame(enterFrame.current);
    },
    [],
  );

  useEffect(() => {
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
    };
    window.addEventListener("pointermove", track, { passive: true });
    return () => window.removeEventListener("pointermove", track);
  }, []);

  useEffect(() => {
    const spec = getSceneInteraction(interactionId);
    const activation = portalLabelActivation(spec);
    resolvedLabelRef.current = activationLabelKey(activation);
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
      const portalAction =
        activation.kind === "portal"
          ? (activation.actionLabel ?? "View site")
          : null;
      const next =
        activation.kind === "portal"
          ? {
              id: spec.id,
              label: activation.label.replace(/\s*↗\s*$/, ""),
              detail: activation.detail ?? [],
              action:
                portalAction === "View site" &&
                activation.detail?.some((line) => line.trim())
                  ? null
                  : portalAction,
              arrow: activation.external
                ? ("external" as const)
                : ("internal" as const),
            }
          : {
              id: spec.id,
              label: activation.title ?? activation.label,
              detail: activation.detail ?? [],
              action: activation.title ? activation.label : null,
              arrow: "action" as const,
            };
      positionedId.current = null;
      setLabelVisible(false);
      shownRef.current = next;
      setShown(next);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [
    dragging,
    focused,
    interactionId,
    modalOpen,
    panelState,
    registryVersion,
    setLabelVisible,
  ]);

  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    let fittedText = false;
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
        // An unavailable or hidden object has no label position. Never turn
        // a selected object's label into a cursor tooltip while it recovers.
        if (
          !projected ||
          projected.behind ||
          !Number.isFinite(projected.x) ||
          !Number.isFinite(projected.y)
        ) {
          if (enterFrame.current !== null) {
            cancelAnimationFrame(enterFrame.current);
            enterFrame.current = null;
          }
          positionedId.current = null;
          element.style.visibility = "hidden";
          if (visibleRef.current) setLabelVisible(false);
          frame = requestAnimationFrame(place);
          return;
        }
        if (!fittedText) {
          const text = element.querySelector<HTMLElement>("[data-portal-text]");
          if (text) fitPortalLabelText(text);
          fittedText = true;
        }
        const anchor = projected;
        element.dataset.anchorSource = "object";
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
  const maxWidthClass =
    shown.id === "grab:tj-medallion:about" ? "max-w-[280px]" : "max-w-[240px]";
  return (
    <div
      ref={node}
      data-stacks-portal-label
      inert={!visible}
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
      className={`${focused ? "pointer-events-auto" : "pointer-events-none"} field-notes-glass-tooltip fixed z-30 w-max ${maxWidthClass} rounded-2xl border px-3.5 py-2.5 backdrop-blur-xl backdrop-saturate-150`}
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
      <Button
        type="button"
        variant="ghost"
        disabled={!visible || focused !== shown.id}
        role={focused ? undefined : "status"}
        aria-live={focused ? undefined : "polite"}
        onClick={() => {
          if (focused === shown.id) runSceneInteractionActivation(shown.id);
        }}
        className={`relative flex h-auto min-h-0 ${maxWidthClass} items-center justify-center gap-2 whitespace-normal rounded-none border-0 bg-transparent p-0 text-left font-serif text-[14px] font-normal leading-[1.25] text-inherit hover:bg-transparent hover:text-inherit disabled:opacity-100 [&_svg]:size-[1em] ${
          focused
            ? "after:absolute after:left-1/2 after:top-1/2 after:h-12 after:w-full after:min-w-12 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
            : ""
        }`}
      >
        {/* Keep the focused label's hit area at least 48px tall without making
            the visible glass inherit that height. */}
        {/* Keep the text together and center one action icon beside the full
            block, including wrapped titles, details, and local action text. */}
        <span
          data-portal-text=""
          className="flex min-w-0 flex-initial flex-col"
        >
          <span className="min-w-0 whitespace-normal break-words text-[15px] font-semibold">
            {shown.label}
          </span>
          {shown.detail.map((line) => (
            <span
              key={line}
              data-portal-detail=""
              className="mt-0.5 min-w-0 whitespace-normal break-words text-[13px] leading-[1.3] text-white/60"
            >
              {line}
            </span>
          ))}
          {shown.action ? (
            <span
              data-portal-action=""
              className="mt-1 min-w-0 whitespace-normal break-words text-[13px] leading-[1.3]"
            >
              {shown.action}
            </span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center self-center text-[15px]">
          {shown.arrow === "external" ? (
            <ArrowSquareOutIcon aria-hidden="true" size={15} weight="bold" />
          ) : (
            <ArrowsOutIcon aria-hidden="true" size={15} weight="bold" />
          )}
        </span>
      </Button>
    </div>
  );
}
