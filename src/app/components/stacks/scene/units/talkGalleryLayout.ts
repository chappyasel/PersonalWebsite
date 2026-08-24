// The five featured-talk photographs, each on a different piece of display
// hardware — and, more to the point, each held up by a DIFFERENT MECHANISM.
// Five props that all stand on a shelf are five variations on one idea; these
// five disagree about how an object resists gravity at all:
//
//   demo-night    LEANS. A deep carved gilt gallery frame, far too heavy for
//                 a stand, tipped back into the bookcase's own left post.
//                 Gravity holds it into the post; nothing else does.
//   dc-policy     RESTS. The formal one, on an ornate tabletop easel with
//                 turned legs, a brass tray and a finial — the frame stands
//                 on furniture, and the furniture stands on the shelf.
//   ann-interview CANTILEVERS. A studio monitor arm clamped over the plank's
//                 back edge carries the frame out into the air from behind.
//                 Nothing beneath it touches the shelf.
//   consensus     HANGS. Two brass wires drop from the underside of the shelf
//                 ABOVE, so this one is in pure tension and hangs plumb —
//                 which is why it is the only one whose pitch and roll are
//                 exactly zero.
//   panel         IS GRIPPED. A stone-and-brass plinth with an angled slot
//                 holds the print from below, reclining it like a museum
//                 label.
//
// Every contact is solved here rather than eyeballed: the lean's top edge
// lands on the strap's front face, the easel frame's back face lies along the
// working plane, the arm's head meets the frame's back, the wires hang plumb
// from the plank above, the plinth's slot matches the print's recline.
// talkGalleryLayout.test.ts re-derives each one, so retuning a pitch or a
// border cannot quietly leave a print floating.
//
// Pure data + math (no React, no three) so the unit file, the forms, the
// tests and the perch generator all read the same numbers.
import type {
  ArtifactPreviewFrameAccent,
  ArtifactPreviewFrameLayer,
} from "../../modal/artifactPreviewFrame";
import { LOWER_SHELF_HEADROOM, SHELF_GEOMETRY } from "../shelfGeometry";

export type Vec3 = readonly [number, number, number];

/** How the object resists gravity. One per photograph, deliberately. */
export type TalkSetupKind =
  | "gilt-lean"
  | "easel"
  | "arm-mount"
  | "suspended"
  | "plinth";

export type TalkSetup = Readonly<{
  kind: TalkSetupKind;
  shelf: "top" | "lower";
  /** Image plane, cut to the source file's exact ratio. */
  image: Readonly<{ width: number; height: number }>;
  /** Edge layers inner→outer — BOTH the rendered geometry and the fullscreen
   * preview draw from these, which is what keeps click-to-preview accurate. */
  layers: readonly ArtifactPreviewFrameLayer[];
  /** Small face details that remain attached to the print in fullscreen. */
  previewAccents: readonly ArtifactPreviewFrameAccent[];
  /** Physical depth of the framed object. */
  thickness: number;
  /** Grabbable base: local x/z on the shelf, y always 0 (the wood). */
  base: Vec3;
  /** Rest rotation (XYZ euler): pitch (lean back < 0), yaw, roll. */
  rest: Vec3;
  /** Height of the framed box's LOWEST corner above the shelf. For the props
   * that stand, this is the support under them (a tray, a slot floor); for
   * the two that do not touch the shelf at all, it is how far they float. */
  lift: number;
  massKg: number;
}>;

export const TALK_SETUP_IDS = [
  "talk-demo-night-v8",
  "talk-dc-policy-v8",
  "talk-ann-interview-v8",
  "talk-consensus-phone-v8",
  "talk-panel-v8",
] as const;

export type TalkSetupId = (typeof TALK_SETUP_IDS)[number];

// --- materials the hardware is made of --------------------------------------
//
// Fixed tones, not palette entries. Gilding, anodised aluminium, brass and
// stone do not change colour when the room goes to night; the palette's
// `frame`/`pages` creams are paper stock and rightly do.

