"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { useModalState } from "../contexts/BookPreviewContext";

const Modal = dynamic(
  () => import("./Modal").then((module) => module.Modal),
  { ssr: false },
);

export function ModalHost() {
  const { isModalOpen } = useModalState();
  // Mount the modal chunk before the first click rather than because of it.
  // Loading it on open lands the modal a commit too late for framer-motion's
  // shared `layoutId` handoff, so the modal fades in instead of morphing out of
  // the book cover. Warming on idle keeps it off the critical path.
  const [isWarm, setIsWarm] = useState(false);

  useEffect(() => {
    if (isWarm) return;

    const warm = () => setIsWarm(true);
    const events = ["pointermove", "pointerdown", "keydown", "touchstart"];
    events.forEach((event) =>
      window.addEventListener(event, warm, { once: true, passive: true }),
    );

    const supportsIdle = "requestIdleCallback" in window;
    const idleHandle = supportsIdle
      ? window.requestIdleCallback(warm, { timeout: 2000 })
      : window.setTimeout(warm, 500);

    return () => {
      events.forEach((event) => window.removeEventListener(event, warm));
      if (supportsIdle) window.cancelIdleCallback(idleHandle);
      else window.clearTimeout(idleHandle);
    };
  }, [isWarm]);

  return isModalOpen || isWarm ? <Modal /> : null;
}
