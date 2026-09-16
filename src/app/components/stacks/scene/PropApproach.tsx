"use client";

// A prop's flight to the camera.
//
// Sits inside the Grabbable, like HeldFacing, so the carrier goes on owning
// the shelf pose, the contact shade, the collider and the hit test, while
// this group carries the visible prop from its rest pose to a spot in front
// of the camera and back. Both poses are resolved into the carrier's frame
// every frame, so the shared hover nod and any carry the carrier performs
// are cancelled rather than compounded: the near pose is camera-locked no
// matter what the shelf is doing.
//
// The near pose sits on the camera's optical axis, so it stays centred in the
// view however the camera parallaxes with the pointer (an earlier version
// aimed through the shelf's column and ended up cut off at the edge of a
// wide window). A small, damped offset and tilt follow the cursor at one fifth
// of their original strength. Hand gestures still turn the prop freely.
//
// Written for the Projects Mac (MacApproach.tsx is that prop's name for it);
// the About globe was the second prop to fly and the Homework icon the third.
// What differs between them is carried by props here: the globe keeps
// presses that land on it, because a drag on the near globe turns it, and it
// takes an extra pitch so the drag can tip it toward the poles.
//
// While a prop is near, PropCaption (dom/) shows its visitor caption from
// content/stacks/objects.md, keyed by the controller's id.
import { pressLandsInRoom } from "../dom/roomPress";
import { progressRef, useStacks } from "../store";
import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import {
  overlayCoordinator,
  registerOverlay,
} from "~/lib/overlays/coordinator";

import { focusPull } from "./focusPull";
import {
  PROP_APPROACH_LAMBDA,
  PROP_TURN_FLING_DECAY,
  PROP_TURN_HOME_DECAY,
  type PropApproach as PropApproachController,
  type PropTurn,
  nearPropApproach,
  propApproachBottomFraction,
  propApproachDistance,
  propApproachReleased,
  resetPropTurn,
  subscribePropApproaches,
  wrapPropTurn,
  wrapYaw,
} from "./propApproachState";
import { InspectedObjectFrames } from "./useRoomFrame";
import { roomWindowEvents } from "~/app/components/stacks/room/roomEvents";

const ORIGIN = new THREE.Vector3();
/** Ease rate for the extra pitch, per second: quick enough to feel attached
 * to the drag, slow enough not to jitter with it. */
const TILT_LAMBDA = 12;
/** One fifth of the original cursor follow. Position uses half-frame fractions;
 * rotation uses radians. */
const POINTER_FOLLOW = { x: 0.012, y: 0.008, yaw: 0.012, pitch: 0.007 };
const POINTER_FOLLOW_LAMBDA = 4;

