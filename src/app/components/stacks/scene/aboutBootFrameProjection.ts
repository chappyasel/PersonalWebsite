import { ABOUT_PHOTO_POSES, type AboutEuler } from "./aboutScenePose";
import {
  DESK_FRAME_MAT_INSET,
  deskFrameHeight,
  deskFrameWidth,
} from "./photoGeometry";
import {
  PORTRAIT_FRAME_POSE,
  PORTRAIT_FRAME_SIZE,
  PORTRAIT_IMAGE,
  PORTRAIT_MAT_SIZE,
} from "./portraitFrameGeometry";
import { REVIEWED_SHELF_LAYOUT } from "./units/unitShelfLayout";

export type AboutBootFrameId = "portrait" | "family-frame" | "profile-frame";
export type AboutBootPoint = readonly [number, number];
export type AboutBootQuad = readonly [
  AboutBootPoint,
  AboutBootPoint,
  AboutBootPoint,
  AboutBootPoint,
];

type Point3 = readonly [number, number, number];

type Transform3 = Readonly<{
  position?: Point3;
  rotation?: AboutEuler;
  scale?: number;
}>;

/** Three.js' intrinsic XYZ Euler transform, kept dependency-free for SSR. */
function rotate([x, y, z]: Point3, [rx, ry, rz]: AboutEuler): Point3 {
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return [
    cy * cz * x - cy * sz * y + sy * z,
    (cx * sz + sx * sy * cz) * x + (cx * cz - sx * sy * sz) * y - sx * cy * z,
    (sx * sz - cx * sy * cz) * x + (sx * cz + cx * sy * sz) * y + cx * cy * z,
  ];
}

function transform(point: Point3, step: Transform3): Point3 {
  const scale = step.scale ?? 1;
  const scaled: Point3 = [point[0] * scale, point[1] * scale, point[2] * scale];
  const rotated = step.rotation ? rotate(scaled, step.rotation) : scaled;
  const position = step.position ?? [0, 0, 0];
  return [
    rotated[0] + position[0],
    rotated[1] + position[1],
    rotated[2] + position[2],
  ];
}

function plane(
  width: number,
  height: number,
  z: number,
  chain: readonly Transform3[],
): AboutBootQuad {
  const corners: readonly Point3[] = [
    [-width / 2, -height / 2, z],
    [width / 2, -height / 2, z],
    [width / 2, height / 2, z],
    [-width / 2, height / 2, z],
  ];
  return corners.map((corner) => {
    const projected = chain.reduce(transform, corner);
    return [projected[0], -projected[1]] as const;
  }) as unknown as AboutBootQuad;
}

export type AboutBootFrameProjection = Readonly<{
  outer: AboutBootQuad;
  mat: AboutBootQuad;
  image: AboutBootQuad;
}>;

/**
 * Exact orthographic front elevation of each live standing frame at rest.
 * The loading SVG and its tests cross this one interface. Carrier rotation,
 * seat, inner portrait pose, depth plane and scale stay inside the module.
 */
export function aboutBootFrameProjection(
  id: AboutBootFrameId,
): AboutBootFrameProjection {
  if (id === "portrait") {
    const inner: Transform3 = {
      position: PORTRAIT_FRAME_POSE.position,
      rotation: PORTRAIT_FRAME_POSE.rotation,
    };
    const scale: Transform3 = { scale: ABOUT_PHOTO_POSES.portrait.scale };
    const carrier: Transform3 = {
      rotation: ABOUT_PHOTO_POSES.portrait.rotation,
    };
    const chain = [inner, scale, carrier];
    return {
      outer: plane(
        PORTRAIT_FRAME_SIZE.width,
        PORTRAIT_FRAME_SIZE.height,
        -0.004,
        chain,
      ),
      mat: plane(
        PORTRAIT_MAT_SIZE.width,
        PORTRAIT_MAT_SIZE.height,
        -0.002,
        chain,
      ),
      image: plane(PORTRAIT_IMAGE.width, PORTRAIT_IMAGE.height, 0, chain),
    };
  }

  if (id === "family-frame") {
    const width = 0.264 * (769 / 1024);
    const height = 0.264;
    const chain: readonly Transform3[] = [
      {
        position: [0, deskFrameHeight(height) / 2, 0],
        rotation: ABOUT_PHOTO_POSES.family.rotation,
      },
    ];
    return {
      outer: plane(
        deskFrameWidth(width),
        deskFrameHeight(height),
        -0.001,
        chain,
      ),
      mat: plane(
        width + DESK_FRAME_MAT_INSET * 2,
        height + DESK_FRAME_MAT_INSET * 2,
        -0.0008,
        chain,
      ),
      image: plane(width, height, 0.001, chain),
    };
  }

  const width = 0.18;
  const height = 0.24;
  const chain: readonly Transform3[] = [
    {
      position: [0, REVIEWED_SHELF_LAYOUT.about.profileSeat, 0],
      rotation: ABOUT_PHOTO_POSES.profile.rotation,
    },
  ];
  return {
    outer: plane(deskFrameWidth(width), deskFrameHeight(height), -0.001, chain),
    mat: plane(
      width + DESK_FRAME_MAT_INSET * 2,
      height + DESK_FRAME_MAT_INSET * 2,
      -0.0008,
      chain,
    ),
    image: plane(width, height, 0.001, chain),
  };
}
