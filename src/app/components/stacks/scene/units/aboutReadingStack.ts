export const ABOUT_READING_BOOK = {
  width: 0.285,
  /** Default/fallback only; live books derive their fore-edge from length. */
  thickness: 0.048,
  depth: 0.45,
  radius: 0.008,
} as const;

export type ReadingBookPose = {
  /** Newest first; the three jackets form a shallow camera-overlapped fan. */
  index: number;
  base: [number, number, number];
  rotation: [number, number, number];
};

export const ABOUT_SMALL_PLANT_X = 0.72;
/** Measured GLB width 1.4887 × authored 0.18 scale ÷ 2, rounded outward. */
export const ABOUT_SMALL_PLANT_ENVELOPE = 0.135;
export const ABOUT_LOWER_PHOTO_X = 1.06;
export const ABOUT_LOWER_PHOTO_LEFT = ABOUT_LOWER_PHOTO_X - 0.3072 / 2;

export const CURRENT_READING_ROTATION: [number, number, number] = [
  Math.PI / 2,
  0,
  Math.PI / 6,
];
export const CURRENT_READING_BASE: [number, number, number] = [
  0.33,
  ABOUT_READING_BOOK.depth / 2,
  0.035,
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

/** Three grounded books turned 30° toward the About practical. Their shallow
 * x/depth cadence overlaps in camera space without intersecting in 3D. */
export function readingStackPoses(): [
  ReadingBookPose,
  ReadingBookPose,
  ReadingBookPose,
] {
  return ([0, 1, 2] as const).map((index) => ({
    index,
    base: [
      CURRENT_READING_BASE[0] + index * 0.185,
      CURRENT_READING_BASE[1],
      CURRENT_READING_BASE[2] + index * 0.046,
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
  source: "edge" | "fallback";
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
    lowerPhoto: {
      x: ABOUT_LOWER_PHOTO_X,
      right: ABOUT_LOWER_PHOTO_X + 0.3072 / 2,
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
