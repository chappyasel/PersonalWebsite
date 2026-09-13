import type { AboutBootStage } from "../boot/aboutBootStage";

import type { RoomArtworkMetadata } from "./artwork/types";

/** Uniform SVG placement against the ordinary rest camera. Kept self-contained
 * so first paint and hydration run the same function, without loading Three. */
export function artworkFrame(
  source: RoomArtworkMetadata | null,
  stage: AboutBootStage,
  width: number,
  height: number,
) {
  if (!source) {
    return {
      x: stage.originX - 1.5 * stage.unitPx,
      y: stage.originY - 1.08 * stage.unitPx,
      width: 3 * stage.unitPx,
      height: 2.3 * stage.unitPx,
      residual: 0,
    };
  }
  const camera = stage.camera!;
  const dy = camera.eye[1] - camera.aim[1];
  const dz = camera.eye[2] - camera.aim[2];
  const length = Math.hypot(dy, dz);
  const zy = dy / length;
  const zz = dz / length;
  const focal = height / 2 / Math.tan((camera.fov * Math.PI) / 360);
  const world = source.camera.world;
  const projection = source.camera.projection;
  const pairs = source.layoutPoints.map((point) => {
    const relative = point.map((value, index) => value - world[12 + index]!);
    const local = [0, 1, 2].map((column) =>
      relative.reduce(
        (sum, value, row) => sum + value * world[column * 4 + row]!,
        0,
      ),
    );
    const clip = [0, 1, 3].map((row) =>
      local.reduce(
        (sum, value, column) => sum + value * projection[column * 4 + row]!,
        projection[12 + row]!,
      ),
    );
    const from = [
      ((clip[0]! / clip[2]! + 1) * source.raster[0]!) / 2,
      ((1 - clip[1]! / clip[2]!) * source.raster[1]!) / 2,
    ];
    const x = point[0]! - camera.eye[0];
    const y = point[1]! - camera.eye[1];
    const z = point[2]! - camera.eye[2];
    const depth = -y * zy - z * zz;
    return {
      from,
      to: [
        width / 2 + (x * focal) / depth,
        height / 2 - ((y * zz - z * zy) * focal) / depth - camera.imageShiftUp,
      ],
    };
  });
  const means = (key: "from" | "to") =>
    [0, 1].map(
      (axis) =>
        pairs.reduce((sum, pair) => sum + pair[key][axis]!, 0) / pairs.length,
    );
  const from = means("from");
  const to = means("to");
  let numerator = 0;
  let denominator = 0;
  for (const pair of pairs)
    for (let axis = 0; axis < 2; axis++) {
      const delta = pair.from[axis]! - from[axis]!;
      numerator += delta * (pair.to[axis]! - to[axis]!);
      denominator += delta * delta;
    }
  const scale = numerator / denominator;
  const x = to[0]! - scale * from[0]!;
  const y = to[1]! - scale * from[1]!;
  return {
    x: x + scale * source.viewBox[0]!,
    y: y + scale * source.viewBox[1]!,
    width: scale * source.viewBox[2]!,
    height: scale * source.viewBox[3]!,
    residual: Math.max(
      ...pairs.map((pair) =>
        Math.hypot(
          scale * pair.from[0]! + x - pair.to[0]!,
          scale * pair.from[1]! + y - pair.to[1]!,
        ),
      ),
    ),
  };
}
