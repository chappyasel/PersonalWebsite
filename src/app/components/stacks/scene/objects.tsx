"use client";

// New scene props for the About, Blog, and Systems units.
// Box props use RoundedBox for edge highlights (see primitives.tsx).
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import React, { useMemo, useRef } from "react";
import * as THREE from "three";

import { type Palette, rand } from "../theme";
import { useStacks } from "../store";
import { ContactShade } from "./GroundPool";
import Lift from "./Lift";
import PropLink from "./links";
import LitImage from "./LitImage";

/** Framed standing portrait — the identity anchor of the About unit.
 * Zoom/focus re-crops toward the face; the source square otherwise leads
 * with a blurry foreground hand (audit §3-About). */
export function PortraitFrame({
  src,
  palette,
  textured,
}: {
  src: string;
  palette: Palette;
  textured: boolean;
}) {
  return (
    <group position={[0, 0.62, -0.08]} rotation={[-0.06, 0.06, 0]}>
      <RoundedBox
        castShadow
        args={[1.02, 1.24, 0.04]}
        radius={0.012}
        smoothness={4}
        position={[0, 0, -0.024]}
      >
        <meshStandardMaterial color={palette.frame} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 0, -0.002]}>
        <planeGeometry args={[0.94, 1.16]} />
        <meshStandardMaterial color={palette.pages} roughness={0.9} />
      </mesh>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            width={0.86}
            height={1.08}
            roughness={0.5}
            zoom={1.35}
            focus={[0.52, 0.3]}
          />
        </React.Suspense>
      )}
    </group>
  );
}

/** Print width. 0.176 is a Polaroid 600 print (0.088 m) at the shelves' 2.00
 * world units per metre. It was 0.24, which is 2.73 u/m — the same physical
 * object was standing nearly half again too big next to books that are
 * correct, and four call sites had drifted to four different sizes. Anything
 * overriding this is off the house scale by definition. */
export const POLAROID_SIZE = 0.176;
const POLAROID_T = 0.008;
const POSTCARD = { w: 0.296, h: 0.21, t: 0.005 } as const;

/** Where a print's origin sits inside its own board.
 * - "center": the middle of the print. What a PINNED print wants — the pin's
 *   coordinates on a corkboard are the centre of the picture.
 * - "contact": the bottom-back edge, i.e. the edge a print propped against
 *   something actually rests on. What a LEANING print wants: mount it at the
 *   plank's own y and it stands on the plank.
 *
 * The default is "center" ON PURPOSE, and it is temporary. Flipping it would
 * be the better API, but the twelve leaning call sites and the four pinned
 * ones live in files this change cannot touch, so the two edits cannot land
 * together. With "center" as the default a half-applied migration leaves the
 * scene exactly as it is today; with "contact" it would fling the four
 * corkboard pins 10 cm up the board. Once the leaning sites carry
 * anchor="contact", flip this to "contact" and mark the pins "center". */
export type PrintAnchor = "center" | "contact";

/** The mount y at which a leaning print rests on the surface below it, for a
 * print anchored at "contact".
 *
 * This exists because the y it replaces could not be checked by eye. Every
 * leaning print in the world was mounted at a literal — 0.1425, 0.1555,
 * 0.1305 — each of which was `oldHeight/2 · cos(lean)` for a size the print no
 * longer is. When Polaroid shrank 0.24 → 0.176 and PostcardPrint grew
 * 0.21×0.15 → 0.296×0.21, all fourteen constants silently became wrong: eleven
 * prints floating 1.5–2.2 cm and two buried 1.8–2.2 cm. Nothing in the source
 * looked wrong, because a bare number cannot look wrong.
 *
 * Derived rather than measured, so it cannot go stale: the print occupies
 * x ∈ [−w/2, w/2], y ∈ [0, h], z ∈ [0, t] about its contact edge, and the
 * lowest of those eight corners under `rotation` is what has to land on the
 * wood. Change the size, the lean or the roll and this follows.
 *
 * A pure backward lean returns ~0 — that is the whole point of anchoring at
 * the back edge, since leaning back pivots on it. What this actually corrects
 * is the ROLL: a few degrees of z drops one bottom corner by up to
 * (w/2)·sin(roll), and the yaw amplifies it through the XYZ cross term. On the
 * widest, most-rolled print in the world (the Arches postcard, yaw 0.30 with
 * roll −0.05) that is 1.5 cm, which is not a rounding error. */
