"use client";

import { worldBoot } from "../boot/worldBootSession";
import { UNIT_COUNT } from "../data";
import { roomWindowEvents } from "../room/roomEvents";
import { progressRef, useStacks } from "../store";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { useDesktopReducedMotion } from "~/lib/desktopMotionPreference";

import { freeRoamDiagnosticsController } from "./freeRoamDiagnostics";
import {
  HUD_MOBILE_TRAVEL_MAX_PX,
  HUD_MOUSE_MAX_PX,
  HUD_TRAVEL_MAX_PX,
  advanceHudCameraDrift,
  hudCameraDriftController,
} from "./hudCameraDriftControl";
import { screenshotModeController } from "./screenshotMode";
import { STACKS_DESKTOP_MIN_WIDTH, ogCaptureFromSearch } from "./worldLayout";

const MEDIA_QUERY = `(min-width: ${STACKS_DESKTOP_MIN_WIDTH}px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)`;
const MOBILE_MEDIA_QUERY = `(width < ${STACKS_DESKTOP_MIN_WIDTH}px) and (prefers-reduced-motion: no-preference)`;
const serverProfile = () => "off" as const;
const MOBILE_HUD_TARGETS =
  ".stacks-mobile-hud-drift, [data-stacks-mobile-sheet-drift]";
const SIDEBAR_TARGETS =
  "[data-stacks-desktop-dock], [data-stacks-details-toggle-shell]";
type HudTarget = { property: "translate" | "transform"; original: string };
const HUD_TARGETS = [
  ".stacks-hud-drift",
  ".stacks-debug-launchers",
  "[data-stacks-desktop-dock]",
  "[data-stacks-details-toggle-shell]",
  "[data-stacks-portal-label]",
  "[data-stacks-globe-label]",
  "[data-prop-caption]",
].join(",");

function writeOffset(
  element: HTMLElement,
  target: HudTarget,
  x: number,
  y = 0,
) {
  element.style[target.property] =
    x === 0 && y === 0
      ? target.original
      : target.property === "transform"
        ? y === 0
          ? `translateX(${x}px)`
          : `translate(${x}px, ${y}px)`
        : `${x}px ${y === 0 ? "0" : `${y}px`}`;
}
const getProfile = () =>
  window.matchMedia(MEDIA_QUERY).matches
    ? "desktop"
    : window.matchMedia(MOBILE_MEDIA_QUERY).matches
      ? "mobile"
      : "off";
function subscribeMedia(listener: () => void) {
  const queries = [MEDIA_QUERY, MOBILE_MEDIA_QUERY].map((query) =>
    window.matchMedia(query),
  );
  for (const query of queries) query.addEventListener("change", listener);
  return () => {
    for (const query of queries) query.removeEventListener("change", listener);
  };
}

