import { Matrix4, type Vector3 } from "three";

export type Rectangle = { x: number; y: number; width: number; height: number };

/** Map capture pixels to the visible SVG box without changing captured perspective. */
export function rebaseProjection(
  projection: readonly number[],
  raster: readonly number[],
  viewBox: readonly number[],
  box: Rectangle,
  viewport: Rectangle,
) {
  const scale = Math.min(box.width / viewBox[2]!, box.height / viewBox[3]!);
  const left = box.x + (box.width - viewBox[2]! * scale) / 2;
  const top = box.y + (box.height - viewBox[3]! * scale) / 2;
  const sx = (raster[0]! * scale) / viewport.width;
  const sy = (raster[1]! * scale) / viewport.height;
  const tx =
    (2 * (left - viewport.x + (raster[0]! / 2 - viewBox[0]!) * scale)) /
      viewport.width -
    1;
  const ty =
    1 -
    (2 * (top - viewport.y + (raster[1]! / 2 - viewBox[1]!) * scale)) /
      viewport.height;
  return new Matrix4()
    .set(sx, 0, 0, tx, 0, sy, 0, ty, 0, 0, 1, 0, 0, 0, 0, 1)
    .multiply(new Matrix4().fromArray(projection));
}

export function cssPoint(
  point: Vector3,
  world: Matrix4,
  projection: Matrix4,
  viewport: Rectangle,
) {
  const p = point
    .clone()
    .applyMatrix4(world.clone().invert())
    .applyMatrix4(projection);
  return [
    viewport.x + ((p.x + 1) * viewport.width) / 2,
    viewport.y + ((1 - p.y) * viewport.height) / 2,
  ];
}

export function artworkPoint(
  pixel: readonly number[],
  viewBox: readonly number[],
  box: Rectangle,
) {
  const scale = Math.min(box.width / viewBox[2]!, box.height / viewBox[3]!);
  return [
    box.x +
      (box.width - viewBox[2]! * scale) / 2 +
      (pixel[0]! - viewBox[0]!) * scale,
    box.y +
      (box.height - viewBox[3]! * scale) / 2 +
      (pixel[1]! - viewBox[1]!) * scale,
  ];
}