const seatMatrix = new THREE.Matrix4();
const seatEuler = new THREE.Euler();
function seat(
  rotation: [number, number, number],
  box: { w: number; h: number; t: number },
): number {
  seatMatrix.makeRotationFromEuler(
    seatEuler.set(rotation[0], rotation[1], rotation[2], "XYZ"),
  );
  // The y row of a column-major Matrix4.
  const e = seatMatrix.elements;
  const [ax, ay, az] = [e[1], e[5], e[9]];
  const lowest =
    -Math.abs(ax) * (box.w / 2) +
    Math.min(0, ay * box.h) +
    Math.min(0, az * box.t);
  return -lowest;
}

export const polaroidSeat = (
  rotation: [number, number, number],
  size: number = POLAROID_SIZE,
) => seat(rotation, { w: size, h: size * 1.21, t: POLAROID_T });

export const postcardSeat = (rotation: [number, number, number]) =>
  seat(rotation, POSTCARD);

/** Instant-print photo: white border, square image high in the frame. Used
 * leaning on shelves and pinned to the corkboard. */
export function Polaroid({
  src,
  palette,
  size = POLAROID_SIZE,
  textured = true,
  anchor = "center",
}: {
  src: string;
  palette: Palette;
  size?: number;
  textured?: boolean;
  anchor?: PrintAnchor;
}) {
  const h = size * 1.21;
  return (
    // Everything below is unchanged and stays registered to the board; only
    // the board's own origin moves.
    <group
      position={anchor === "contact" ? [0, h / 2, POLAROID_T / 2] : [0, 0, 0]}
    >
      <RoundedBox castShadow args={[size, h, POLAROID_T]} radius={0.003} smoothness={2}>
        <meshStandardMaterial color={palette.paper} roughness={0.85} />
      </RoundedBox>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            width={size * 0.88}
            height={size * 0.88}
            roughness={0.55}
            position={[0, h * 0.062, 0.0045]}
          />
        </React.Suspense>
      )}
    </group>
  );
}

/** Small leaning print — the Budapest postcard by the globe. Same anchor rule
 * as Polaroid; both of its call sites lean, neither pins. */
export function PostcardPrint({
  src,
  palette,
  textured = true,
  anchor = "center",
}: {
  src: string;
  palette: Palette;
  textured?: boolean;
  anchor?: PrintAnchor;
}) {
  return (
    <group
      position={
        anchor === "contact" ? [0, POSTCARD.h / 2, POSTCARD.t / 2] : [0, 0, 0]
      }
    >
      {/* A6, 0.148 x 0.105 m, at the shelves' 2.00 u/m. It was 0.21 x 0.15,
          which is a 0.105 m postcard — half-size stationery beside full-size
          books. */}
      <RoundedBox
        castShadow
        args={[POSTCARD.w, POSTCARD.h, POSTCARD.t]}
        radius={0.002}
        smoothness={2}
      >
        <meshStandardMaterial color={palette.paper} roughness={0.9} />
      </RoundedBox>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            width={0.275}
            height={0.19}
            roughness={0.6}
            position={[0, 0, 0.003]}
          />
        </React.Suspense>
      )}
    </group>
  );
}

/** Small stack of calling cards — white-edged, printed top card (v3's
 * pages-toned boxes read as offcut lumber, audit §3-About). */