/** Antique gilding, not chrome-yellow. The first pass ran bright and highly
 * metallic and read as moulded plastic under the room's warm key; gilding is
 * a thin leaf over gesso, so it is duller and rougher than solid metal. */
export const TALK_GILT = "#b0913f";
export const TALK_GILT_DEEP = "#7d6429";
export const TALK_GILT_METALNESS = 0.42;
export const TALK_GILT_ROUGHNESS = 0.52;
export const TALK_BEZEL = "#9aa0a6";
export const TALK_BRASS = "#b08b3c";
export const TALK_STONE = "#6b665f";

/** Outer inset of a layer stack = half the framed-minus-image width. */
export function talkLayerOuterInset(
  layers: readonly ArtifactPreviewFrameLayer[],
) {
  return layers.reduce((max, layer) => Math.max(max, layer.inset), 0);
}

export function talkFramedSize(setup: Omit<TalkSetup, "base">) {
  const inset = talkLayerOuterInset(setup.layers);
  return {
    width: setup.image.width + inset * 2,
    height: setup.image.height + inset * 2,
  };
}

/** Rows of the XYZ euler rotation matrix R = RX·RY·RZ. */
function rotationRows([x, y, z]: Vec3) {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(x),
    Math.sin(x),
    Math.cos(y),
    Math.sin(y),
    Math.cos(z),
    Math.sin(z),
  ];
  return [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ] as const;
}

export function rotateTalkPoint(rest: Vec3, point: Vec3): Vec3 {
  const rows = rotationRows(rest);
  return [0, 1, 2].map(
    (axis) =>
      rows[axis]![0] * point[0] +
      rows[axis]![1] * point[1] +
      rows[axis]![2] * point[2],
  ) as unknown as Vec3;
}

/** Centre height that puts the framed box's lowest corner at y = lift.
 * Exact for any pitch/yaw/roll: the lowest corner of a rotated box sits at
 * −(|R10|·hw + |R11|·hh + |R12|·ht) below the centre. */
export function talkSeat(setup: Omit<TalkSetup, "base">) {
  const framed = talkFramedSize(setup);
  const rows = rotationRows(setup.rest);
  return (
    setup.lift +
    Math.abs(rows[1][0]) * (framed.width / 2) +
    Math.abs(rows[1][1]) * (framed.height / 2) +
    Math.abs(rows[1][2]) * (setup.thickness / 2)
  );
}

/** Clearance between a form's image plane (local z 0) and the front face of
 * the solid it is mounted on. Every form shares it so nothing z-fights, and
 * so `talkBoxCenterLocalZ` can say where the solid actually is. */
export const TALK_FACE_GAP = 0.001;

/** Local z of the framed solid's centre. The image plane is local z 0 and
 * the box hangs BEHIND it — which is the whole reason this exists: an insect
 * Perch authored at local z 0 sits in the air in front of the print, and a
 * downward probe ray at that (x, z) misses the geometry entirely. */
export function talkBoxCenterLocalZ(setup: Omit<TalkSetup, "base">) {
  return -(setup.thickness / 2 + TALK_FACE_GAP);
}

/** A point in the framed box's local frame, in shelf-local coordinates. */
export function talkFramePoint(setup: TalkSetup, local: Vec3): Vec3 {
  const rotated = rotateTalkPoint(setup.rest, local);
  return [
    setup.base[0] + rotated[0],
    talkSeat(setup) + rotated[1],
    setup.base[2] + rotated[2],
  ];
}

/** z of a setup's back plane at an arbitrary shelf-local (x, y). The plane,
 * not a centreline slice: hardware that meets the back of a yawed print does
 * so at its own x, not at the print's middle. */
export function talkBackPlaneZ(setup: TalkSetup, x: number, y: number) {
  const normal = rotateTalkPoint(setup.rest, [0, 0, 1]);
  const origin = talkFramePoint(setup, [0, 0, talkBoxCenterLocalZ(setup)]);
  return (
    origin[2] +
    (normal[0] * (origin[0] - x) + normal[1] * (origin[1] - y)) / normal[2]
  );
}