export default function PropApproach({
  controller,
  unitIndex,
  height,
  width,
  fill,
  restRotation = [0, 0, 0],
  facePitch = 0,
  keepPressesOnProp = false,
  tilt,
  tiltLambda = TILT_LAMBDA,
  turn,
  innerRef,
  children,
}: {
  controller: PropApproachController;
  unitIndex: number;
  /** World-space extents of the prop, for framing. */
  height: number;
  width: number;
  /** Fraction of the viewport the prop fills when near. */
  fill?: number;
  /** Authored shelf yaw, applied here instead of on the model so the near
   * pose can square the prop to the camera. */
  restRotation?: [number, number, number];
  /** Backward lean of the face relative to the body, in radians. The near
   * pose pitches the body forward by this much so the FACE, not the casing,
   * meets the camera square. */
  facePitch?: number;
  /** A press that lands on the near prop itself is not a dismissal: it is
   * the start of a gesture on the prop (the globe's drag). Any other press
   * in the room still puts the prop back. */
  keepPressesOnProp?: boolean;
  /** Extra pitch about the camera's right axis, in radians, read every
   * frame and eased; written by a gesture on the prop. */
  tilt?: { current: number };
  /** Ease rate for the extra pitch, per second. Lower values settle gently. */
  tiltLambda?: number;
  /** A whole-prop turn by hand (beginPropTurn): yaw about the camera's up
   * axis and pitch about its right axis, read every frame and eased, with
   * the release's fling integrated here and everything levelled on the way
   * home. For a prop that turns as one piece; the globe spins its ball
   * through `tilt` and its own SpinProp instead. */
  turn?: PropTurn;
  /** The group carrying the prop, for callers that need to raycast it. */
  innerRef?: React.RefObject<THREE.Group | null>;
  children: React.ReactNode;
}) {
  const ownGroup = useRef<THREE.Group>(null);
  const group = innerRef ?? ownGroup;
  const progress = useRef(0);
  const startPosition = useRef(0);
  const wasNear = useRef(false);
  const tiltEased = useRef(0);
  const turnYawEased = useRef(0);
  const turnPitchEased = useRef(0);
  const turnWasNear = useRef(false);
  const follow = useRef({ x: 0, y: 0 });
  const get = useThree((state) => state.get);
  const still = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const [restX, restY, restZ] = restRotation;
  const restQuaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromEuler(new THREE.Euler(restX, restY, restZ)),
    [restX, restY, restZ],
  );
  const facePitchQuaternion = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(facePitch, 0, 0)),
    [facePitch],
  );
  const scratch = useMemo(
    () => ({
      cameraPosition: new THREE.Vector3(),
      cameraQuaternion: new THREE.Quaternion(),
      forward: new THREE.Vector3(),
      up: new THREE.Vector3(),
      right: new THREE.Vector3(),
      world: new THREE.Vector3(),
      centre: new THREE.Vector3(),
      local: new THREE.Vector3(),
      parentQuaternion: new THREE.Quaternion(),
      nearQuaternion: new THREE.Quaternion(),
      gestureQuaternion: new THREE.Quaternion(),
      gestureEuler: new THREE.Euler(),
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
    }),
    [],
  );

  const overlayLease = useRef<ReturnType<typeof registerOverlay> | null>(null);
  useEffect(() => {
    const reflect = () => {
      if (controller.near) {
        overlayLease.current ??= registerOverlay({
          kind: "object",
          settled: false,
          dismiss: () => controller.dismiss(),
        });
        overlayLease.current.update("open");
      } else overlayLease.current?.update("closing");
    };
    reflect();
    const unsubscribe = controller.subscribe(reflect);
    return () => {
      unsubscribe();
      overlayLease.current?.release();
      overlayLease.current = null;
    };
  }, [controller]);

  // The rest of the interface steps aside while a prop is up close, through
  // the same CSS exit the photo viewer uses (StacksHome's style block reads
  // this attribute beside `data-overlay-open`). Any near prop counts, so
  // two wrappers never fight over the attribute.
  useEffect(() => {
    const root = document.documentElement;
    const reflect = () => {
      if (nearPropApproach()) root.setAttribute("data-prop-focus", "");
      else root.removeAttribute("data-prop-focus");
    };
    reflect();
    const unsubscribe = subscribePropApproaches(reflect);
    return () => {
      unsubscribe();
      reflect();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!controller.near) return;
      event.preventDefault();
      controller.dismiss();
    };
    // A press that lands on the prop itself may be kept for a gesture on it;
    // any other press in the room puts the prop back, and the press goes no
    // further: with the interface faded there is nothing else it should be
    // opening. Capture phase on window runs before the canvas and before the
    // Grabbable dispatcher see it.
    const pressHitsProp = (event: PointerEvent) => {
      const node = group.current;
      if (!node) return false;
      const { camera, gl } = get();
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      scratch.ndc.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      scratch.raycaster.setFromCamera(scratch.ndc, camera);
      return scratch.raycaster.intersectObject(node, true).length > 0;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!controller.near || !event.isPrimary || event.button !== 0) return;
      if (!pressLandsInRoom(event.target)) return;
      // A press on the caption's link is a press on the caption, not a
      // dismissal: the prop stays up while the link opens.
      if (
        event.target instanceof Element &&
        event.target.closest("[data-prop-caption]")
      )
        return;
      if (keepPressesOnProp && pressHitsProp(event)) return;
      controller.dismiss();
      event.stopPropagation();
    };
    roomWindowEvents.addEventListener("keydown", onKeyDown);
    roomWindowEvents.addEventListener("pointerdown", onPointerDown, {
      capture: true,
    });
    return () => {
      roomWindowEvents.removeEventListener("keydown", onKeyDown);
      roomWindowEvents.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      // The unit can be virtualised away mid-approach. Nothing may be left
      // pulling focus toward a prop that is no longer drawn, and no drag
      // listener may outlive it.
      controller.set(false);
      controller.progress.current = 0;
      focusPull.weight = 0;
      turn?.cancel?.();
    };
  }, [controller, get, group, keepPressesOnProp, scratch, turn]);

  useFrame(({ camera, size, pointer }, rawDelta) => {
    const overlay = overlayCoordinator.getSnapshot();
    if (controller.near && overlay.pauseBackground && overlay.top !== "object")
      return;
    const node = group.current;
    const parent = node?.parent;
    if (!node || !parent) return;

    const near = controller.near;
    if (near && !wasNear.current) startPosition.current = progressRef.current;
    wasNear.current = near;
    if (
      near &&
      propApproachReleased({
        startPosition: startPosition.current,
        scenePosition: progressRef.current,
        activeUnit: useStacks.getState().activeUnit,
        unitIndex,
      })
    ) {
      controller.set(false);
      wasNear.current = false;
    }

    const goal = controller.near ? 1 : 0;
    const delta = Math.min(rawDelta, 1 / 30);
    if (still) progress.current = goal;
    else
      progress.current = THREE.MathUtils.damp(
        progress.current,
        goal,
        PROP_APPROACH_LAMBDA,
        delta,
      );
    // The extra pitch eases toward what the gesture asks, and back to level
    // once the prop is going home.
    const tiltGoal = goal === 1 && tilt ? tilt.current : 0;
    tiltEased.current = still
      ? tiltGoal
      : THREE.MathUtils.damp(tiltEased.current, tiltGoal, tiltLambda, delta);
    // The hand turn: coast after a release, then ease the drawn pose after
    // the commanded one. Going home levels it, so the prop lands square.
    if (turn) {
      // The moment the prop starts home, bring a whole-lap yaw back into
      // (-π, π] (same orientation) and end any drag: easing 2π down to 0
      // would carry the flight's slerp across π and onto the other short
      // arc, a 144° snap between frames (Codex review, 2026-09-11).
      if (goal === 0 && turnWasNear.current) {
        wrapPropTurn(turn);
        turnYawEased.current = wrapYaw(turnYawEased.current);
      }
      turnWasNear.current = goal === 1;
      if (!turn.held && turn.yawVelocity !== 0) {
        const step = turn.yawVelocity * delta;
        // Going home the coast keeps running, only faster to run down, and
        // never past the half turn the wrap above put it inside of.
        if (goal === 0 && Math.abs(turn.yaw + step) > Math.PI * 0.9)
          turn.yawVelocity = 0;
        else turn.yaw += step;
        turn.yawVelocity = THREE.MathUtils.damp(
          turn.yawVelocity,
          0,
          goal === 1 ? PROP_TURN_FLING_DECAY : PROP_TURN_HOME_DECAY,
          delta,
        );
        if (Math.abs(turn.yawVelocity) < 0.02) turn.yawVelocity = 0;
      }
      // Up close the drawn turn follows the commanded one. On the way home
      // it unwinds WITH the flight: the goal is the turn scaled by what is
      // left of the approach, so the prop is still turning as it recedes
      // and is level exactly when it lands, instead of snapping level the
      // moment it is dismissed. Scaled by the ease-out of the remainder
      // rather than the remainder itself: the flight leaves fast, and a
      // linear unwind reversed a coasting spin in the first frame (measured
      // 0.17 rad in one frame); this lets the coast carry a little further
      // before the levelling takes over, and still lands level.
      const remaining = 1 - progress.current;
      const unwind = goal === 1 ? 1 : 1 - remaining * remaining;
      const yawGoal = turn.yaw * unwind;
      const pitchGoal = turn.pitch * unwind;
      turnYawEased.current = still
        ? yawGoal
        : THREE.MathUtils.damp(
            turnYawEased.current,
            yawGoal,
            TILT_LAMBDA,
            delta,
          );
      turnPitchEased.current = still
        ? pitchGoal
        : THREE.MathUtils.damp(
            turnPitchEased.current,
            pitchGoal,
            TILT_LAMBDA,
            delta,
          );
    }
    if (goal === 1 && progress.current > 1 - 1e-3)
      overlayLease.current?.settle();
    if (goal === 0 && progress.current < 1e-3) {
      overlayLease.current?.release();
      overlayLease.current = null;
      if (progress.current !== 0) {
        progress.current = 0;
        tiltEased.current = 0;
        turnYawEased.current = 0;
        turnPitchEased.current = 0;
        follow.current.x = 0;
        follow.current.y = 0;
        if (turn) resetPropTurn(turn);
        if (tilt) tilt.current = 0;
        node.position.copy(ORIGIN);
        node.quaternion.copy(restQuaternion);
        controller.progress.current = 0;
        focusPull.weight = 0;
      }
      return;
    }
    const t = progress.current;
    controller.progress.current = t;

    const {
      cameraPosition,
      cameraQuaternion,
      forward,
      up,
      right,
      world,
      centre,
      local,
      parentQuaternion,
      nearQuaternion,
      gestureQuaternion,
      gestureEuler,
    } = scratch;
    camera.getWorldPosition(cameraPosition);
    camera.getWorldQuaternion(cameraQuaternion);
    forward.set(0, 0, -1).applyQuaternion(cameraQuaternion);
    up.set(0, 1, 0).applyQuaternion(cameraQuaternion);
    right.set(1, 0, 0).applyQuaternion(cameraQuaternion);

    const fov = (camera as THREE.PerspectiveCamera).fov ?? 33;
    const aspect = size.width / Math.max(1, size.height);
    const distance = propApproachDistance({
      fovDegrees: fov,
      aspect,
      height,
      width,
      fill,
    });
    // Keep the cursor response small and eased, with no passive movement
    // when reduced motion is requested.
    follow.current.x = still
      ? 0
      : THREE.MathUtils.damp(
          follow.current.x,
          pointer.x,
          POINTER_FOLLOW_LAMBDA,
          delta,
        );
    follow.current.y = still
      ? 0
      : THREE.MathUtils.damp(
          follow.current.y,
          pointer.y,
          POINTER_FOLLOW_LAMBDA,
          delta,
        );
    const halfHeight = distance * Math.tan((fov * Math.PI) / 360);
    centre
      .copy(cameraPosition)
      .addScaledVector(forward, distance)
      .addScaledVector(
        right,
        follow.current.x * POINTER_FOLLOW.x * halfHeight * aspect,
      )
      .addScaledVector(up, follow.current.y * POINTER_FOLLOW.y * halfHeight);
    world.copy(centre).addScaledVector(up, -height / 2);
    // Keep the caption at the neutral foot position while the prop moves.
    controller.frame.bottom =
      size.top +
      size.height *
        propApproachBottomFraction({
          fovDegrees: fov,
          aspect,
          height,
          width,
          fill,
        });

    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(parentQuaternion);
    local.copy(world);
    parent.worldToLocal(local);
    // The model's front faces +Z, so a world orientation equal to the
    // camera's turns the prop square to the viewer. The extra pitch squares
    // a leaning face. Subtle cursor tilt combines with deliberate hand turns.
    gestureEuler.set(
      tiltEased.current +
        turnPitchEased.current -
        follow.current.y * POINTER_FOLLOW.pitch,
      turnYawEased.current + follow.current.x * POINTER_FOLLOW.yaw,
      0,
    );
    gestureQuaternion.setFromEuler(gestureEuler);
    nearQuaternion
      .copy(parentQuaternion)
      .invert()
      .multiply(cameraQuaternion)
      .multiply(gestureQuaternion)
      .multiply(facePitchQuaternion);

    node.position.copy(local).multiplyScalar(t);
    node.quaternion.slerpQuaternions(restQuaternion, nearQuaternion, t);

    focusPull.weight = t;
    focusPull.x = centre.x;
    focusPull.y = centre.y;
    focusPull.z = centre.z;
  });

  // The insect perch resolver reads the prop's live tilt off this group
  // (insectPerches.tsx, `carryWithNearProp`): the group's name finds it and
  // the rest quaternion in userData is what the displacement is measured
  // against.
  useEffect(() => {
    const node = group.current;
    if (!node) return;
    node.userData.propApproachRest = restQuaternion.toArray();
    return () => {
      delete node.userData.propApproachRest;
    };
  }, [group, restQuaternion]);

  return (
    <group
      ref={group}
      name={`prop-approach:${controller.id}:${unitIndex}`}
      rotation={[restX, restY, restZ]}
    >
      <InspectedObjectFrames.Provider value={() => controller.near}>
        {children}
      </InspectedObjectFrames.Provider>
    </group>
  );
}
