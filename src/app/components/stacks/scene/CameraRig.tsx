"use client";

// Drives the camera from the drei scroll offset, publishes per-frame progress
// to the transient ref, flips activeUnit only on unit-boundary crosses, and
// registers the scroll element with the store for the DOM bridges.
import { useFrame, useThree } from "@react-three/fiber";
import { useScroll } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { UNIT_COUNT } from "../data";
import {
  GRAB_HOVER,
  INERT_HOVER,
  panelCoverageRef,
  progressRef,
  useStacks,
} from "../store";
import { isSeated, leaveSeat, SEAT_POSE, setSeatAmount } from "./seated";
import { cameraForAspect, TRAVEL_X } from "./worldLayout";

/** Field of view while seated. Travel runs a narrow 33 so one shelf unit
 * fills the frame; a horizon needs more room than a bookcase does. */
const SEAT_FOV = 40;
/** Rate constant for the 0→1 seat blend, per SECOND rather than per frame.
 *
 * Per-frame easing is what the rest of this rig uses and it is wrong here.
 * The trip is 5.4 world units, about 5.6 m of room, and a per-frame constant
 * makes its duration a function of the display: measured on a 120 Hz panel the
 * old 0.055 landed the whole walk in roughly 250 ms, so the thing tuned to
 * read as walking read as a teleport on exactly the hardware most likely to
 * see it. 2.6/s settles in about 1.8 s on any display.
 *
 * A brisk walk would take four seconds. This is faster than a person, and
 * deliberately: it is a transition, not a cutscene. */
const SEAT_RATE = 2.6;
/** The walk owns the first 70% of the blend, the turn-and-sit the last 45%.
 * They overlap deliberately: a person starts turning toward a chair before
 * they have finished arriving at it, and a hard handover reads as two
 * separate animations played back to back. */
const WALK_END = 0.7;
const SIT_START = 0.55;
/** How far short of the seat you stand before dropping into it, in z. The
 * chair hull ends at z 0.773 and the seated eye is 0.80, so 0.55 puts the
 * standing pose just clear of the upholstery on the side you approach from. */
const STAND_BACK = 0.55;
/** Walking cadence, rad/s. 11 is ~105 steps per minute, an unhurried indoor
 * walk. The bob rides a gait envelope that is zero at both ends, so the
 * camera never bobs while standing still or while seated. */
const GAIT_RATE = 11;

