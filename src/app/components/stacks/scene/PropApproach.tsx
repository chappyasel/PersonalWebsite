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
// wide window). The pointer still moves it, within reason: a few percent of
// the frame and a few degrees of turn toward the cursor, damped.
//
// Written for the Projects Mac (MacApproach.tsx is that prop's name for it);
// the About globe is the second prop to fly. What differs between them is
// carried by props here: the globe keeps presses that land on it, because a
// drag on the near globe turns it, and it takes an extra pitch so the drag
// can tip it toward the poles.
import { pressLandsInRoom } from "../dom/roomPress";
import { progressRef, useStacks } from "../store";
import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { focusPull } from "./focusPull";
import {
  PROP_APPROACH_FOLLOW,
  PROP_APPROACH_LAMBDA,
  type PropApproach as PropApproachController,
  nearPropApproach,
  propApproachDistance,
  propApproachReleased,
  subscribePropApproaches,
} from "./propApproachState";

const ORIGIN = new THREE.Vector3();
/** Ease rate for the extra pitch, per second: quick enough to feel attached
 * to the drag, slow enough not to jitter with it. */
const TILT_LAMBDA = 12;

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
  const follow = useRef({ x: 0, y: 0 });
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
      followQuaternion: new THREE.Quaternion(),
      followEuler: new THREE.Euler(),
      raycaster: new THREE.Raycaster(),
      ndc: new THREE.Vector2(),
    }),
    [],
  );

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
      if (keepPressesOnProp && pressHitsProp(event)) return;
      controller.dismiss();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      // The unit can be virtualised away mid-approach. Nothing may be left
      // pulling focus toward a prop that is no longer drawn.
      controller.set(false);
      controller.progress.current = 0;
      focusPull.weight = 0;
    };
  }, [controller, get, group, keepPressesOnProp, scratch]);

  useFrame(({ camera, size, pointer }, rawDelta) => {
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
      : THREE.MathUtils.damp(tiltEased.current, tiltGoal, TILT_LAMBDA, delta);
    if (goal === 0 && progress.current < 1e-3) {
      if (progress.current !== 0) {
        progress.current = 0;
        tiltEased.current = 0;
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
      followQuaternion,
      followEuler,
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
    // The pointer, damped, so the prop drifts after the cursor instead of
    // twitching with it.
    const ease = 1 - Math.exp(-4 * delta);
    follow.current.x += (pointer.x - follow.current.x) * ease;
    follow.current.y += (pointer.y - follow.current.y) * ease;
    const halfHeight = distance * Math.tan((fov * Math.PI) / 360);
    const halfWidth = halfHeight * aspect;
    // Down the optical axis, nudged after the pointer; the group's origin is
    // the prop's foot, so the body is centred rather than the base.
    centre
      .copy(cameraPosition)
      .addScaledVector(forward, distance)
      .addScaledVector(
        right,
        follow.current.x * PROP_APPROACH_FOLLOW.x * halfWidth,
      )
      .addScaledVector(
        up,
        follow.current.y * PROP_APPROACH_FOLLOW.y * halfHeight,
      );
    world.copy(centre).addScaledVector(up, -height / 2);

    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(parentQuaternion);
    local.copy(world);
    parent.worldToLocal(local);
    // The model's front faces +Z, so a world orientation equal to the
    // camera's turns the prop square to the viewer; the extra pitch brings a
    // leaning face square instead, the follow turns the prop a few degrees
    // toward the cursor, and the gesture's tilt tips it further.
    followEuler.set(
      -follow.current.y * PROP_APPROACH_FOLLOW.pitch + tiltEased.current,
      follow.current.x * PROP_APPROACH_FOLLOW.yaw,
      0,
    );
    followQuaternion.setFromEuler(followEuler);
    nearQuaternion
      .copy(parentQuaternion)
      .invert()
      .multiply(cameraQuaternion)
      .multiply(followQuaternion)
      .multiply(facePitchQuaternion);

    node.position.copy(local).multiplyScalar(t);
    node.quaternion.slerpQuaternions(restQuaternion, nearQuaternion, t);

    focusPull.weight = t;
    focusPull.x = centre.x;
    focusPull.y = centre.y;
    focusPull.z = centre.z;
  });

  return (
    <group
      ref={group}
      name={`prop-approach:${controller.id}:${unitIndex}`}
      rotation={[restX, restY, restZ]}
    >
      {children}
    </group>
  );
}
