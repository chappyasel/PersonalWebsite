import { ABOUT_LANDMARK_X, ABOUT_LOWER_LANDMARK_Z } from "../aboutScenePose";
import type { ReadingBookEdgeColor } from "~/lib/books/coverEdgeColor";

export const ABOUT_READING_BOOK = {
  width: 0.3135,
  /** Default/fallback only; live books derive their fore-edge from length. */
  thickness: 0.0528,
  depth: 0.4776,
  radius: 0.008,
} as const;

/** The printed cover plane inside the cloth boards. Shared by WebGL and the
 * boot projection so the loading image keeps the same inset. */
export const ABOUT_READING_COVER_IMAGE = {
  width: 0.2893,
  height: 0.4576,
  lift: 0.001,
} as const;

export const ABOUT_READING_BOARD_THICKNESS = 0.007;

export const ABOUT_READING_PAGE_BLOCK = {
  width: ABOUT_READING_BOOK.width - 0.016,
  depth: ABOUT_READING_BOOK.depth - 0.022,
} as const;

export type ReadingBookPose = {
  /** Newest first; the three jackets form a shallow camera-overlapped fan. */
  index: number;
  base: [number, number, number];
  rotation: [number, number, number];
};

export type ReadingBookFrontCorners = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

/** Maps one unit-local corner (x and z in the unit, y above the plank) to
 * the elevation's 2D point. The boot passes the About rest camera's
 * projector (dom/bootVignette.ts); without one the distance scaling below
 * stands in, which is the same maths for a level eye at the origin. */
export type ReadingBookProjector = (
  corner: readonly [number, number, number],
) => [number, number];

export type ReadingBookElevation = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

type PositionLike = Pick<{ x: number; y: number; z: number }, "x" | "y" | "z">;
type QuaternionLike = PositionLike & { w: number };

const AUTHORED_HOVER_EPSILON = 0.001;

/** Shelf-specific presentation belongs to the curated fan, not to a book that
 * has been carried elsewhere. The carrier itself starts unrotated; its child
 * owns the authored jacket angle. */
export function readingBookAtAuthoredPose(
  position: PositionLike,
  quaternion: QuaternionLike,
  base: readonly [number, number, number],
) {
  const positionErrorSquared =
    (position.x - base[0]) ** 2 +
    (position.y - base[1]) ** 2 +
    (position.z - base[2]) ** 2;
  const rotationErrorSquared =
    quaternion.x ** 2 + quaternion.y ** 2 + quaternion.z ** 2;
  return (
    positionErrorSquared <= AUTHORED_HOVER_EPSILON ** 2 &&
    rotationErrorSquared <= AUTHORED_HOVER_EPSILON ** 2
  );
}

export const ABOUT_SMALL_PLANT_X = ABOUT_LANDMARK_X.succulent;
/** Measured GLB width 1.4887 × authored 0.18 scale ÷ 2, rounded outward. */
export const ABOUT_SMALL_PLANT_ENVELOPE = 0.135;
export const ABOUT_TOP_COLLECTIVE_PHOTO_X =
  ABOUT_LANDMARK_X["collective-frame"];
export const ABOUT_TOP_COLLECTIVE_PHOTO_LEFT =
  ABOUT_TOP_COLLECTIVE_PHOTO_X - 0.3072 / 2;

export const CURRENT_READING_ROTATION: [number, number, number] = [
  Math.PI / 2,
  0,
  (Math.PI * 2) / 9,
];
/** Best-fit equal step through the three edited X centers. It tightens the
 * former 0.18 fan by 15%, leaving more of each rear jacket camera-overlapped. */
export const READING_FAN_SPACING_X = 0.1529;

const READING_FAN_YAW = CURRENT_READING_ROTATION[2];
const READING_FAN_NORMAL = [
  -Math.sin(READING_FAN_YAW),
  Math.cos(READING_FAN_YAW),
] as const;
const PREVIOUS_READING_FAN_SPACING_X = 0.18;
const PREVIOUS_READING_FAN_SPACING_Z = 0.05;
const READING_FAN_CENTER_SEPARATION = Math.abs(
  PREVIOUS_READING_FAN_SPACING_X * READING_FAN_NORMAL[0] +
    PREVIOUS_READING_FAN_SPACING_Z * READING_FAN_NORMAL[1],
);

/** Empty air measured perpendicular to two neighbouring covers. Their center
 * spacing adds half of each live thickness to this value. */
export const READING_FAN_CLEARANCE =
  READING_FAN_CENTER_SEPARATION - ABOUT_READING_BOOK.thickness;

