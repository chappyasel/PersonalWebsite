"use client";

import { worldBoot } from "../boot/worldBootSession";
import { GOLF_STOP_POSITION, UNIT_COUNT } from "../data";
import { recordFieldNoteEvent } from "../fieldNotes/progress";
import { progressRef, useStacks } from "../store";
import { useEffect } from "react";

import { roomOverlayBlocksInput } from "~/lib/overlays/coordinator";
import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";

import { dimensionTravel } from "./dimensionTravel";
import { isEditableShortcutTarget } from "./editableShortcutTarget";

export type RoomDimension = "2d" | "3d";
let pending: { target: RoomDimension; fromLive: boolean } | null = null;

/** Keyboard and diagnostics share the same request and completion checks. */
export function requestRoomDimension(target: RoomDimension): boolean {
  const view = worldBoot.getView();
  const room = useStacks.getState();
  if (
    !worldBoot.getState().illustratedMode ||
    view.ogCapture ||
    view.status === "unstarted" ||
    view.status === "exited" ||
    view.status === "flattening" ||
    document.hidden ||
    roomOverlayBlocksInput() ||
    isUniversalSearchOpen() ||
    room.modalOpen ||
    room.dragging ||
    room.panelState !== "closed" ||
    room.visionRidePhase !== "idle" ||
    document.documentElement.matches(
      "[data-field-notes-open], [data-overlay-open], [data-prop-focus]",
    ) ||
    document.querySelector(".PhotoView-Portal")
  )
    return false;
  if (target === "3d" && view.worldMounted) return false;
  if (target === "2d" && !view.worldMounted && !view.recoverable) return false;
  pending = { target, fromLive: view.presentation === "live" };
  dimensionTravel.position =
    view.presentation === "live"
      ? progressRef.current * (UNIT_COUNT - 1)
      : (dimensionTravel.readIllustratedPosition?.() ??
        (room.golfStop ? GOLF_STOP_POSITION : room.activeUnit));
  dimensionTravel.revision++;
  if (target === "2d") {
    room.setHovered(null);
    room.setFocusedInteraction(null);
    worldBoot.request2D();
  } else worldBoot.request3D(true);
  return true;
}

export function roomDimensionKey(event: KeyboardEvent): RoomDimension | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.isComposing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    isEditableShortcutTarget(event.target) ||
    (event.target instanceof Element &&
      event.target.closest(
        '[contenteditable]:not([contenteditable="false"]), [role="dialog"]',
      ))
  )
    return null;
  if (event.key.toLowerCase() !== "r") return null;
  return worldBoot.getView().worldMounted ? "2d" : "3d";
}

export function useRoomDimensionKeys(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const observe = () => {
      if (!pending) return;
      const view = worldBoot.getView();
      const completed =
        pending.target === "2d"
          ? view.status === "illustrated" && view.interactionHeld
          : view.status === "live";
      if (completed) {
        const discovered =
          pending.target === "3d" ||
          (pending.fromLive && view.illustrationKey !== null);
        pending = null;
        if (discovered)
          recordFieldNoteEvent({ type: "dimension-transition-completed" });
      } else if (
        ["failed", "ineligible", "exited"].includes(view.status) ||
        (view.status === "illustrated" && !view.interactionHeld)
      ) {
        pending = null;
      }
    };
    const unsubscribe = worldBoot.subscribe(observe);
    const onKey = (event: KeyboardEvent) => {
      const dimension = roomDimensionKey(event);
      if (dimension && requestRoomDimension(dimension)) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unsubscribe();
      pending = null;
      dimensionTravel.position = null;
    };
  }, [active]);
}