export function CardStack({ palette }: { palette: Palette }) {
  const printTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 154;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f8f2e4";
    ctx.fillRect(0, 0, 256, 154);
    ctx.fillStyle = "#4a3f30";
    ctx.font = "600 26px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("CHAPPY ASEL", 128, 72);
    ctx.fillRect(78, 88, 100, 2);
    ctx.font = "18px Georgia, serif";
    ctx.fillStyle = "#75634e";
    ctx.fillText("chappyasel.com", 128, 116);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  }, []);
  return (
    // 0.5933 = 0.178/0.30: a business card is 0.089 x 0.051 m, which at the
    // shelves' 2.00 u/m is 0.178 wide. The stack shipped at 0.30, i.e. 3.37
    // u/m — the single most oversized thing on the About shelf, a deck of
    // postcards pretending to be calling cards. Scaling the whole group
    // rather than the box keeps the printed top card registered to the card
    // it is printed on, and keeps the fanned offsets in proportion.
    <group scale={0.5933}>
      {[0, 1, 2, 3].map((i) => (
        <RoundedBox
          key={i}
          castShadow
          args={[0.3, 0.01, 0.18]}
          radius={0.004}
          smoothness={4}
          position={[i * 0.006, 0.005 + i * 0.011, i * 0.004]}
          rotation={[0, rand(i, 41) * 0.5 - 0.25, 0]}
        >
          <meshStandardMaterial color={palette.paper} roughness={0.85} />
        </RoundedBox>
      ))}
      <mesh
        position={[0.018, 0.0441, 0.012]}
        rotation={[-Math.PI / 2, 0, -(rand(3, 41) * 0.5 - 0.25)]}
      >
        <planeGeometry args={[0.284, 0.166]} />
        <meshStandardMaterial map={printTexture} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** The Apple mark as cubic segments in a unit box: y-up, x centred, bottom
 * of the silhouette at y 0, total height 1 — so the geometry helper dials
 * one number and the contact convention comes out for free.
 *
 * Traced, not eyeballed. A freehand pass read as a plum: at ~40px on screen
 * recognition rides entirely on three measurements — the bite's radius, how
 * deep the stem notch cuts between the shoulders, and the leaf's lean — and
 * the eye gets all three wrong at once. Two outlines, because the leaf is
 * detached; ExtrudeGeometry takes them as one shape array. */
const APPLE_OUTLINE: { start: [number, number]; curves: number[][] }[] = [
  {
    start: [0.3811, 0.6591],
    curves: [
      [0.3753, 0.6546, 0.2729, 0.5969, 0.2729, 0.4685],
      [0.2729, 0.3201, 0.4032, 0.2676, 0.4071, 0.2663],
      [0.4065, 0.2631, 0.3864, 0.1944, 0.3384, 0.1244],
      [0.2956, 0.0628, 0.2509, 0.0013, 0.1829, 0.0013],
      [0.1149, 0.0013, 0.0974, 0.0408, 0.0189, 0.0408],
      [-0.0577, 0.0408, -0.0849, 0, -0.1471, 0],
      [-0.2093, 0, -0.2527, 0.057, -0.3026, 0.127],
      [-0.3604, 0.2092, -0.4071, 0.3369, -0.4071, 0.4581],
      [-0.4071, 0.6526, -0.2807, 0.7557, -0.1563, 0.7557],
      [-0.0902, 0.7557, -0.0351, 0.7123, 0.0065, 0.7123],
      [0.046, 0.7123, 0.1076, 0.7583, 0.1828, 0.7583],
      [0.2113, 0.7583, 0.3137, 0.7557, 0.3811, 0.6591],
    ],
  },
  {
    start: [0.1471, 0.8406],
    curves: [
      [0.1782, 0.8775, 0.2002, 0.9287, 0.2002, 0.9799],
      [0.2002, 0.987, 0.1996, 0.9942, 0.1983, 1],
      [0.1477, 0.9981, 0.0875, 0.9663, 0.0512, 0.9242],
      [0.0227, 0.8918, -0.004, 0.8406, -0.004, 0.7887],
      [-0.004, 0.7809, -0.0027, 0.7731, -0.0021, 0.7706],
      [0.0012, 0.77, 0.0064, 0.7693, 0.0116, 0.7693],
      [0.057, 0.7693, 0.1141, 0.7997, 0.1471, 0.8406],
    ],
  },
];

// Cached per height × depth, the plateGeometry idiom — the outline is 19
// beziers and the cap needs triangulating, which is not work to redo on a
// theme flip. The chamfer is a fat 3% of height on purpose: it is the only
// part of the solid whose normals sweep, so under a sparse probe it is what
// separates machined metal from a grey chip, and at 40 screen pixels a
// hairline chamfer is just something for antialiasing to eat.
const appleGeometryCache = new Map<string, THREE.ExtrudeGeometry>();
function appleGeometry(height: number, depth: number): THREE.ExtrudeGeometry {
  const key = `${height}|${depth}`;
  const hit = appleGeometryCache.get(key);
  if (hit) return hit;
  const shapes = APPLE_OUTLINE.map(({ start, curves }) => {
    const shape = new THREE.Shape();
    shape.moveTo(start[0] * height, start[1] * height);
    for (const c of curves) {
      shape.bezierCurveTo(
        c[0]! * height, c[1]! * height,
        c[2]! * height, c[3]! * height,
        c[4]! * height, c[5]! * height,
      );
    }
    return shape;
  });
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: true,
    bevelThickness: height * 0.024,
    bevelSize: height * 0.03,
    bevelSegments: 3,
    curveSegments: 12,
  });
  // Re-seat on the measured box rather than the shape's: the bevel grows the
  // silhouette past the unit box on every axis, so the shape's tidy y 0 is
  // not where the finished solid actually bottoms out.
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  geo.translate(
    -(box.min.x + box.max.x) / 2,
    -box.min.y,
    -(box.min.z + box.max.z) / 2,
  );
  appleGeometryCache.set(key, geo);
  return geo;
}

