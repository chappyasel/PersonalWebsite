"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Whether some text fits a box whole, so a caller can show less of it
 * rather than cut it off with an ellipsis. Put `whole` on an unseen copy
 * of the full text, positioned absolutely inside `room`; `fits` follows
 * the room's width and the `text` key.
 */
export function useFits<Room extends HTMLElement, Whole extends HTMLElement>(
  text: string,
) {
  const room = useRef<Room>(null);
  const whole = useRef<Whole>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const box = room.current;
    const full = whole.current;
    if (!box || !full) return;
    const check = () =>
      setFits(full.getBoundingClientRect().width <= box.clientWidth + 0.5);
    check();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(check);
    observer.observe(box);
    return () => observer.disconnect();
  }, [text]);
  return { room, whole, fits };
}
