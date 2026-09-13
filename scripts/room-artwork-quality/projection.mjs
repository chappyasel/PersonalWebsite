import { Matrix4 } from "three";

/** Crop in original raster pixels; the saved off-axis camera remains unchanged. */
export function cropProjection(projection, raster, [x, y, width, height]) {
  if (!(width > 0 && height > 0 && raster[0] > 0 && raster[1] > 0))
    throw Error("Invalid capture rectangle");
  const result = new Matrix4().makeScale(
    raster[0] / width,
    raster[1] / height,
    1,
  );
  result.elements[12] = (raster[0] - 2 * x - width) / width;
  result.elements[13] = (2 * y + height - raster[1]) / height;
  return result.multiply(new Matrix4().fromArray(projection));
}
