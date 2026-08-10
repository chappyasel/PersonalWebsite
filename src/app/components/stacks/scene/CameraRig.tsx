"use client";

// Drives the camera from the drei scroll offset, publishes per-frame progress
// to the transient ref, flips activeUnit only on unit-boundary crosses, and
// registers the scroll element with the store for the DOM bridges.
import { useFrame, useThree } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { UNIT_COUNT } from "../data";
import { GRAB_HOVER, INERT_HOVER, progressRef, useStacks } from "../store";
import { isSeated, leaveSeat, SEAT_POSE, setSeatAmount } from "./seated";
import { cameraForAspect, TRAVEL_X } from "./worldLayout";

/** Field of view while seated. Travel runs a narrow 33 so one shelf unit
 * fills the frame; a horizon needs more room than a bookcase does. */
const SEAT_FOV = 40;
/** Per-frame approach on the 0→1 seat blend: ~0.9 s door to door at 60 fps.
 * Slower reads as a cutscene, faster reads as a teleport. */
const SEAT_EASE = 0.055;
/** How far the travel offset may drift before the seat is dropped. Anything
 * that moves the room — wheel, rail, deep link, travelTo — wins over sitting;
 * this is the one place that has to notice, so SitChair does not have to
 * subscribe to five different input paths. */
const SEAT_TRAVEL_TOLERANCE = 0.0015;

const UP = new THREE.Vector3(0, 1, 0);

