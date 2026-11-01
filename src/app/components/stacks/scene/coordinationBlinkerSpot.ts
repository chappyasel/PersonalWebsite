"use client";

import { useHdrBlinker } from "../dom/HdrFill";
import { addAfterEffect, useThree } from "@react-three/fiber";
import { type RefObject, useEffect } from "react";
import * as THREE from "three";

import { blinkerPlate } from "./coordinationBlinkerPlate";
import { type BlinkerSpot, coordinationCrossing } from "./coordinationCrossing";
import { BLINKER_EM, BLINKER_LOCAL_PER_EM } from "./coordinationDust";

export function isShown(object: THREE.Object3D | null | undefined) {
  for (let at = object ?? null; at; at = at.parent) {
    if (!at.visible) return false;
  }
  return Boolean(object);
}

const world = new THREE.Vector3();
const scale = new THREE.Vector3();
const edge = new THREE.Vector3();

/** The orb's blinker on the page, in CSS pixels, through the scale its
 * billboard draws at. `z` beyond 1 or below -1 is behind or past the camera. */
export function blinkerSpot(
  blinker: THREE.Object3D,
  camera: THREE.Camera,
  width: number,
  height: number,
): BlinkerSpot & { z: number } {
  blinker.getWorldPosition(world);
  blinker.getWorldScale(scale);
  edge
    .setFromMatrixColumn(camera.matrixWorld, 0)
    .multiplyScalar(BLINKER_LOCAL_PER_EM * scale.x)
    .add(world)
    .project(camera);
  world.project(camera);
  const x = ((world.x + 1) / 2) * width;
  const y = ((1 - world.y) / 2) * height;
  return {
    x,
    y,
    z: world.z,
    em: Math.hypot(
      ((edge.x + 1) / 2) * width - x,
      ((1 - edge.y) / 2) * height - y,
    ),
  };
}

const onPage = (
  { x, y, z, em }: ReturnType<typeof blinkerSpot>,
  width: number,
  height: number,
) => {
  const halfWidth = (em * BLINKER_EM.width) / 2;
  const halfHeight = (em * BLINKER_EM.height) / 2;
  return (
    Math.abs(z) <= 1 &&
    x + halfWidth > 0 &&
    x - halfWidth < width &&
    y + halfHeight > 0 &&
    y - halfHeight < height
  );
};

/** Keeps the HDR plate on the orb's blinker while no crossing runs. It runs
 * after the frame's render, so it reads the matrices that frame was drawn with
 * and whatever blink the shader last got. Unit activity cannot strand it: this
 * is not a unit frame, and a blinker off the page or hidden hides the plate. */
export function useBlinkerPlateTracking(
  blinker: RefObject<THREE.Object3D | null>,
  material: RefObject<THREE.ShaderMaterial | null>,
) {
  const hdr = useHdrBlinker();
  const get = useThree((state) => state.get);

  useEffect(() => {
    if (!hdr) return;
    const remove = addAfterEffect(() => {
      if (coordinationCrossing.getSnapshot().run) return;
      const object = blinker.current;
      const block = material.current?.uniforms.uBlock?.value as
        | number
        | undefined;
      if (!isShown(object) || block === undefined) {
        blinkerPlate.hide();
        return;
      }
      const { camera, size } = get();
      const spot = blinkerSpot(object!, camera, size.width, size.height);
      if (onPage(spot, size.width, size.height))
        blinkerPlate.place(spot, block);
      else blinkerPlate.hide();
    });
    return () => {
      remove();
      blinkerPlate.hide();
    };
  }, [hdr, blinker, material, get]);
}