/** The mark standing in a milled billet — a desk object, the kind of thing
 * you leave a job with. Deliberately paperweight-sized: it is a footnote to
 * a line in the placard, not a logo placement.
 *
 * Metal exception, same reason the trophy needed one: the shared prop atlas
 * forces metalness 0, so anything that has to look like metal has to opt out
 * by hand. The billet is bead-blasted (rougher, darker) and the mark is
 * polished, which is what gives the silhouette an edge to read against when
 * the sky behind it goes pale in the light theme. */
export function DeskApple({ palette }: { palette: Palette }) {
  return (
    <group>
      {/* Bead-blasted, and a full stop darker than the mark. Polished it blew
          out under the lamp into a white bar that read as a strip of card
          rather than a block, and the drop in value is also what keeps the
          mark's lower half legible against its own stand. */}
      <RoundedBox
        castShadow
        args={[0.152, 0.021, 0.054]}
        radius={0.004}
        smoothness={3}
        position={[0, 0.0105, 0]}
      >
        <meshStandardMaterial
          color="#5e6368"
          metalness={0.82}
          roughness={0.52}
          envMapIntensity={1.3}
        />
      </RoundedBox>
      {/* Sunk 4mm into the billet so the joint is a shadow line, not a seam
          the mark appears to balance on. */}
      <mesh castShadow geometry={appleGeometry(0.15, 0.015)} position={[0, 0.017, 0]}>
        <meshStandardMaterial
          color="#c2c6ca"
          metalness={0.9}
          // 0.4, not the 0.3 a polished billet wants. The room's IBL is three
          // lightformers on black, so a tight lobe samples one direction of a
          // mostly EMPTY environment: at 0.3 the face flipped between silver
          // and near-black over ~10° of yaw, which would have made the finish
          // a function of where the prop happened to sit. 0.4 blurs across
          // enough of the probe to be stable wherever it stands.
          roughness={0.4}
          // The room runs its environment at 0.38–0.45 so the painted props
          // stay matte; at that level a metal has almost nothing to reflect
          // and lands as flat grey. This surface reads the same probe louder.
          envMapIntensity={2.2}
        />
      </mesh>
      {/* Grounding travels with the prop (the BookPile rule) — a prop this
          small loses its footing the instant the base darkening drops. */}
      <ContactShade
        color={palette.shadow}
        width={0.26}
        height={0.07}
        position={[0, 0.016, 0.02]}
      />
    </group>
  );
}

/** Paper inbox tray with fanned sheets — replaces the blank quote-card
 * trifold, the audit's worst single element (§3-Systems). */