const smoothstep = (x: number) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};
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
  // Damped copy of the sheet's screen coverage, driving the frustum offset.
  const framing = useRef(0);
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
  // Walk-to-the-chair scratch: Bezier control point, the position along it,
  // and the point on the chair you keep your eyes on while approaching.
  const ctrl = useRef(new THREE.Vector3());
  const walkPos = useRef(new THREE.Vector3());
  const chairLook = useRef(new THREE.Vector3());
  const orient = useRef(new THREE.Matrix4());
  const qTravel = useRef(new THREE.Quaternion());
  const qWalk = useRef(new THREE.Quaternion());
  const qSeat = useRef(new THREE.Quaternion());
  const qMix = useRef(new THREE.Quaternion());
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

  useFrame(({ camera, pointer, clock }, delta) => {
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
    // Clamped: a backgrounded tab hands back one enormous delta on return,
    // and an unclamped exponential would snap the visitor into the chair.
    const dt = delta > 0.05 ? 0.05 : delta;
    seat.current +=
      ((isSeated() ? 1 : 0) - seat.current) * (1 - Math.exp(-SEAT_RATE * dt));
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
    look.current.y += ((pointer.y * 0.12 - 0.08) * calm - look.current.y) * 0.05;

    // Recentre into whatever strip of screen the mobile sheet has left us.
    // The sheet covers the bottom of the window, so a shelf centred in the
    // full canvas sits low in the part you can actually see. Aiming the
    // camera down was the old fix and it was wrong twice over: it is a
    // perspective change rather than a framing one, so the shelf keyed and
    // the horizon tilted, and it was a fixed amount while the sheet now has
    // three detents. A frustum offset is the exact answer — same projection,
    // image shifted up by exactly half the covered height.
    const coverage =
      panelCoverageRef.current > 0
        ? panelCoverageRef.current
        : lean.current * 0.5;
    framing.current += (coverage - framing.current) * 0.12;
    const persp = camera as THREE.PerspectiveCamera;
    if (framing.current > 0.002) {
      persp.setViewOffset(
        size.width,
        size.height,
        0,
        (size.height * framing.current) / 2,
        size.width,
        size.height,
      );
    } else if (persp.view?.enabled) {
      persp.clearViewOffset();
    }

    let seatBlend = 0;
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
      // You walk over to the chair, then you turn round and sit in it. Those
      // are two motions, and blending straight from the travel pose to the
      // seated pose collapses them into one: a single lerp slides the camera
      // sideways through the room while it spins, which is why this read as
      // "the room turned around me" rather than "I walked over there".
      //
      // `walk` carries the position, `sit` carries the turn and the drop.
      const walk = smoothstep(s / WALK_END);
      const sit = smoothstep((s - SIT_START) / (1 - SIT_START));
      // The horizontal term is NEGATED, and that is not a taste call.
      //
      // The seat yaws the camera ~180°, which swaps which way screen-right
      // points in world space: standing (looking down -Z) screen-right is +X,
      // seated (looking down +Z) it is -X. Adding `pointer.x` to the aim's x
      // in both poses therefore pans the seated view the wrong way — the world
      // slides right when the pointer goes right, instead of the view turning
      // toward it. Vertical is untouched: a yaw cannot invert up.
      seatAim.current.set(tx - pointer.x * 0.9, ty + pointer.y * 0.35, tz);
      travelEye.current.set(targetX, baseY.current, baseZ);

      // The walk, as a quadratic Bezier rather than a straight line. The
      // chair stands between the camera and the shelf, so a diagonal glide
      // would cut the corner and pass through where the armrest is. Holding
      // the control point near the travel z spends the first half of the
      // move going forward and the second half going across, which is the
      // path a person actually takes.
      const standZ = ez + STAND_BACK;
      ctrl.current.set(
        targetX + (ex - targetX) * 0.15,
        baseY.current,
        baseZ + (standZ - baseZ) * 0.55,
      );
      const iw = 1 - walk;
      const b0 = iw * iw;
      const b1 = 2 * iw * walk;
      const b2 = walk * walk;
      // Gait envelope: zero at both ends, so the camera never bobs while
      // standing at the shelf or while settled in the chair.
      const gait = walk * (1 - walk) * 4;
      walkPos.current.set(
        b0 * targetX + b1 * ctrl.current.x + b2 * ex,
        b0 * baseY.current +
          b1 * ctrl.current.y +
          b2 * baseY.current +
          Math.sin(t * GAIT_RATE) * 0.018 * gait,
        b0 * baseZ + b1 * ctrl.current.z + b2 * standZ,
      );
      walkPos.current.x += Math.sin(t * GAIT_RATE * 0.5) * 0.012 * gait;

      camera.position.set(
        walkPos.current.x + (seatEye.current.x - walkPos.current.x) * sit,
        walkPos.current.y + (seatEye.current.y - walkPos.current.y) * sit,
        walkPos.current.z + (seatEye.current.z - walkPos.current.z) * sit,
      );

      // Orientation is slerped, never lerped through the look POINT: the two
      // aim points sit on opposite sides of the camera, so a positional lerp
      // walks the target straight through the eye and the lookAt degenerates
      // mid-turn.
      //
      // Three poses, not two. Facing the seat's final aim for the whole trip
      // would have you walking backwards; facing the direction of travel
      // snaps the view the instant the walk starts. Looking AT the chair you
      // are heading for is what a person does, and it also means the 180°
      // turn happens while you are stationary, where it belongs.
      chairLook.current.set(ex, ey - 0.34, ez - 0.2);
      orient.current.lookAt(travelEye.current, look.current, UP);
      qTravel.current.setFromRotationMatrix(orient.current);
      orient.current.lookAt(camera.position, chairLook.current, UP);
      qWalk.current.setFromRotationMatrix(orient.current);
      orient.current.lookAt(seatEye.current, seatAim.current, UP);
      qSeat.current.setFromRotationMatrix(orient.current);
      qMix.current.slerpQuaternions(qTravel.current, qWalk.current, walk);
      camera.quaternion.slerpQuaternions(qMix.current, qSeat.current, sit);
      seatBlend = sit;
    }
    // Only touched while the seat is in play; at s = 0 it lands back exactly
    // on the pose's own fov, so a resize still wins. Keyed to the SIT phase,
    // not the whole blend: the frame widening while you are still crossing
    // the room reads as the room growing, and the widening is meant to be
    // the moment you settle and the horizon opens up.
    const fov = pose.fov + (SEAT_FOV - pose.fov) * seatBlend;
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