// --- 1. the bookcase post the gilt frame leans on ---------------------------

export const TALK_POST = {
  x: -(SHELF_GEOMETRY.width / 2 - SHELF_GEOMETRY.strapInsetX),
  /** Front face of the strap, the plane the frame's back touches. */
  faceZ: SHELF_GEOMETRY.strapZ + SHELF_GEOMETRY.support.width / 2,
} as const;

// --- 2. the ornate tabletop easel -------------------------------------------

/** All in shelf-local units. The photo's numbers derive from these so the
 * frame and the furniture cannot drift apart. */
export const TALK_EASEL = {
  x: -0.28,
  yaw: -0.07,
  /** Backward rake of the working face, shared by legs and photo. */
  rake: 0.18,
  /** z of the working plane at shelf height (y = 0). */
  planeZ: 0.11,
  /** The mast stops BELOW the frame's top edge. Measured, not styled: the
   * easel is one static collision island, so its bounding box is what an
   * insect Perch on the frame's top edge has to clear. At 0.68 the leg tops
   * stood proud of that edge and `talks:dc-policy-frame-top` came back
   * `resting-pose-blocked` on every sample. */
  legLength: 0.58,
  legHalfSpan: 0.25,
  legSize: 0.026,
  /** Legs splay outward at the feet by this roll. */
  legSplay: 0.07,
  /** Turned bulges up each leg, as a fraction of leg length. */
  turnings: [0.2, 0.46, 0.72] as const,
  turningRadius: 0.023,
  turningHeight: 0.03,
  finialRadius: 0.019,
  trayY: 0.145,
  trayWidth: 0.6,
  trayDepth: 0.058,
  trayThickness: 0.022,
  lipHeight: 0.032,
  lipThickness: 0.013,
  /** Pull the lip's front face off the tray's front plane. Coplanar faces
   * flicker into black streaks under the easel frame. */
  lipProud: 0.0025,
  crossbarY: 0.47,
  rearLegPitch: 0.34,
  rearLegLength: 0.63,
} as const;

/** z of the easel's working plane at height y. */
export function talkEaselPlaneZ(y: number) {
  return TALK_EASEL.planeZ - y * Math.tan(TALK_EASEL.rake);
}

/** Local z of the brass lip's centre within the tray group. */
export function talkEaselLipCenterLocalZ() {
  return (
    TALK_EASEL.trayDepth / 2 - TALK_EASEL.lipThickness / 2 + TALK_EASEL.lipProud
  );
}

/** Highest point of the easel's own geometry, which an insect landing on the
 * frame's top edge has to clear. */
export function talkEaselMastTop() {
  return (
    TALK_EASEL.legLength *
      Math.cos(TALK_EASEL.rake) *
      Math.cos(TALK_EASEL.legSplay) +
    TALK_EASEL.finialRadius
  );
}

// --- 3. the studio monitor arm ----------------------------------------------

export const TALK_ARM = {
  /** The clamp grips the top plank's back edge. */
  clampZ: SHELF_GEOMETRY.top.centerZ - SHELF_GEOMETRY.top.depth / 2 + 0.045,
  clampWidth: 0.085,
  clampHeight: 0.05,
  clampDepth: 0.075,
  /** Jaw reaching down behind the plank's back edge. */
  jawDrop: 0.06,
  postRadius: 0.017,
  /** Height of the horizontal boom above the plank. */
  boomY: 0.42,
  boomThickness: 0.026,
  /** Head that bolts to the back of the frame. */
  headWidth: 0.07,
  headHeight: 0.055,
  /** Counterweight disc behind the post. */
  weightRadius: 0.055,
  weightThickness: 0.028,
  weightY: 0.075,
} as const;

// --- 4. the wires the consensus print hangs from ----------------------------

