import { ABOUT_BOOT_CAMERA } from "../scene/aboutBootPerspective";
import { PerspectiveCamera, Vector3 } from "three";

import { type Rectangle, rebaseProjection } from "./projection";

/** The original drawing uses perspective measured in 100 SVG units per scene unit. */
export function aboutIllustrationProjection(
  box: Rectangle,
  viewport: Rectangle,
) {
  const camera = new PerspectiveCamera(30, 300 / 230, 0.1, 1000);
  camera.position.fromArray(ABOUT_BOOT_CAMERA.eye);
  camera.lookAt(...ABOUT_BOOT_CAMERA.aim);
  camera.updateMatrixWorld(true);
  const origin = new Vector3().applyMatrix4(camera.matrixWorldInverse);
  const focal = -origin.z * 100;
  camera.fov = (2 * Math.atan(115 / focal) * 180) / Math.PI;
  camera.updateProjectionMatrix();
  const sourceOrigin = new Vector3().project(camera);
  const viewBox = [
    (sourceOrigin.x + 1) * 150 - 150,
    (1 - sourceOrigin.y) * 115 - 108,
    300,
    230,
  ];
  return {
    world: camera.matrixWorld.clone(),
    projection: rebaseProjection(
      camera.projectionMatrix.elements,
      [300, 230],
      viewBox,
      box,
      viewport,
    ),
  };
}