export function InboxTray({ palette }: { palette: Palette }) {
  return (
    // x1.9. The tray body was 0.38 wide = 0.19 m, and its sheets 0.30 = 0.15 m:
    // a letter tray and a stack of A4 both at about half size, on a plank
    // holding correctly-scaled books. 1.9 lands the body at 0.36 m against a
    // real 0.35 and the sheets at 0.285 against A4's 0.297. Scaling the group
    // keeps the sheets inside the walls that hold them.
    // The grown tray is 0.806 wide once the −0.18 yaw is folded in, so its
    // placement is now load-bearing: UnitSystems carries it at x 0.20, where
    // it spans world −0.203…0.603 against a 1280 placard edge at +0.427 and
    // arrives ~88% visible with its link comfortably clickable. Do not move it
    // right, and re-check the span before scaling it again.
    <group rotation={[0, -0.18, 0]} scale={1.9}>
      <RoundedBox castShadow args={[0.38, 0.016, 0.28]} radius={0.004} smoothness={4} position={[0, 0.008, 0]}>
        <meshStandardMaterial color={palette.strap} roughness={0.6} />
      </RoundedBox>
      {[-1, 1].map((side) => (
        <RoundedBox
          key={side}
          castShadow
          args={[0.014, 0.075, 0.28]}
          radius={0.004}
          smoothness={4}
          position={[side * 0.183, 0.045, 0]}
        >
          <meshStandardMaterial color={palette.strap} roughness={0.6} />
        </RoundedBox>
      ))}
      <RoundedBox castShadow args={[0.38, 0.075, 0.014]} radius={0.004} smoothness={4} position={[0, 0.045, -0.133]}>
        <meshStandardMaterial color={palette.strap} roughness={0.6} />
      </RoundedBox>
      {/* fanned sheets inside, one riding up the back wall */}
      {[0, 1, 2, 3].map((i) => (
        <RoundedBox
          key={i}
          args={[0.3, 0.0045, 0.21]}
          radius={0.002}
          smoothness={2}
          position={[rand(i, 83) * 0.02 - 0.01, 0.02 + i * 0.006, rand(i, 84) * 0.02 - 0.01]}
          rotation={[0, rand(i, 85) * 0.16 - 0.08, 0]}
        >
          <meshStandardMaterial
            color={i % 2 === 0 ? palette.paper : palette.pages}
            roughness={0.95}
          />
        </RoundedBox>
      ))}
      <RoundedBox
        args={[0.28, 0.004, 0.2]}
        radius={0.002}
        smoothness={2}
        position={[0, 0.085, -0.085]}
        rotation={[-0.62, 0, 0.03]}
      >
        <meshStandardMaterial color={palette.paper} roughness={0.95} />
      </RoundedBox>
    </group>
  );
}

/** Row of leaning notebook spines; the front few are clickable blog posts,
 * and — with `linkUnit` — the rest open the writing itself. */
export function NotebookLean({
  palette,
  count = 6,
  clickKeys = [],
  onNotebookClick,
  linkUnit,
}: {
  palette: Palette;
  count?: number;
  clickKeys?: string[];
  onNotebookClick?: (key: string) => void;
  /** Unit index — the spines that aren't a specific post become doors to the
   * blog as a whole (gated on that unit being the active one). */
  linkUnit?: number;
}) {
  const setHovered = useStacks((s) => s.setHovered);
  /** House rule: a prop only answers when its unit is the ACTIVE one. With no
   * `linkUnit` there is no unit to check against, so the spines stay live —
   * the only caller without one is a preview outside the shelf row. */
  const activeHere = () =>
    linkUnit === undefined || useStacks.getState().activeUnit === linkUnit;
  // Two cool accents among warm neutrals, like the shelf spines.
  const colors = [
    palette.spines[8],
    palette.spines[2],
    palette.spines[7],
    palette.spines[9],
    palette.spines[3],
    palette.spines[5],
  ];
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const key = clickKeys[i];
        const lean = i === count - 1 ? -0.2 : rand(i, 51) * 0.06 - 0.03;
        const x = i * 0.105 - (count * 0.105) / 2 + (i === count - 1 ? 0.015 : 0);
        const spine = (
          <RoundedBox
            castShadow
            args={[0.062, 0.52, 0.34]}
            radius={0.008}
            smoothness={4}
            rotation={[0, 0, lean]}
            // Every one of these three returns WITHOUT stopPropagation when
            // this unit is not the active one, exactly as EggTrigger,
            // HoverShell and Grabbable already do. Without the gate a pointer
            // parked on the live strip beside the placard while you stand on
            // Projects claims a Musings notebook, and a click there opens the
            // post instead of travelling to the unit you tapped.
            onPointerOver={
              key
                ? (e) => {
                    if (!activeHere()) return;
                    e.stopPropagation();
                    setHovered(`notebook:${key}`);
                  }
                : undefined
            }
            onPointerOut={
              key
                ? () => {
                    if (useStacks.getState().hovered === `notebook:${key}`)
                      setHovered(null);
                  }
                : undefined
            }
            onClick={
              key && onNotebookClick
                ? (e) => {
                    if ((e.delta ?? 0) > 6) return; // swipe, not a tap
                    if (!activeHere()) return; // fall through → travel
                    e.stopPropagation();
                    onNotebookClick(key);
                  }
                : undefined
            }
          >
            <meshStandardMaterial
              color={colors[i % colors.length]}
              roughness={0.6 + rand(i, 52) * 0.3}
            />
          </RoundedBox>
        );
        // Only clickable spines pay for a useFrame slot. 0.257 = lean-
        // compensated contact, sunk ~radius/2 to bury the bevel rim.
        if (key) {
          return (
            <Lift
              key={i}
              hoverKey={`notebook:${key}`}
              base={[x, 0.257, 0]}
              offset={[0, 0.04, 0.02]}
            >
              {spine}
            </Lift>
          );
        }
        return linkUnit === undefined ? (
          <group key={i} position={[x, 0.257, 0]}>
            {spine}
          </group>
        ) : (
          <PropLink
            key={i}
            unitIndex={linkUnit}
            to="blog"
            hoverKey={`link:notebook:${linkUnit}:${i}`}
            base={[x, 0.257, 0]}
            lift={[0, 0.04, 0.02]}
          >
            {spine}
          </PropLink>
        );
      })}
    </group>
  );
}