export const TALK_HANG = {
  /** The plank above, in the lower shelf's own frame. This is the fixed
   * point the whole mount depends on, and it is derived rather than typed:
   * a shelf-geometry change must move the wires, not strand them. */
  anchorY: LOWER_SHELF_HEADROOM,
  wireRadius: 0.0035,
  /** Wire attachment across the print's top edge, as a fraction of half
   * width — inboard of the corners, where an eyelet would really sit. */
  spread: 0.78,
  eyeletRadius: 0.009,
  /** Ceiling plate the wires run into. */
  plateWidth: 0.09,
  plateDepth: 0.05,
  plateThickness: 0.008,
} as const;

// --- 5. the slotted plinth --------------------------------------------------

/** A museum plinth in three courses — brass base band, stone body, stepped
 * cap — rather than the single slab it started as. A 5cm slab under a 31cm
 * print read as a grey bar; the stepped profile is what makes it read as a
 * pedestal holding something up. */
export const TALK_PLINTH = {
  x: 0.5,
  yaw: -0.1,
  width: 0.46,
  depth: 0.17,
  baseHeight: 0.014,
  bodyHeight: 0.052,
  capHeight: 0.019,
  /** The body is drawn in from the base and cap, so both read as courses. */
  bodyInset: 0.017,
  /** Slot floor, recessed into the cap. */
  slotFloorY: 0.07,
  slotWidth: 0.38,
  /** Brass liner thickness on each side of the slot. */
  linerThickness: 0.006,
  chamfer: 0.005,
} as const;

/** Overall height of the plinth's three courses. */
export function talkPlinthHeight() {
  return (
    TALK_PLINTH.baseHeight + TALK_PLINTH.bodyHeight + TALK_PLINTH.capHeight
  );
}

// --- the five setups --------------------------------------------------------

const DEMO_W = 0.66;
const DC_W = 0.66;
const ANN_W = 0.5;
const CONSENSUS_W = 0.6;
const PANEL_W = 0.552;

/** Deep carved molding: a pale liner inside heavy gilt. */
const GILT_LAYERS: readonly ArtifactPreviewFrameLayer[] = [
  { inset: 0.016, tone: "pages", radius: 0, finish: "paper" },
  { inset: 0.048, tone: TALK_GILT, radius: 0.006, finish: "gilt" },
  { inset: 0.058, tone: TALK_GILT_DEEP, radius: 0.006, finish: "gilt" },
];
const GILT_ACCENTS: readonly ArtifactPreviewFrameAccent[] = [
  {
    kind: "corner-blocks",
    tone: TALK_GILT,
    size: 0.034,
    edgeInset: 0.017,
    radius: 0.004,
  },
];
/** The most elaborate stack in the room: gold fillet, wide mat, wood frame. */
const EASEL_LAYERS: readonly ArtifactPreviewFrameLayer[] = [
  { inset: 0.012, tone: TALK_GILT, radius: 0, finish: "gilt" },
  { inset: 0.05, tone: "pages", radius: 0, finish: "paper" },
  { inset: 0.072, tone: "frame", radius: 0.005, finish: "wood" },
];
/** One thin anodised bezel — a monitor, not a picture. */
const ARM_LAYERS: readonly ArtifactPreviewFrameLayer[] = [
  { inset: 0.02, tone: TALK_BEZEL, radius: 0.003, finish: "metal" },
];
/** A narrow board edge, with the brass eyelets supplied as face accents. */
const HUNG_LAYERS: readonly ArtifactPreviewFrameLayer[] = [
  { inset: 0.01, tone: "paper", radius: 0.002, finish: "paper" },
];
const HUNG_ACCENTS: readonly ArtifactPreviewFrameAccent[] = [
  {
    kind: "eyelets",
    tone: TALK_BRASS,
    radius: TALK_HANG.eyeletRadius,
    stroke: 0.003,
    spread: TALK_HANG.spread,
  },
];
/** A deckled paper margin. */
const PLINTH_LAYERS: readonly ArtifactPreviewFrameLayer[] = [
  { inset: 0.018, tone: "paper", radius: 0.002, finish: "paper" },
];

