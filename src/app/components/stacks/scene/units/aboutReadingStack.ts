export const ABOUT_READING_BOOK = {
  width: 0.32,
  thickness: 0.048,
  depth: 0.425,
  radius: 0.008,
} as const;

export type ReadingBookPose = {
  /** Newest-first index: 0 newest, 2 third-most-recent. */
  index: number;
  base: [number, number, number];
  rotation: [number, number, number];
};

export const ABOUT_SMALL_PLANT_X = 0.53;
/** Measured GLB width 1.4887 × authored 0.18 scale ÷ 2, rounded outward. */
export const ABOUT_SMALL_PLANT_ENVELOPE = 0.135;
export const ABOUT_LOWER_PHOTO_LEFT = 0.84 - 0.3072 / 2;

// The supplied three-book reference is one compact mass: two almost perfectly
// horizontal books with a small cloth-board offset, then a third standing
// behind them and leaning into their top-left quarter. Keep these authored
// values together — treating them as three independent "nice looking" poses
// is how the previous version became three separated diving boards.
const BOTTOM_X = 0.2;
const MIDDLE_X = 0.18;
const BOTTOM_Z = 0.035;
const MIDDLE_Z = 0.015;
/** Thirty degrees away from vertical, rising toward the stack at screen-right. */
const NEWEST_ANGLE = (60 * Math.PI) / 180;
/** Present enough of the standing jacket face to match the reference instead
 * of showing only a page-block edge to the camera. */
const NEWEST_COVER_TILT = 0.32;
/** The standing book starts on the shelf, just left of and behind the compact
 * pair. Its lower board is hidden slightly by the horizontal stack, while a
 * point farther up the same board meets the pair's rear-left face. */
const STANDING_STACK_INSET = 0.025;
const STANDING_TOE_X = -0.001;
const STANDING_TOE_Z = MIDDLE_Z - ABOUT_READING_BOOK.depth / 2;

/** Matches Three's default XYZ Euler matrix (`Rz * Ry * Rx`). */
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
    cy * cz * x + (sx * sy * cz - cx * sz) * y + (cx * sy * cz + sx * sz) * z,
    cy * sz * x + (sx * sy * sz + cx * cz) * y + (cx * sy * sz - sx * cz) * z,
    -sy * x + sx * cy * y + cx * cy * z,
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

/** Newest-first poses derived from the reference's support graph, not three
 * unrelated offsets. The two older books overlap horizontally as a compact
 * flat pair. The newest is planted on the shelf to their left/rear and leans
 * rightward into their rear-left face, so the pair naturally occludes its
 * lower board rather than appearing to balance it on top. */
export function readingStackPoses(): [
  ReadingBookPose,
  ReadingBookPose,
  ReadingBookPose,
] {
  const halfW = ABOUT_READING_BOOK.width / 2;
  const halfT = ABOUT_READING_BOOK.thickness / 2;
  const halfD = ABOUT_READING_BOOK.depth / 2;
  const third: ReadingBookPose = {
    index: 2,
    base: [BOTTOM_X, halfT, BOTTOM_Z],
    rotation: [0, 0, 0],
  };

  const second: ReadingBookPose = {
    index: 1,
    base: [MIDDLE_X, halfT + ABOUT_READING_BOOK.thickness, MIDDLE_Z],
    rotation: [0, 0, 0],
  };

  // RoundedBox removes the mathematical corner. Use the first real point on
  // the lower-left/front edge as the shelf contact. Pitching around X puts the
  // rest of the volume behind that toe and still exposes its jacket face.
  const newestToeOffset = rotate(
    -halfW + ABOUT_READING_BOOK.radius,
    -halfT,
    halfD - ABOUT_READING_BOOK.radius,
    [NEWEST_COVER_TILT, 0, NEWEST_ANGLE],
  );
  const newest: ReadingBookPose = {
    index: 0,
    base: [
      STANDING_TOE_X - newestToeOffset[0],
      -newestToeOffset[1],
      STANDING_TOE_Z - newestToeOffset[2],
    ],
    rotation: [NEWEST_COVER_TILT, 0, NEWEST_ANGLE],
  };

  return [newest, second, third];
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
  const halfT = ABOUT_READING_BOOK.thickness / 2;
  const halfD = ABOUT_READING_BOOK.depth / 2;
  if (which === "shelf-toe")
    return point3(
      pose,
      -halfW + ABOUT_READING_BOOK.radius,
      -halfT,
      halfD - ABOUT_READING_BOOK.radius,
    );
  if (which === "lean-contact") {
    // Move along the standing book's long axis until its board reaches the
    // horizontal pair's left face. The shared local y/z makes this a real
    // line contact rather than two unrelated hand-tuned world points.
    const stackContactX = MIDDLE_X - halfW + STANDING_STACK_INSET;
    const localToeX = -halfW + ABOUT_READING_BOOK.radius;
    const localContactX =
      localToeX + (stackContactX - STANDING_TOE_X) / Math.cos(NEWEST_ANGLE);
    return point3(
      pose,
      localContactX,
      -halfT,
      halfD - ABOUT_READING_BOOK.radius,
    );
  }
  const stackContactX = MIDDLE_X - halfW + STANDING_STACK_INSET;
  const contactY =
    ((stackContactX - STANDING_TOE_X) / Math.cos(NEWEST_ANGLE)) *
    Math.sin(NEWEST_ANGLE);
  return point3(
    pose,
    -halfW + STANDING_STACK_INSET,
    contactY - (halfT + ABOUT_READING_BOOK.thickness),
    -halfD,
  );
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

export const READING_HELD_COVER_TILT = 0.4;

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

/** While carried, square most of the authored bank and pitch the top surface
 * toward the camera. `amount=0` is bit-for-bit the authored contact pose, so
 * release can always settle home without a second source of truth. */
export function readingHeldRotation(
  rest: [number, number, number],
  amount: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, amount));
  return [
    rest[0] * (1 - t) + READING_HELD_COVER_TILT * t,
    rest[1] * (1 - t),
    rest[2] * (1 - t * 0.76),
  ];
}

export function aboutReadingSnapshot() {
  const poses = readingStackPoses();
  const bounds = readingStackBounds(poses);
  const [, second, third] = poses;
  const middleBottom = second.base[1] - ABOUT_READING_BOOK.thickness / 2;
  const newestToe = readingBookPoint3(poses[0], "shelf-toe");
  const newestLean = readingBookPoint3(poses[0], "lean-contact");
  const newestSupport = readingBookPoint3(second, "stack-contact");
  return {
    poses: poses.map((pose) => ({
      ...pose,
      base: [...pose.base] as [number, number, number],
      rotation: [...pose.rotation] as [number, number, number],
    })),
    bounds,
    contactError: {
      second: Math.abs(
        middleBottom - (third.base[1] + ABOUT_READING_BOOK.thickness / 2),
      ),
      shelf: Math.abs(newestToe[1]),
      newest: Math.hypot(
        newestLean[0] - newestSupport[0],
        newestLean[1] - newestSupport[1],
        newestLean[2] - newestSupport[2],
      ),
    },
    plant: {
      x: ABOUT_SMALL_PLANT_X,
      shelfY: 0,
      gapFromBooks:
        ABOUT_SMALL_PLANT_X - ABOUT_SMALL_PLANT_ENVELOPE - bounds.right,
      gapFromPhoto:
        ABOUT_LOWER_PHOTO_LEFT -
        (ABOUT_SMALL_PLANT_X + ABOUT_SMALL_PLANT_ENVELOPE),
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
