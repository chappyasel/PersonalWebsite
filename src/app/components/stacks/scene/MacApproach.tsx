"use client";

// The Mac's flight to the camera.
//
// Sits inside the Grabbable, like HeldFacing, so the carrier goes on owning
// the shelf pose, the contact shade, the collider and the hit test, while
// this group carries the visible machine from its rest pose to a spot in
// front of the camera and back. Both poses are resolved into the carrier's
// frame every frame, so the shared hover nod and any carry the carrier
// performs are cancelled rather than compounded: the near pose is
// camera-locked no matter what the shelf is doing.
//
// The near pose sits on the camera's optical axis, so it stays centred in the
// view however the camera parallaxes with the pointer (an earlier version
// aimed through the shelf's column and ended up cut off at the edge of a
// wide window). The pointer still moves it, within reason: a few percent of
// the frame and a few degrees of turn toward the cursor, damped.
import { pressLandsInRoom } from "../dom/roomPress";
import { progressRef, useStacks } from "../store";
import { useFrame } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { focusPull } from "./focusPull";
import {
  MAC_APPROACH_FOLLOW,
  MAC_APPROACH_LAMBDA,
  macApproach,
  macApproachDistance,
  macApproachReleased,
} from "./macApproachState";

const ORIGIN = new THREE.Vector3();

export default function MacApproach({
  unitIndex,
  height,
  width,
  restRotation = [0, 0, 0],
  facePitch = 0,
  children,
}: {
  unitIndex: number;
  /** World-space extents of the machine, for framing. */
  height: number;
  width: number;
  /** Authored shelf yaw, applied here instead of on the model so the near
   * pose can square the screen to the camera. */
  restRotation?: [number, number, number];
  /** Backward lean of the screen relative to the body, in radians. The near
   * pose pitches the body forward by this much so the SCREEN, not the
   * casing, meets the camera square. */
  facePitch?: number;
  children: React.ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const progress = useRef(0);
  const startPosition = useRef(0);
  const wasNear = useRef(false);
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
    }),
    [],
  );

  // The rest of the interface steps aside while the machine is up close,
  // through the same CSS exit the photo viewer uses (StacksHome's style
  // block reads this attribute beside `data-overlay-open`).
  useEffect(() => {
    const root = document.documentElement;
    const reflect = () => {
      if (macApproach.near) root.setAttribute("data-prop-focus", "");
      else root.removeAttribute("data-prop-focus");
    };
    reflect();
    const unsubscribe = macApproach.subscribe(reflect);
    return () => {
      unsubscribe();
      root.removeAttribute("data-prop-focus");
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!macApproach.near) return;
      event.preventDefault();
      macApproach.dismiss();
    };
    // A press anywhere in the room puts the machine back, the Mac itself
    // included, and the press goes no further: with the interface faded
    // there is nothing else it should be opening. Capture phase on window
    // runs before the canvas and before the Grabbable dispatcher see it.
    const onPointerDown = (event: PointerEvent) => {
      if (!macApproach.near || !event.isPrimary || event.button !== 0) return;
      if (!pressLandsInRoom(event.target)) return;
      macApproach.dismiss();
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
      // pulling focus toward a machine that is no longer drawn.
      macApproach.set(false);
      macApproach.progress.current = 0;
      focusPull.weight = 0;
    };
  }, []);

  useFrame(({ camera, size, pointer }, rawDelta) => {
    const node = group.current;
    const parent = node?.parent;
    if (!node || !parent) return;

    const near = macApproach.near;
    if (near && !wasNear.current) startPosition.current = progressRef.current;
    wasNear.current = near;
    if (
      near &&
      macApproachReleased({
        startPosition: startPosition.current,
        scenePosition: progressRef.current,
        activeUnit: useStacks.getState().activeUnit,
        unitIndex,
      })
    ) {
      macApproach.set(false);
      wasNear.current = false;
    }

    const goal = macApproach.near ? 1 : 0;
    if (still) progress.current = goal;
    else
      progress.current = THREE.MathUtils.damp(
        progress.current,
        goal,
        MAC_APPROACH_LAMBDA,
        Math.min(rawDelta, 1 / 30),
      );
    if (goal === 0 && progress.current < 1e-3) {
      if (progress.current !== 0) {
        progress.current = 0;
        node.position.copy(ORIGIN);
        node.quaternion.copy(restQuaternion);
        macApproach.progress.current = 0;
        focusPull.weight = 0;
      }
      return;
    }
    const t = progress.current;
    macApproach.progress.current = t;

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
    const distance = macApproachDistance({
      fovDegrees: fov,
      aspect,
      height,
      width,
    });
    // The pointer, damped, so the machine drifts after the cursor instead of
    // twitching with it.
    const ease = 1 - Math.exp(-4 * Math.min(rawDelta, 1 / 30));
    follow.current.x += (pointer.x - follow.current.x) * ease;
    follow.current.y += (pointer.y - follow.current.y) * ease;
    const halfHeight = distance * Math.tan((fov * Math.PI) / 360);
    const halfWidth = halfHeight * aspect;
    // Down the optical axis, nudged after the pointer; the group's origin is
    // the machine's foot, so the body is centred rather than the base.
    centre
      .copy(cameraPosition)
      .addScaledVector(forward, distance)
      .addScaledVector(
        right,
        follow.current.x * MAC_APPROACH_FOLLOW.x * halfWidth,
      )
      .addScaledVector(
        up,
        follow.current.y * MAC_APPROACH_FOLLOW.y * halfHeight,
      );
    world.copy(centre).addScaledVector(up, -height / 2);

    parent.updateWorldMatrix(true, false);
    parent.getWorldQuaternion(parentQuaternion);
    local.copy(world);
    parent.worldToLocal(local);
    // The model's front faces +Z, so a world orientation equal to the
    // camera's turns the casing square to the viewer; the extra pitch
    // brings the leaning screen face square instead, and the follow turns
    // the machine a few degrees toward the cursor.
    followEuler.set(
      -follow.current.y * MAC_APPROACH_FOLLOW.pitch,
      follow.current.x * MAC_APPROACH_FOLLOW.yaw,
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
      name={`mac-approach:${unitIndex}`}
      rotation={[restX, restY, restZ]}
    >
      {children}
    </group>
  );
}