export default function CameraRig() {
  const scroll = useScroll();
  const look = useRef(new THREE.Vector3(0, -0.05, -0.2));
  const prevActive = useRef(0);
  // 0→1 while the mobile panel is open: dolly toward the unit, kill the bob.
  const lean = useRef(0);
  // Travel height, integrated separately from camera.position.y. The seat
  // blend writes camera.position.y outright, and damping toward a target from
  // an already-blended value feeds back on itself.
  const baseY = useRef(0);
  // Raw 0→1 seat approach, its eased twin, and the offset the seat was taken
  // at (travel away from it stands you up).
  const seat = useRef(0);
  const wasSeated = useRef(false);
  const seatOffset = useRef(0);
  const seatAim = useRef(new THREE.Vector3());
  const seatEye = useRef(new THREE.Vector3());
  const travelEye = useRef(new THREE.Vector3());
  const orient = useRef(new THREE.Matrix4());
  const qTravel = useRef(new THREE.Quaternion());
  const qSeat = useRef(new THREE.Quaternion());
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const pose = useMemo(
    () => cameraForAspect(size.width / size.height),
    [size.width, size.height],
  );

  // Apply distance/fov when the pose changes (mount, resize, orientation).
  useEffect(() => {
    baseY.current = camera.position.y;
    camera.position.z = pose.z;
    if ("fov" in camera) {
      (camera as THREE.PerspectiveCamera).fov = pose.fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
  }, [camera, pose]);

  useEffect(() => {
    const el = scroll.el;
    el.classList.add("stacks-scroll");
    const state = useStacks.getState();
    state.setScrollEl(el);
    // Instant jump: snap drei's damped offset (its internal target ref and the
    // eased value) plus our look target so deep-links land without a flythrough.
    const scrollTarget = (
      scroll as unknown as { scroll: { current: number } }
    ).scroll;
    const clampedOffset = (unit: number) => {
      const raw = UNIT_COUNT > 1 ? unit / (UNIT_COUNT - 1) : 0;
      return Math.min(1, Math.max(0, raw));
    };
    state.setJumpTo((unit: number) => {
      const max = el.scrollWidth - el.clientWidth;
      const offset = clampedOffset(unit);
      el.scrollLeft = offset * max;
      scrollTarget.current = offset;
      scroll.offset = offset;
      progressRef.current = offset;
      const targetX = offset * TRAVEL_X;
      look.current.set(targetX, -0.08, -0.2);
      const active = Math.min(UNIT_COUNT - 1, Math.max(0, Math.round(unit)));
      prevActive.current = active;
      useStacks.getState().setActiveUnit(active);
    });
    // Damped travel: write the damp target directly (plus scrollLeft so the
    // native element agrees) — never depends on the scroll event.
    state.setTravelTo((unit: number) => {
      const max = el.scrollWidth - el.clientWidth;
      const offset = clampedOffset(unit);
      el.scrollLeft = offset * max;
      scrollTarget.current = offset;
    });
    // Pointer cursor for hoverable scene objects — the scroll el owns events.
    const unsubscribeCursor = useStacks.subscribe((s) => {
      if (s.dragging) el.style.cursor = "grabbing";
      else if (s.hovered?.startsWith(GRAB_HOVER)) el.style.cursor = "grab";
      else if (s.hovered && !s.hovered.startsWith(INERT_HOVER))
        el.style.cursor = "pointer";
      else el.style.cursor = "";
    });
    return () => {
      unsubscribeCursor();
      const cleanup = useStacks.getState();
      cleanup.setScrollEl(null);
      cleanup.setJumpTo(null);
      cleanup.setTravelTo(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroll.el]);

  useFrame(({ camera, pointer, clock }) => {
    const offset = scroll.offset;
    progressRef.current = offset;
    const targetX = offset * TRAVEL_X;
    const t = clock.elapsedTime;
    const busy = useStacks.getState().panelState !== "closed";
    lean.current += ((busy ? 1 : 0) - lean.current) * 0.08;
    const calm = 1 - lean.current;

    // The seat. Moving the room always beats sitting in it, so the offset the
    // seat was taken at is the escape hatch for every travel path at once.
    if (isSeated() && !wasSeated.current) seatOffset.current = offset;
    if (
      isSeated() &&
      Math.abs(offset - seatOffset.current) > SEAT_TRAVEL_TOLERANCE
    ) {
      leaveSeat();
    }
    wasSeated.current = isSeated();
    seat.current += ((isSeated() ? 1 : 0) - seat.current) * SEAT_EASE;
    if (seat.current < 0.0004) seat.current = 0;
    if (seat.current > 0.9996) seat.current = 1;
    const s = seat.current * seat.current * (3 - 2 * seat.current);
    setSeatAmount(s);

    // Travel pose, integrated whether or not it is the one being rendered —
    // standing up has to land on a live camera, not one frozen where it sat.
    baseY.current +=
      (pose.y + (pointer.y * 0.08 + Math.sin(t * 0.4) * 0.03) * calm -
        baseY.current) *
      0.05;
    const baseZ = pose.z - 0.6 * lean.current;
    look.current.x +=
      (targetX + pointer.x * 0.45 * calm - look.current.x) * 0.045;
    look.current.y +=
      ((pointer.y * 0.12 - 0.08) * calm - 0.08 * lean.current - look.current.y) * 0.05;

    if (s === 0) {
      camera.position.set(targetX, baseY.current, baseZ);
      camera.lookAt(look.current);
    } else {
      // Seated pose keeps a breath and the pointer parallax: a camera that
      // stops dead reads as a still image rather than a place you are in.
      const [ex, ey, ez] = SEAT_POSE.eye;
      const [tx, ty, tz] = SEAT_POSE.target;
      seatEye.current.set(
        ex,
        ey + Math.sin(t * 0.33) * 0.012 + pointer.y * 0.03,
        ez,
      );
      // The horizontal term is NEGATED, and that is not a taste call.
      //
      // The seat yaws the camera ~180°, which swaps which way screen-right
      // points in world space: standing (looking down -Z) screen-right is +X,
      // seated (looking down +Z) it is -X. Adding `pointer.x` to the aim's x
      // in both poses therefore pans the seated view the wrong way — the world
      // slides right when the pointer goes right, instead of the view turning
      // toward it. Vertical is untouched: a yaw cannot invert up.
      seatAim.current.set(tx - pointer.x * 0.9, ty + pointer.y * 0.35, tz);
      // Orientation is slerped, never lerped through the look POINT: the two
      // aim points sit on opposite sides of the camera, so a positional lerp
      // walks the target straight through the eye and the lookAt degenerates
      // mid-turn.
      travelEye.current.set(targetX, baseY.current, baseZ);
      orient.current.lookAt(travelEye.current, look.current, UP);
      qTravel.current.setFromRotationMatrix(orient.current);
      orient.current.lookAt(seatEye.current, seatAim.current, UP);
      qSeat.current.setFromRotationMatrix(orient.current);
      camera.position.set(
        targetX + (seatEye.current.x - targetX) * s,
        baseY.current + (seatEye.current.y - baseY.current) * s,
        baseZ + (seatEye.current.z - baseZ) * s,
      );
      camera.quaternion.slerpQuaternions(qTravel.current, qSeat.current, s);
    }
    // Only touched while the seat is in play; at s = 0 it lands back exactly
    // on the pose's own fov, so a resize still wins.
    const fov = pose.fov + (SEAT_FOV - pose.fov) * s;
    if (
      "fov" in camera &&
      Math.abs((camera as THREE.PerspectiveCamera).fov - fov) > 0.001
    ) {
      (camera as THREE.PerspectiveCamera).fov = fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }

    const active = Math.min(
      UNIT_COUNT - 1,
      Math.max(0, Math.round(offset * (UNIT_COUNT - 1))),
    );
    if (active !== prevActive.current) {
      prevActive.current = active;
      useStacks.getState().setActiveUnit(active);
    }
  });
  return null;
}