/** Read the current frame's eased section travel after CameraRig publishes it. */
function DriftFrame({ mobile }: { mobile: boolean }) {
  const canvas = useThree((state) => state.gl.domElement);
  const targets = useRef(new Map<HTMLElement, HudTarget>());
  const previousProgress = useRef<number | null>(null);
  const offset = useRef(0);
  const mouseOffset = useRef({ x: 0, y: 0 });
  const renderedOffset = useRef({ x: 0, y: 0 });
  const heldPointers = useRef(new Set<number>());

  useEffect(() => {
    if (!mobile) return;
    const shell = canvas.closest(".stacks-world-shell");
    const held = heldPointers.current;
    const press = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        shell?.contains(event.target) &&
        event.target.closest(MOBILE_HUD_TARGETS)
      )
        held.add(event.pointerId);
    };
    const release = (event: PointerEvent) => held.delete(event.pointerId);
    const clear = () => held.clear();
    // Capture observes a press before rail scrubbing takes pointer capture.
    // Coordinates stay frozen under the finger; native clicks/gestures pass through.
    roomWindowEvents.addEventListener("pointerdown", press, {
      capture: true,
      passive: true,
    });
    roomWindowEvents.addEventListener("pointerup", release, {
      capture: true,
      passive: true,
    });
    roomWindowEvents.addEventListener("pointercancel", release, {
      capture: true,
      passive: true,
    });
    roomWindowEvents.addEventListener("lostpointercapture", release, {
      capture: true,
      passive: true,
    });
    roomWindowEvents.addEventListener("blur", clear);
    return () => {
      roomWindowEvents.removeEventListener("pointerdown", press, true);
      roomWindowEvents.removeEventListener("pointerup", release, true);
      roomWindowEvents.removeEventListener("pointercancel", release, true);
      roomWindowEvents.removeEventListener("lostpointercapture", release, true);
      roomWindowEvents.removeEventListener("blur", clear);
      held.clear();
    };
  }, [canvas, mobile]);

  useEffect(() => {
    const shell = canvas.closest<HTMLElement>(".stacks-world-shell");
    if (!shell) return;
    const elements = targets.current;
    previousProgress.current = null;
    offset.current = 0;
    mouseOffset.current.x = 0;
    mouseOffset.current.y = 0;
    renderedOffset.current.x = 0;
    renderedOffset.current.y = 0;
    const refresh = () => {
      for (const [element, target] of elements) {
        if (!shell.contains(element)) {
          writeOffset(element, target, 0);
          elements.delete(element);
        }
      }
      for (const element of shell.querySelectorAll<HTMLElement>(
        mobile ? MOBILE_HUD_TARGETS : HUD_TARGETS,
      )) {
        if (elements.has(element)) continue;
        // The sidebar's translate has a 360ms CSS hide/show transition.
        // Its transform is independent and unanimated, so frame updates land
        // immediately without overriding the sidebar's retracted position.
        const property = element.matches(SIDEBAR_TARGETS)
          ? "transform"
          : "translate";
        const target = { property, original: element.style[property] } as const;
        elements.set(element, target);
        if (renderedOffset.current.x !== 0 || renderedOffset.current.y !== 0)
          writeOffset(
            element,
            target,
            renderedOffset.current.x,
            renderedOffset.current.y,
          );
      }
    };
    refresh();
    // Refresh only when elements mount or unmount, never on frame/style writes
    // or the diagnostics HUD's periodic text updates.
    const observer = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes, ...record.removedNodes].some(
            (node) => node.nodeType === 1,
          ),
        )
      )
        refresh();
    });
    observer.observe(shell, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      for (const [element, target] of elements) writeOffset(element, target, 0);
      elements.clear();
    };
  }, [canvas, mobile]);

  useFrame((scene, delta) => {
    const settings = hudCameraDriftController.getSnapshot();
    const boot = worldBoot.getView();
    const state = useStacks.getState();
    const active =
      boot.revealed &&
      boot.presentation === "live" &&
      !state.visionRideRoomHidden &&
      !state.modelArtifactHandoff &&
      !freeRoamDiagnosticsController.getSnapshot().enabled &&
      !screenshotModeController.getSnapshot().enabled;
    const progress = progressRef.current;
    const previous = previousProgress.current;
    const travelActive = active && settings.enabled;
    const velocity =
      travelActive && previous !== null && delta > 0
        ? ((progress - previous) * (UNIT_COUNT - 1)) / delta
        : 0;
    previousProgress.current = travelActive ? progress : null;
    // Rebase progress while held so releasing cannot accumulate a travel kick.
    if (mobile && travelActive && heldPointers.current.size > 0) return;
    offset.current = travelActive
      ? advanceHudCameraDrift(
          offset.current,
          velocity,
          delta,
          mobile ? HUD_MOBILE_TRAVEL_MAX_PX : HUD_TRAVEL_MAX_PX,
        )
      : 0;
    let combinedX = offset.current;
    let combinedY = 0;
    if (!mobile && active && settings.mouseEnabled) {
      // Read the existing pointer once, without another listener, React state
      // update, animation loop, or inherited CSS property.
      const x = -Math.max(-1, Math.min(1, scene.pointer.x)) * HUD_MOUSE_MAX_PX;
      const y = Math.max(-1, Math.min(1, scene.pointer.y)) * HUD_MOUSE_MAX_PX;
      if (
        (x !== mouseOffset.current.x || y !== mouseOffset.current.y) &&
        delta > 0
      ) {
        const weight = 1 - Math.exp(-8 * Math.min(delta, 1 / 60));
        mouseOffset.current.x += (x - mouseOffset.current.x) * weight;
        mouseOffset.current.y += (y - mouseOffset.current.y) * weight;
        if (Math.abs(x - mouseOffset.current.x) < 0.005)
          mouseOffset.current.x = x;
        if (Math.abs(y - mouseOffset.current.y) < 0.005)
          mouseOffset.current.y = y;
      }
      // Keep the approved travel curve and cap; mouse motion yields to travel.
      const mouseWeight =
        1 - Math.min(1, Math.abs(offset.current) / HUD_TRAVEL_MAX_PX);
      combinedX += mouseOffset.current.x * mouseWeight;
      combinedY = mouseOffset.current.y * mouseWeight;
    } else if (mouseOffset.current.x !== 0 || mouseOffset.current.y !== 0) {
      mouseOffset.current.x = 0;
      mouseOffset.current.y = 0;
    }
    const x = Math.round(combinedX * 10) / 10;
    const y = Math.round(combinedY * 10) / 10;
    if (renderedOffset.current.x === x && renderedOffset.current.y === y)
      return;
    renderedOffset.current.x = x;
    renderedOffset.current.y = y;
    // Direct translations avoid changing an inherited variable above every
    // resident content section. At rest, no DOM writes occur.
    for (const [element, target] of targets.current)
      writeOffset(element, target, x, y);
  });
  return null;
}

function EligibleDrift({ travelEnabled }: { travelEnabled: boolean }) {
  const profile = useSyncExternalStore(
    subscribeMedia,
    getProfile,
    serverProfile,
  );
  return profile !== "off" &&
    (profile !== "mobile" || travelEnabled) &&
    !ogCaptureFromSearch(window.location.search) ? (
    <DriftFrame key={profile} mobile={profile === "mobile"} />
  ) : null;
}

export default function HudCameraDrift() {
  const reducedMotion = useDesktopReducedMotion();
  const { enabled, mouseEnabled } = useSyncExternalStore(
    hudCameraDriftController.subscribe,
    hudCameraDriftController.getSnapshot,
    hudCameraDriftController.getSnapshot,
  );
  // No frame subscription or DOM work while the effect is off.
  return !reducedMotion && (enabled || mouseEnabled) ? (
    <EligibleDrift travelEnabled={enabled} />
  ) : null;
}