function readingFanDepthStep(leftThickness: number, rightThickness: number) {
  const normalSeparation =
    READING_FAN_CLEARANCE + (leftThickness + rightThickness) / 2;
  return (
    (Math.sin(READING_FAN_YAW) * READING_FAN_SPACING_X - normalSeparation) /
    Math.cos(READING_FAN_YAW)
  );
}

/** Default depth step. Live books keep this X cadence and vary only depth to
 * preserve the same physical clearance across different jacket thicknesses. */
export const READING_FAN_SPACING_Z = readingFanDepthStep(
  ABOUT_READING_BOOK.thickness,
  ABOUT_READING_BOOK.thickness,
);

export const ABOUT_READING_STACK_PROFILE_WIDTH =
  READING_FAN_SPACING_X * 2 +
  ABOUT_READING_BOOK.width * Math.cos(READING_FAN_YAW);

export const CURRENT_READING_BASE: [number, number, number] = [
  ABOUT_LANDMARK_X["reading-stack"] - READING_FAN_SPACING_X,
  ABOUT_READING_BOOK.depth / 2,
  ABOUT_LOWER_LANDMARK_Z["reading-stack"] - READING_FAN_SPACING_Z,
];

/** Matches Three's default intrinsic XYZ Euler matrix. */
function rotate(
  x: number,
  y: number,
  z: number,
  rotation: [number, number, number],
): [number, number, number] {
  const [rx, ry, rz] = rotation;
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

function point3(
  pose: ReadingBookPose,
  localX: number,
  localY: number,
  localZ: number,
): [number, number, number] {
  const offset = rotate(localX, localY, localZ, pose.rotation);
  return [
    pose.base[0] + offset[0],
    pose.base[1] + offset[1],
    pose.base[2] + offset[2],
  ];
}

function readingThicknessAt(thicknesses: readonly number[], index: number) {
  const thickness = thicknesses[index];
  return thickness !== undefined && Number.isFinite(thickness) && thickness > 0
    ? thickness
    : ABOUT_READING_BOOK.thickness;
}

/** Three grounded books turned 40° toward the About practical. The cadence
 * is exactly even in X while live thickness moves only depth to preserve clear
 * air between adjacent covers. */
export function readingStackPoses(
  thicknesses: readonly number[] = [],
): [ReadingBookPose, ReadingBookPose, ReadingBookPose] {
  const resolvedThicknesses = [
    readingThicknessAt(thicknesses, 0),
    readingThicknessAt(thicknesses, 1),
    readingThicknessAt(thicknesses, 2),
  ] as const;
  const firstDepthStep = readingFanDepthStep(
    resolvedThicknesses[0],
    resolvedThicknesses[1],
  );
  const secondDepthStep = readingFanDepthStep(
    resolvedThicknesses[1],
    resolvedThicknesses[2],
  );
  const offsets = [
    [0, 0],
    [READING_FAN_SPACING_X, firstDepthStep],
    [READING_FAN_SPACING_X * 2, firstDepthStep + secondDepthStep],
  ] as const;
  const meanOffsetX =
    offsets.reduce((sum, offset) => sum + offset[0], 0) / offsets.length;
  const meanOffsetZ =
    offsets.reduce((sum, offset) => sum + offset[1], 0) / offsets.length;
  const centerX = ABOUT_LANDMARK_X["reading-stack"];
  const centerZ = ABOUT_LOWER_LANDMARK_Z["reading-stack"];

  return offsets.map((offset, index) => ({
    index,
    base: [
      centerX + offset[0] - meanOffsetX,
      CURRENT_READING_BASE[1],
      centerZ + offset[1] - meanOffsetZ,
    ],
    rotation: [...CURRENT_READING_ROTATION],
  })) as [ReadingBookPose, ReadingBookPose, ReadingBookPose];
}

export function readingBookPoint(
  pose: ReadingBookPose,
  which: "shelf-toe" | "lean-contact" | "stack-contact",
): [number, number] {
  const [x, y] = readingBookPoint3(pose, which);
  return [x, y];
}

export function readingBookPoint3(
  pose: ReadingBookPose,
  which: "shelf-toe" | "lean-contact" | "stack-contact",
): [number, number, number] {
  const halfW = ABOUT_READING_BOOK.width / 2;
  const halfD = ABOUT_READING_BOOK.depth / 2;
  if (which === "shelf-toe") return point3(pose, -halfW, 0, halfD);
  return point3(pose, halfW, 0, halfD);
}

/** Exact front-elevation corners of one live reading cover. The boot SVG uses
 * this projection instead of inventing a second stack of upright rectangles. */
export function readingBookFrontElevation(
  pose: ReadingBookPose,
): ReadingBookElevation {
  return readingBookFrontCorners(pose).map(([x, y]): [number, number] => [
    x,
    y,
  ]) as ReadingBookElevation;
}

/** The same cover corners before depth is discarded. The boot shelf applies
 * its camera's mild perspective to these points, which produces the slight
 * trapezoid visible in the live room without inventing a second book pose. */
export function readingBookFrontCorners(
  pose: ReadingBookPose,
): ReadingBookFrontCorners {
  const halfW = ABOUT_READING_BOOK.width / 2;
  const halfD = ABOUT_READING_BOOK.depth / 2;
  return [
    point3(pose, -halfW, 0, halfD),
    point3(pose, halfW, 0, halfD),
    point3(pose, halfW, 0, -halfD),
    point3(pose, -halfW, 0, -halfD),
  ];
}

export function readingBookPerspectiveElevation(
  pose: ReadingBookPose,
  cameraZ: number,
  project?: ReadingBookProjector,
): ReadingBookElevation {
  return perspectiveElevation(readingBookFrontCorners(pose), cameraZ, project);
}

function perspectiveElevation(
  corners: readonly [number, number, number][],
  cameraZ: number,
  project?: ReadingBookProjector,
): ReadingBookElevation {
  return corners.map((corner) => {
    if (project) return project(corner);
    const [x, y, z] = corner;
    const perspective = cameraZ / (cameraZ - z);
    return [x * perspective, y * perspective] as [number, number];
  }) as ReadingBookElevation;
}

/** The cloth board's visible face. Unlike the book's center-plane elevation,
 * this includes half the real shell thickness so cover art centers on it. */
export function readingBookCoverPerspectiveElevation(
  pose: ReadingBookPose,
  cameraZ: number,
  thickness: number,
  project?: ReadingBookProjector,
): ReadingBookElevation {
  const halfWidth = ABOUT_READING_BOOK.width / 2;
  const halfHeight = ABOUT_READING_BOOK.depth / 2;
  const coverY = thickness / 2;
  return perspectiveElevation(
    [
      point3(pose, -halfWidth, coverY, halfHeight),
      point3(pose, halfWidth, coverY, halfHeight),
      point3(pose, halfWidth, coverY, -halfHeight),
      point3(pose, -halfWidth, coverY, -halfHeight),
    ],
    cameraZ,
    project,
  );
}

/** Complete cover-colored fore-edge, from the front board to the back board. */
export function readingBookForeEdgePerspectiveElevation(
  pose: ReadingBookPose,
  cameraZ: number,
  thickness: number,
  project?: ReadingBookProjector,
): ReadingBookElevation {
  const x = ABOUT_READING_BOOK.width / 2;
  const halfHeight = ABOUT_READING_BOOK.depth / 2;
  const halfThickness = thickness / 2;
  return perspectiveElevation(
    [
      point3(pose, x, halfThickness, halfHeight),
      point3(pose, x, -halfThickness, halfHeight),
      point3(pose, x, -halfThickness, -halfHeight),
      point3(pose, x, halfThickness, -halfHeight),
    ],
    cameraZ,
    project,
  );
}

/** Cream page block inset inside the two cloth boards and their overhang. */
export function readingBookPageCorePerspectiveElevation(
  pose: ReadingBookPose,
  cameraZ: number,
  thickness: number,
  project?: ReadingBookProjector,
): ReadingBookElevation {
  const x = ABOUT_READING_PAGE_BLOCK.width / 2;
  const halfHeight = ABOUT_READING_PAGE_BLOCK.depth / 2;
  const halfThickness = Math.max(
    0,
    thickness / 2 - ABOUT_READING_BOARD_THICKNESS,
  );
  return perspectiveElevation(
    [
      point3(pose, x, halfThickness, halfHeight),
      point3(pose, x, -halfThickness, halfHeight),
      point3(pose, x, -halfThickness, -halfHeight),
      point3(pose, x, halfThickness, -halfHeight),
    ],
    cameraZ,
    project,
  );
}

/** Exact four corners of the live LitImage after its face-up inner rotation,
 * the book's authored fan rotation, and the boot camera's mild perspective. */
export function readingBookImagePerspectiveElevation(
  pose: ReadingBookPose,
  cameraZ: number,
  thickness: number,
  project?: ReadingBookProjector,
): ReadingBookElevation {
  const halfWidth = ABOUT_READING_COVER_IMAGE.width / 2;
  const halfHeight = ABOUT_READING_COVER_IMAGE.height / 2;
  const coverY = thickness / 2 + ABOUT_READING_COVER_IMAGE.lift;
  const corners = [
    point3(pose, -halfWidth, coverY, halfHeight),
    point3(pose, halfWidth, coverY, halfHeight),
    point3(pose, halfWidth, coverY, -halfHeight),
    point3(pose, -halfWidth, coverY, -halfHeight),
  ] as const;
  return perspectiveElevation(corners, cameraZ, project);
}

/** Orthographic front elevation of the printed cover. The loading vignette
 * deliberately uses this rectangular form: it preserves the live pose and
 * inset while avoiding a tiny perspective trapezoid at loading-screen scale. */
export function readingBookImageFrontElevation(
  pose: ReadingBookPose,
  thickness: number,
): ReadingBookElevation {
  const halfWidth = ABOUT_READING_COVER_IMAGE.width / 2;
  const halfHeight = ABOUT_READING_COVER_IMAGE.height / 2;
  const coverY = thickness / 2 + ABOUT_READING_COVER_IMAGE.lift;
  return [
    point3(pose, -halfWidth, coverY, halfHeight),
    point3(pose, halfWidth, coverY, halfHeight),
    point3(pose, halfWidth, coverY, -halfHeight),
    point3(pose, -halfWidth, coverY, -halfHeight),
  ].map(([x, y]): [number, number] => [x, y]) as ReadingBookElevation;
}

export function readingStackBounds(poses: ReadingBookPose[]) {
  const halfW = ABOUT_READING_BOOK.width / 2;
  const halfT = ABOUT_READING_BOOK.thickness / 2;
  const halfD = ABOUT_READING_BOOK.depth / 2;
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;
  for (const pose of poses) {
    for (const x of [-halfW, halfW]) {
      for (const y of [-halfT, halfT]) {
        for (const z of [-halfD, halfD]) {
          const [worldX, worldY] = point3(pose, x, y, z);
          left = Math.min(left, worldX);
          right = Math.max(right, worldX);
          bottom = Math.min(bottom, worldY);
          top = Math.max(top, worldY);
        }
      }
    }
  }
  return { left, right, bottom, top };
}

export const READING_HELD_COVER_TILT = Math.PI / 2;

export type AboutReadingMaterialEvidence = {
  id: string;
  edge: string;
  source: ReadingBookEdgeColor["source"];
  cover: string;
  pages: string;
};

let materialEvidence: AboutReadingMaterialEvidence[] = [];

/** Development-only visual evidence is populated by ReadingStack after the
 * current server-derived colors and theme treatment meet in the client. */
export function recordAboutReadingMaterials(
  materials: AboutReadingMaterialEvidence[],
) {
  materialEvidence = materials.map((material) => ({ ...material }));
}

export function aboutReadingMaterials() {
  return materialEvidence.map((material) => ({ ...material }));
}

/** While carried, turn every jacket fully toward +Z and square its bank.
 * `amount=0` is bit-for-bit the authored contact pose, so release can always
 * settle home without a second source of truth. */
export function readingHeldRotation(
  rest: [number, number, number],
  amount: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, amount));
  return [
    rest[0] * (1 - t) + READING_HELD_COVER_TILT * t,
    rest[1] * (1 - t),
    rest[2] * (1 - t),
  ];
}