function image(width: number, source: Readonly<{ w: number; h: number }>) {
  return { width, height: width * (source.h / source.w) };
}

const GILT_PARTIAL: Omit<TalkSetup, "base"> = {
  kind: "gilt-lean",
  shelf: "lower",
  image: image(DEMO_W, { w: 1024, h: 640 }),
  layers: GILT_LAYERS,
  previewAccents: GILT_ACCENTS,
  thickness: 0.038,
  rest: [-0.42, 0.08, -0.012],
  lift: 0,
  massKg: 2.4,
};

const GILT_BASE_X = -0.9;

/** Solves the lean's base z: the top back edge, at the post's x, must touch
 * the strap's front face. */
function giltBaseZ(setup: Omit<TalkSetup, "base">, baseX: number): number {
  const framed = talkFramedSize(setup);
  const contact = rotateTalkPoint(setup.rest, [
    TALK_POST.x - baseX,
    framed.height / 2,
    -(setup.thickness + TALK_FACE_GAP),
  ]);
  return TALK_POST.faceZ - contact[2];
}

/** A pitched-then-yawed XYZ euler carries a parasitic roll of about
 * sin(pitch)·sin(yaw) that drops one bottom corner. A frame on a tray does
 * what any rigid box on a flat ledge does — settles flat — so this is the
 * roll that levels the bottom edge again. */
const EASEL_SETTLE_ROLL = Math.atan(
  Math.tan(TALK_EASEL.rake) * Math.sin(TALK_EASEL.yaw),
);

const EASEL_PARTIAL: Omit<TalkSetup, "base"> = {
  kind: "easel",
  shelf: "top",
  image: image(DC_W, { w: 1024, h: 576 }),
  layers: EASEL_LAYERS,
  previewAccents: [],
  thickness: 0.022,
  // Pitch matches the easel rake, so the whole back face lies along the
  // working plane: tray at the bottom edge, crossbar behind the mat.
  rest: [-TALK_EASEL.rake, TALK_EASEL.yaw, EASEL_SETTLE_ROLL],
  lift: TALK_EASEL.trayY,
  massKg: 1.4,
};

/** Base z that lays the easel photo's back face on the working plane: the
 * bottom back edge's centre lands on the plane at its own height. */
function easelBaseZ(partial: Omit<TalkSetup, "base">): number {
  const framed = talkFramedSize(partial);
  const edge = rotateTalkPoint(partial.rest, [
    0,
    -framed.height / 2,
    talkBoxCenterLocalZ(partial),
  ]);
  return talkEaselPlaneZ(talkSeat(partial) + edge[1]) - edge[2];
}

const PLINTH_PARTIAL: Omit<TalkSetup, "base"> = {
  kind: "plinth",
  shelf: "top",
  image: image(PANEL_W, { w: 1024, h: 576 }),
  layers: PLINTH_LAYERS,
  previewAccents: [],
  thickness: 0.016,
  rest: [-0.24, TALK_PLINTH.yaw, 0.01],
  lift: TALK_PLINTH.slotFloorY,
  massKg: 0.34,
};

/** z of the slot's centreline, in the plinth's own frame. Authored; the
 * print is then solved onto it. */
export const TALK_PLINTH_SLOT_Z = 0.025;

/** The plinth's slot is cut where the print's own mid-plane crosses the slot
 * floor, so the stone grips the print along its bottom edge instead of the
 * print hovering in a decorative groove. */
function plinthBaseZ(partial: Omit<TalkSetup, "base">): number {
  const framed = talkFramedSize(partial);
  const mid = rotateTalkPoint(partial.rest, [
    0,
    -framed.height / 2,
    talkBoxCenterLocalZ(partial),
  ]);
  return TALK_PLINTH_SLOT_Z - mid[2];
}

