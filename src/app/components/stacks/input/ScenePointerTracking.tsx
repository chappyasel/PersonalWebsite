"use client";

import { roomWindowEvents } from "../room/roomEvents";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";

import { isUniversalSearchOpen } from "~/lib/universal-search/overlay";

/** Keep motion coordinates live over DOM chrome without forwarding its events
 * into the scene's hover/raycast handlers. Camera and HUD share this vector. */
export default function ScenePointerTracking() {
  const get = useThree((state) => state.get);
  useEffect(() => {
    const track = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || isUniversalSearchOpen()) return;
      const { pointer, size } = get();
      if (size.width <= 0 || size.height <= 0) return;
      // Fiber already measures the canvas. Client coordinates stay consistent
      // when the event target changes between the canvas, rail, and cards.
      pointer.set(
        ((event.clientX - size.left) / size.width) * 2 - 1,
        -((event.clientY - size.top) / size.height) * 2 + 1,
      );
    };
    roomWindowEvents.addEventListener("pointermove", track, {
      capture: true,
      passive: true,
    });
    return () =>
      roomWindowEvents.removeEventListener("pointermove", track, {
        capture: true,
      });
  }, [get]);
  return null;
}