/** Camera-facing component of a book's +Y cover normal. */
export function readingCoverForward(rotation: [number, number, number]) {
  return rotate(0, 1, 0, rotation)[2];
}

/** Negative X points from the reading fan toward the About practical. */
export function readingCoverLampward(rotation: [number, number, number]) {
  return rotate(0, 1, 0, rotation)[0];
}

export function aboutReadingSnapshot() {
  const poses = readingStackPoses();
  const bounds = readingStackBounds(poses);
  const contacts = poses.flatMap((pose) => [
    readingBookPoint3(pose, "shelf-toe"),
    readingBookPoint3(pose, "lean-contact"),
  ]);
  return {
    poses: poses.map((pose) => ({
      ...pose,
      base: [...pose.base] as [number, number, number],
      rotation: [...pose.rotation] as [number, number, number],
    })),
    bounds,
    contactError: {
      shelf: Math.max(...contacts.map((point) => Math.abs(point[1]))),
    },
    topCollectivePhoto: {
      x: ABOUT_TOP_COLLECTIVE_PHOTO_X,
      right: ABOUT_TOP_COLLECTIVE_PHOTO_X + 0.3072 / 2,
    },
  };
}

declare global {
  interface Window {
    __aboutReading?: {
      snapshot: typeof aboutReadingSnapshot;
      materials: typeof aboutReadingMaterials;
    };
  }
}

if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  window.__aboutReading = {
    snapshot: aboutReadingSnapshot,
    materials: aboutReadingMaterials,
  };
}