export const TALK_SETUPS: Readonly<Record<TalkSetupId, TalkSetup>> = {
  "talk-demo-night-v8": {
    ...GILT_PARTIAL,
    base: [GILT_BASE_X, 0, giltBaseZ(GILT_PARTIAL, GILT_BASE_X)],
  },
  "talk-dc-policy-v8": {
    ...EASEL_PARTIAL,
    base: [TALK_EASEL.x, 0, easelBaseZ(EASEL_PARTIAL)],
  },
  "talk-ann-interview-v8": {
    kind: "arm-mount",
    shelf: "top",
    image: image(ANN_W, { w: 1024, h: 640 }),
    layers: ARM_LAYERS,
    previewAccents: [],
    thickness: 0.018,
    base: [-1.02, 0, 0.03],
    // A monitor's own slight recline. Yawed toward the aisle, like a screen
    // turned to face whoever is standing at the shelf.
    rest: [-0.08, 0.16, 0],
    // Held clear of the wood entirely — the arm carries all of it.
    lift: 0.2,
    massKg: 0.85,
  },
  "talk-consensus-phone-v8": {
    kind: "suspended",
    shelf: "lower",
    image: image(CONSENSUS_W, { w: 1024, h: 576 }),
    layers: HUNG_LAYERS,
    previewAccents: HUNG_ACCENTS,
    thickness: 0.014,
    base: [0.04, 0, 0.02],
    // Plumb. A hanging board has no pitch and no roll — only the yaw it
    // happens to have turned to. This is the invariant the test locks.
    rest: [0, -0.14, 0],
    lift: 0.315,
    massKg: 0.42,
  },
  "talk-panel-v8": {
    ...PLINTH_PARTIAL,
    base: [TALK_PLINTH.x, 0, plinthBaseZ(PLINTH_PARTIAL)],
  },
};

/** Where the two wires meet the print's top edge, and where they meet the
 * plank above. Wires hang PLUMB, so the upper point shares the lower one's
 * x and z — anything else would be a wire under bending load. */
export function talkHangWires() {
  const setup = TALK_SETUPS["talk-consensus-phone-v8"];
  const framed = talkFramedSize(setup);
  return [-1, 1].map((side) => {
    // The wire leaves the TOP of the eyelet, which is set just inside the
    // board's top edge — so the ring's crown and the board's edge coincide.
    const eyelet = talkFramePoint(setup, [
      (side * framed.width * TALK_HANG.spread) / 2,
      framed.height / 2,
      talkBoxCenterLocalZ(setup),
    ]);
    return {
      eyelet,
      anchor: [eyelet[0], TALK_HANG.anchorY, eyelet[2]] as Vec3,
      length: TALK_HANG.anchorY - eyelet[1],
    };
  });
}

/** Where the monitor arm's head meets the back of the frame, and the boom
 * that reaches it. The head sits at the frame's centre of mass height so the
 * mount is not holding a moment it has no counterweight for. */
export function talkArmMount() {
  const setup = TALK_SETUPS["talk-ann-interview-v8"];
  const head: Vec3 = [
    setup.base[0],
    talkSeat(setup),
    talkBackPlaneZ(setup, setup.base[0], talkSeat(setup)),
  ];
  return {
    head,
    /** Boom runs from the clamp post forward to the head. */
    boomFromZ: TALK_ARM.clampZ,
    boomToZ: head[2],
    boomY: TALK_ARM.boomY,
    postX: setup.base[0],
  };
}

/** Where an insect lands on one of these prints, and how it is oriented:
 * the centre of the framed solid's TOP face, with the face's own up and
 * along-edge directions. The Perch catalogue's talks entries are these
 * numbers — regenerate them (rounded to 4dp) after any repose rather than
 * nudging them by hand, or the authored anchor drifts off the geometry and
 * the resolver falls back to its lattice. */
export function talkPerchPose(id: TalkSetupId) {
  const setup = TALK_SETUPS[id];
  const framed = talkFramedSize(setup);
  return {
    position: talkFramePoint(setup, [
      0,
      framed.height / 2,
      talkBoxCenterLocalZ(setup),
    ]),
    normal: rotateTalkPoint(setup.rest, [0, 1, 0]),
    tangent: rotateTalkPoint(setup.rest, [1, 0, 0]),
  };
}
