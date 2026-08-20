"use client";

// Sit in the reading chair.
//
// The whole mechanic is three files that never import each other: this one
// owns the click and the ways out, CameraRig owns the easing (it is the only
// thing allowed to write camera.position), and SceneEnvironment reads the
// eased amount to bring the Washington skyline up behind you. `seated.ts` is
// the wire between them.
//
// Nothing is downloaded to make this work — the view on the other side is the
// sky shader, so sitting down costs no bytes.
import { useStacks } from "../store";
import React, { useEffect } from "react";

import { EggTrigger } from "./eggs";
import {
  isSeated,
  leaveSeat,
  requestSeat,
  resetSeat,
  subscribeSeated,
} from "./seated";

/** When the seat was taken. The escape listeners run in the capture phase, so
 * they see the seating click before r3f does; this is belt and braces for
 * pointer sequences that synthesise a second click. */
let satAt = 0;

/**
 * Wraps the chair. Click sits you down; the pointer gets the same finger every
 * other clickable prop gets, and the click is gated on the active unit and on
 * `e.delta` so a swipe past the unit still travels instead of seating you.
 */
const CHAIR_HOVER = "egg:chair";
/** Scene-graph name of the group holding whatever you sit in. */
export const SEAT_NODE = "stacks-seat";

/**
 * Seating rides a window `pointerup` keyed off the hover slot rather than
 * r3f's `onClick`, which is NOT reliable in this scene.
 *
 * r3f only delivers `onClick` to an object that was in the hit list at
 * POINTERDOWN (events-*.esm.js), and `Grabbable.tsx:262-273` already documents
 * that pointerdown does not dispatch under ScrollControls here. A missing
 * pointerdown therefore silently costs the click too. The failure is
 * asymmetric and that is what made it expensive: a synthetic
 * mouse.down/mouse.up from a test harness DOES seat you, so the mechanic
 * passes every automated check while never firing under a real trackpad. The
 * Golden Gate launcher hit the identical wall and settled on this same idiom.
 *
 * `EggTrigger` stays for the hover slot and the cursor — the slot is what this
 * listener keys off, so the chair can only be sat in from where the chair is.
 */
function useSeatClick(unitIndex: number) {
  useEffect(() => {
    // Where the press started, so a drag across the chair still travels
    // instead of seating you — the same intent as EggTrigger's `e.delta > 6`.
    let downX = 0;
    let downY = 0;
    let downOn = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        downOn = false;
        return;
      }
      downX = e.clientX;
      downY = e.clientY;
      downOn = useStacks.getState().hovered === CHAIR_HOVER;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") {
        downOn = false;
        return;
      }
      if (!downOn) return;
      downOn = false;
      const s = useStacks.getState();
      if (s.hovered !== CHAIR_HOVER) return;
      if (s.panelState !== "closed" || s.modalOpen || s.dragging) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      if (isSeated()) return;
      satAt = performance.now();
      requestSeat();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [unitIndex]);
}

export default function SitChair({
  unitIndex,
  children,
}: {
  unitIndex: number;
  children: React.ReactNode;
}) {
  useSeatEscape();
  useSeatClick(unitIndex);
  return (
    <EggTrigger
      unitIndex={unitIndex}
      hoverKey={CHAIR_HOVER}
      touchable={false}
      // Kept as a second path rather than removed: where r3f DOES deliver the
      // click it arrives first, and seating is idempotent.
      onTrigger={() => {
        const s = useStacks.getState();
        if (s.panelState !== "closed" || s.modalOpen) return;
        satAt = performance.now();
        requestSeat();
      }}
    >
      {/* Named so the seat pose can be MEASURED against whatever is actually
          in the chair slot, rather than written down from whichever model was
          there when someone last looked. SEAT_POSE was hard-coded off the
          eames hull and became silently wrong the moment the couch replaced
          it — the camera kept working, it just sat in the wrong place, which
          is the failure mode a constant cannot warn you about. */}
      <group name={SEAT_NODE}>{children}</group>
    </EggTrigger>
  );
}

/**
 * Three ways out, because a camera you cannot leave is a trap: click anywhere,
 * press Escape, or scroll. The click listener is on window in the CAPTURE
 * phase so standing up swallows that click rather than also opening whatever
 * book happened to be under the pointer. Scrolling is not handled here —
 * CameraRig already watches the travel offset and drops the seat the moment
 * the room moves, which covers the wheel, the rail, deep links and travelTo
 * in one place.
 *
 * The same effect mirrors the seated flag into the store. The module is the
 * source of truth (CameraRig and the sky read it every frame and must not go
 * through React), but the DOM side has no other way to know.
 */
function useSeatEscape() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !isSeated()) return;
      e.stopPropagation();
      leaveSeat();
    };
    const onClick = (e: MouseEvent) => {
      if (!isSeated() || performance.now() - satAt < 350) return;
      e.stopPropagation();
      e.preventDefault();
      leaveSeat();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick, true);
    const unsubscribe = subscribeSeated(() =>
      useStacks.getState().setSeated(isSeated()),
    );
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick, true);
      // This empty-deps effect is the chair/world lifetime, not a render
      // effect. Reset before unsubscribing so the store mirror also clears;
      // normal in-world rerenders and ordinary stand-up easing never run it.
      satAt = 0;
      resetSeat();
      unsubscribe();
    };
  }, []);
}