/** Paper stack + pen for the Blog lower shelf. `linkUnit` makes the sheets
 * (the pen stays put) a door to the writing. */
export function PaperStack({
  palette,
  linkUnit,
}: {
  palette: Palette;
  linkUnit?: number;
}) {
  // 0.594 x 0.42 is A4 (0.297 x 0.210 m) at the shelves' 2.00 u/m. It was
  // 0.42 x 0.30, and InboxTray's sheets on the Systems unit were 0.30 x 0.21:
  // the same sheet of paper existed at two sizes 1.4x apart, neither right.
  // The pen keeps its own dimensions — at 0.3 long it is already a 0.15 m
  // pen, which is correct, and growing it with the paper would break it.
  const sheets = [0, 1, 2].map((i) => (
    <RoundedBox
      key={i}
      castShadow
      args={[0.594, 0.016, 0.42]}
      radius={0.004}
      smoothness={4}
      position={[i * 0.008, 0.008 + i * 0.017, i * -0.006]}
      rotation={[0, rand(i, 61) * 0.3 - 0.15, 0]}
    >
      <meshStandardMaterial color={palette.paper} roughness={0.95} />
    </RoundedBox>
  ));
  return (
    <group>
      {linkUnit === undefined ? (
        sheets
      ) : (
        <PropLink
          unitIndex={linkUnit}
          to="blog"
          hoverKey={`link:paper:${linkUnit}`}
          lift={[0, 0.022, 0.02]}
        >
          {sheets}
        </PropLink>
      )}
      <mesh
        castShadow
        position={[0.12, 0.062, 0.1]}
        rotation={[0, 0.9, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.012, 0.012, 0.3, 12]} />
        <meshStandardMaterial
          color={palette.hub}
          roughness={0.4}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}

/** 3:45 in clockwise turns — the owner's wake-up time, the egg's
 * destination (the clocks otherwise show the visitor's live time). */
export const CLOCK_BASE = { h: 3.75 / 12, m: 45 / 60 } as const;

/** Egg sweep state. The trigger only stamps `start` (performance.now ms);
 * ClockFace lazily fills the from-angles and per-leg clockwise deltas so
 * all sweep math lives in one place. */
export type ClockSweep = {
  start: number;
  fromH?: number;
  fromM?: number;
  d1H?: number;
  d1M?: number;
  d2H?: number;
  d2M?: number;
};

const SWEEP_S = 1.1;
const HOLD_S = 3;
const smooth = (p: number) => p * p * (3 - 2 * p);
const turn = (v: number) => ((v % 1) + 1) % 1;
const liveTurns = () => {
  const now = new Date();
  return {
    h: ((now.getHours() % 12) + now.getMinutes() / 60) / 12,
    m: (now.getMinutes() + now.getSeconds() / 60) / 60,
  };
};

/** Canvas clock face overlaid on the GLB dials (the painted dial sits
 * behind it on the atlas). At rest it shows the VISITOR'S live local time,
 * refreshed every 30s. `sweepRef` drives the clock egg: the hands wind
 * clockwise to 3:45 — the owner's wake time — hold ~3s, then wind on
 * around to the live time again. The canvas redraws per frame ONLY while
 * a hand is actually moving (idle and hold frames redraw nothing). */
export function ClockFace({
  radius = 0.082,
  sweepRef,
}: {
  radius?: number;
  sweepRef?: { current: ClockSweep | null };
}) {
  const face = useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const c = size / 2;
    // Hand angles in clockwise turns (0 = 12 o'clock); canvas y grows down,
    // so the same cos/sin pair the base face used stays correct.
    const draw = (hourTurns: number, minuteTurns: number) => {
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#f6efdf";
      ctx.beginPath();
      ctx.arc(c, c, c, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#6e5d49";
      ctx.lineWidth = 6;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = i % 3 === 0 ? 0.78 : 0.86;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * c * r0, c + Math.sin(a) * c * r0);
        ctx.lineTo(c + Math.cos(a) * c * 0.92, c + Math.sin(a) * c * 0.92);
        ctx.stroke();
      }
      ctx.strokeStyle = "#443a2d";
      ctx.lineCap = "round";
      const hour = hourTurns * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(hour) * c * 0.45, c + Math.sin(hour) * c * 0.45);
      ctx.stroke();
      const minute = minuteTurns * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(
        c + Math.cos(minute) * c * 0.68,
        c + Math.sin(minute) * c * 0.68,
      );
      ctx.stroke();
      ctx.fillStyle = "#443a2d";
      ctx.beginPath();
      ctx.arc(c, c, 10, 0, Math.PI * 2);
      ctx.fill();
    };
    const live = liveTurns();
    draw(live.h, live.m);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return { draw, texture, mounted: { h: live.h, m: live.m } };
  }, []);
  const last = useRef(face.mounted);
  const lastLiveDraw = useRef(performance.now());
  useFrame(() => {
    const s = sweepRef?.current;
    let h: number;
    let m: number;
    if (!s) {
      // Live mode — a half-minute tick keeps the face honest without
      // uploading a texture per frame.
      if (performance.now() - lastLiveDraw.current < 30_000) return;
      lastLiveDraw.current = performance.now();
      ({ h, m } = liveTurns());
    } else {
      const t = (performance.now() - s.start) / 1000;
      if (s.fromH === undefined || s.fromM === undefined) {
        // Leg 1 anchors: live time at trigger → clockwise to 3:45.
        const from = liveTurns();
        s.fromH = from.h;
        s.fromM = from.m;
        s.d1H = turn(CLOCK_BASE.h - from.h);
        s.d1M = turn(CLOCK_BASE.m - from.m);
      }
      const fromH = s.fromH;
      const fromM = s.fromM;
      const d1H = s.d1H!;
      const d1M = s.d1M!;
      if (t < SWEEP_S) {
        const p = smooth(t / SWEEP_S);
        h = fromH + d1H * p;
        m = fromM + d1M * p;
      } else if (t < SWEEP_S + HOLD_S) {
        h = fromH + d1H;
        m = fromM + d1M;
      } else if (t < SWEEP_S + HOLD_S + SWEEP_S) {
        if (s.d2H === undefined || s.d2M === undefined) {
          // Leg 2: wind on clockwise from 3:45 to the (current) live time.
          const back = liveTurns();
          s.d2H = turn(back.h - CLOCK_BASE.h);
          s.d2M = turn(back.m - CLOCK_BASE.m);
        }
        const p = smooth((t - SWEEP_S - HOLD_S) / SWEEP_S);
        h = fromH + d1H + s.d2H * p;
        m = fromM + d1M + s.d2M * p;
      } else {
        sweepRef.current = null; // lands exactly on live time
        lastLiveDraw.current = performance.now();
        ({ h, m } = liveTurns());
      }
    }
    if (h === last.current.h && m === last.current.m) return;
    last.current = { h, m };
    face.draw(h, m);
    face.texture.needsUpdate = true;
  });

  return (
    <mesh>
      <circleGeometry args={[radius, 32]} />
      <meshStandardMaterial map={face.texture} roughness={0.8} />
    </mesh>
  );
}

