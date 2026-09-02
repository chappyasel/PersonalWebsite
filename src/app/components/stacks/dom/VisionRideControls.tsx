"use client";

import { sceneAudio } from "../audio/sceneAudio";
import { recordFieldNoteEvent } from "../fieldNotes/progress";
import { useStacks } from "../store";
import {
  VISION_RIDE_TOUCH,
  visionRideTouchRuntime,
} from "../visionRide/visionRideTouch";
import { useEffect, useRef } from "react";

import { capture } from "~/lib/analytics";

export default function VisionRideControls() {
  const phase = useStacks((state) => state.visionRidePhase);
  const announcement = useStacks((state) => state.visionRideAnnouncement);
  const exitMethod = useStacks((state) => state.visionRideExitMethod);
  const startedAt = useStacks((state) => state.visionRideStartedAt);
  const sessionFailed = useStacks((state) => state.visionRideSessionFailed);
  const button = useRef<HTMLButtonElement>(null);
  const previousPhase = useRef(phase);
  const lastExitMethod = useRef(exitMethod);
  const lastStartedAt = useRef(startedAt);
  const failureReported = useRef(false);
  const enteredFrame = useRef<number | null>(null);
  const touchPointerId = useRef<number | null>(null);
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    if (exitMethod) lastExitMethod.current = exitMethod;
    if (startedAt !== null) lastStartedAt.current = startedAt;
  }, [exitMethod, startedAt]);

  useEffect(() => {
    const active = phase !== "idle";
    if (active) document.documentElement.dataset.visionRide = phase;
    else delete document.documentElement.dataset.visionRide;
    if (phase !== "cruising") {
      touchPointerId.current = null;
      visionRideTouchRuntime.reset();
    }

    if (phase === "cruising" && previousPhase.current !== "cruising") {
      enteredFrame.current = requestAnimationFrame(() => {
        enteredFrame.current = requestAnimationFrame(() => {
          enteredFrame.current = null;
          const state = useStacks.getState();
          if (state.visionRidePhase === "cruising") {
            recordFieldNoteEvent({
              type: "vision-ride-entered",
              profile: state.visionRideSessionProfile,
            });
            capture("homepage_vision_ride_entered", {});
          }
        });
      });
      requestAnimationFrame(() =>
        button.current?.focus({ preventScroll: true }),
      );
    }
    if (phase !== "cruising" && enteredFrame.current !== null) {
      cancelAnimationFrame(enteredFrame.current);
      enteredFrame.current = null;
    }
    if (phase === "idle" && previousPhase.current !== "idle") {
      const method = lastExitMethod.current ?? "button";
      const began = lastStartedAt.current;
      capture("homepage_vision_ride_exited", {
        dwell_ms:
          began === null
            ? 0
            : Math.max(0, Math.round(performance.now() - began)),
        exit_method: method,
      });
      lastExitMethod.current = null;
      lastStartedAt.current = null;
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            '[role="region"][aria-label="Horizontal scene navigation"]',
          )
          ?.focus({ preventScroll: true });
      });
    }
    previousPhase.current = phase;
  }, [phase]);

  useEffect(() => {
    if (!sessionFailed || failureReported.current) return;
    failureReported.current = true;
    capture("homepage_vision_ride_load_failed", { stage: "model" });
  }, [sessionFailed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        useStacks.getState().visionRidePhase === "idle"
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      useStacks.getState().requestVisionRideExit("escape");
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  useEffect(
    () => () => {
      delete document.documentElement.dataset.visionRide;
      if (enteredFrame.current !== null)
        cancelAnimationFrame(enteredFrame.current);
      visionRideTouchRuntime.reset();
      sceneAudio.stopVisionRide();
      useStacks.getState().resetVisionRide();
    },
    [],
  );

  if (phase === "idle")
    return (
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    );

  return (
    <div className="stacks-vision-ride-controls pointer-events-none fixed inset-0 z-[90]">
      <button
        ref={button}
        type="button"
        aria-label="Remove Vision Pro"
        className="pointer-events-auto fixed inset-0 cursor-default bg-transparent outline-none"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          if (event.pointerType !== "touch" || reducedMotion) {
            useStacks.getState().requestVisionRideExit("button");
            return;
          }
          if (phase !== "cruising") return;
          touchPointerId.current = event.pointerId;
          visionRideTouchRuntime.begin(event.clientX, event.clientY);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (
            event.pointerType !== "touch" ||
            touchPointerId.current !== event.pointerId
          )
            return;
          visionRideTouchRuntime.move(
            event.clientX,
            event.clientY,
            window.innerWidth,
            window.innerHeight,
          );
        }}
        onPointerUp={(event) => {
          if (
            event.pointerType !== "touch" ||
            touchPointerId.current !== event.pointerId
          )
            return;
          touchPointerId.current = null;
          const dragged = visionRideTouchRuntime.end();
          suppressClickUntil.current =
            performance.now() + VISION_RIDE_TOUCH.suppressClickMs;
          if (!dragged) useStacks.getState().requestVisionRideExit("button");
          event.preventDefault();
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (touchPointerId.current !== event.pointerId) return;
          touchPointerId.current = null;
          visionRideTouchRuntime.end();
        }}
        onClick={(event) => {
          // Keyboard activation has detail 0 and must never inherit a touch
          // drag's suppression window.
          if (
            event.detail !== 0 &&
            performance.now() < suppressClickUntil.current
          ) {
            event.preventDefault();
            return;
          }
          useStacks.getState().requestVisionRideExit("button");
        }}
      >
        <span className="sr-only">Remove Vision Pro</span>
      </button>
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
      <style>{`
        html[data-vision-ride] .stacks-og-ui > * {
          opacity: 0 !important;
          pointer-events: none !important;
          transition: opacity 180ms ease-out !important;
        }
      `}</style>
    </div>
  );
}
