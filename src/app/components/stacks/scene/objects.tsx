"use client";

// New scene props for the About, Blog, and Systems units.
// Box props use RoundedBox for edge highlights (see primitives.tsx).
import { useStacks } from "../store";
import { type Palette, rand } from "../theme";
import { useTexture } from "@react-three/drei";
import React, { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import Grabbable from "./Grabbable";
import { ContactShade } from "./GroundPool";
import Lift from "./Lift";
import LitImage from "./LitImage";
import ModelProp from "./ModelProp";
import { RoundedBox } from "./RoundedBox";
import {
  ABOUT_APPLE_BASE_WIDTH,
  ABOUT_APPLE_MARK_HEIGHT,
} from "./aboutAwardGeometry";
import { APPLE_OUTLINE } from "./appleOutline";
import { MUSINGS_PAPER_STACK } from "./musingsShelfGeometry";
import { propReactionIsEngaged } from "./reactionEngagement";
import { useUnitFrame } from "./unitActivity";

/**
 * The only click path in this scene that actually fires under a real pointer.
 *
 * r3f delivers `onClick` only to an object that was in the hit list captured at
 * POINTERDOWN, and pointerdown does not dispatch reliably under drei's
 * ScrollControls here (`Grabbable.tsx:262-273`). The failure is asymmetric and
 * that is what makes it expensive: a synthetic `mouse.down()/mouse.up()` from a
 * test harness DOES fire the handler, so a dead mechanic passes every automated
 * check and does nothing under a trackpad. Worse, the stale hit list misroutes
 * the NEXT click onto whatever was in it.
 *
 * So the click rides a window-level `pointerup` keyed off the store's hover
 * slot instead, with a drag guard. `EggTrigger`/`HoverProp` still wrap the prop
 * — they own the hover slot and the cursor, and the slot is what this keys off,
 * so a prop can only be clicked from where the prop actually is.
 *
 * Extracted from `UnitTraining`'s `useClubClick`, which is where three
 * components independently converged on this shape (SitChair and the Golden
 * Gate launcher being the other two).
 */
export function usePropClick(
  unitIndex: number,
  hoverKey: string,
  onClick: () => void,
) {
  const fire = useRef(onClick);
  fire.current = onClick;
  useEffect(() => {
    // Where the press started, so a drag across the prop still travels
    // instead of triggering it — the same intent as EggTrigger's `e.delta > 6`.
    let downX = 0;
    let downY = 0;
    let downOn = false;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      downOn = useStacks.getState().hovered === hoverKey;
    };
    const onUp = (e: PointerEvent) => {
      if (!downOn) return;
      downOn = false;
      const s = useStacks.getState();
      if (s.hovered !== hoverKey) return;
      if (s.panelState !== "closed" || s.modalOpen || s.dragging) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      fire.current();
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
    };
  }, [unitIndex, hoverKey]);
}

/** prefers-reduced-motion, read once. A local copy on purpose — eggs.tsx has
 * its own for the same reason primitives.tsx does (import cycles). */
export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Framed standing portrait — the identity anchor of the About unit.
 * Zoom/focus re-crops toward the face; the source square otherwise leads
 * with a blurry foreground hand (audit §3-About). */
export function PortraitFrame({
  src,
  detailSrc,
  palette,
  textured,
}: {
  src: string;
  detailSrc?: string;
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
            detailUrl={detailSrc}
            role="hero"
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
      <RoundedBox
        castShadow
        args={[size, h, POLAROID_T]}
        radius={0.003}
        smoothness={2}
      >
        <meshStandardMaterial color={palette.paper} roughness={0.85} />
      </RoundedBox>
      {textured && (
        <React.Suspense fallback={null}>
          <LitImage
            url={src}
            role="support"
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
            role="support"
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
        c[0] * height,
        c[1] * height,
        c[2] * height,
        c[3] * height,
        c[4] * height,
        c[5] * height,
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

/** The band that runs across the mark — one soft gaussian stripe on a
 * transparent strip, tiled so sweeping it is a texture OFFSET rather than a
 * moving mesh.
 *
 * Why a second copy of the extruded geometry and not a quad in front of it:
 * the mark is a bitten apple with a detached leaf, so a rectangular highlight
 * standing over it draws a rectangle, which is the exact halo mistake the
 * floor lamp's glow made in v5. Re-using `appleGeometry` masks the sweep to
 * the silhouette for free — and ExtrudeGeometry's default UV generator writes
 * the front cap's UVs as the SHAPE's own x/y, so the texture is already in
 * the mark's own units and one offset unit is one world unit of travel. */
const SHIMMER_PERIOD = 0.34;
let shimmerTextureCache: THREE.CanvasTexture | null = null;
function shimmerTexture(): THREE.CanvasTexture {
  if (shimmerTextureCache) return shimmerTextureCache;
  const w = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = 4;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  // Arriving at both ends with a near-zero derivative, the GlowSprite rule: a
  // band that stops abruptly draws a line, and a line across a polished face
  // is a scratch rather than light.
  for (const [stop, a] of [
    [0, 0],
    [0.34, 0],
    [0.42, 0.35],
    [0.5, 1],
    [0.58, 0.35],
    [0.66, 0],
    [1, 0],
  ] as const) {
    grad.addColorStop(stop, `rgba(255, 252, 244, ${a})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Tilted, because a vertical bar travelling sideways reads as a wipe and a
  // raked one reads as light. The repeat is in SHAPE units (see above): one
  // period is 0.34, a little over twice the mark's own width, so only one
  // band is ever on the face.
  texture.center.set(0.5, 0.5);
  texture.rotation = -0.85;
  texture.repeat.set(1 / SHIMMER_PERIOD, 1 / SHIMMER_PERIOD);
  shimmerTextureCache = texture;
  return texture;
}

/** Seconds for one click sweep, and one complete texture cycle. Texture
 * offsets are applied after repeat in Three's UV transform, so a full sweep
 * is 1.0 here — SHIMMER_PERIOD remains the physical spacing in shape units. */
const SHIMMER_S = 0.85;
const SHIMMER_TRAVEL = 1;

/** One metallic sweep shared by the Apple, AI Collective, and TJ desk marks.
 * All three answer with the same motion curve, environment lift, click sweep,
 * and reduced-motion behavior; only their underlying geometry differs. */
export function useMetalShimmer({
  unitIndex,
  hoverKey,
  idleRoughness,
  idleEnv = 2.2,
}: {
  unitIndex: number;
  hoverKey: string;
  idleRoughness: number;
  idleEnv?: number;
}) {
  const texture = useMemo(() => {
    const t = shimmerTexture().clone();
    t.needsUpdate = true;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const band = useRef<THREE.MeshBasicMaterial>(null);
  const mark = useRef<THREE.MeshStandardMaterial>(null);
  const sweep = useRef(-1);
  const level = useRef(0);
  const still = useMemo(() => reducedMotion(), []);
  usePropClick(unitIndex, hoverKey, () => {
    if (still) return;
    sweep.current = 0;
  });
  useUnitFrame((_, delta) => {
    const hot = propReactionIsEngaged(useStacks.getState(), hoverKey) ? 1 : 0;
    if (Math.abs(level.current - hot) < 1e-3) level.current = hot;
    else level.current = THREE.MathUtils.damp(level.current, hot, 5, delta);
    const v = level.current;
    if (mark.current) {
      mark.current.envMapIntensity = idleEnv + 1.1 * v;
      // Keep the lobe broad enough to hold the warm reflection found by the
      // authored yaw. Tightening it on hover made that light form disappear
      // between samples of the sparse environment map, turning both faces
      // dark exactly when their shimmer affordance began.
      mark.current.roughness = idleRoughness;
    }
    // Strong enough to read on orange as well as silver at the desk marks'
    // ~40px rendered size. Click remains the brighter punctuation below.
    let opacity = 0.58 * v;
    let offset =
      -SHIMMER_TRAVEL / 2 + ((performance.now() / 5200) % 1) * SHIMMER_TRAVEL;
    if (sweep.current >= 0) {
      sweep.current += Math.min(delta, 1 / 30);
      if (sweep.current > SHIMMER_S) sweep.current = -1;
      else {
        const p = sweep.current / SHIMMER_S;
        offset = -SHIMMER_TRAVEL / 2 + p * SHIMMER_TRAVEL;
        opacity = Math.max(opacity, Math.sin(p * Math.PI) * 0.95);
      }
    }
    texture.offset.x = offset;
    if (band.current && band.current.opacity !== opacity) {
      band.current.opacity = opacity;
      band.current.visible = opacity > 0.002;
    }
  });
  return { band, mark, texture };
}

/** The mark standing in a milled billet — a desk object, the kind of thing
 * you leave a job with. Deliberately paperweight-sized: it is a footnote to
 * a line in the placard, not a logo placement.
 *
 * Metal exception, same reason the trophy needed one: the shared prop atlas
 * forces metalness 0, so anything that has to look like metal has to opt out
 * by hand. The billet is bead-blasted (rougher, darker) and the mark is
 * polished, which is what gives the silhouette an edge to read against when
 * the sky behind it goes pale in the light theme.
 *
 * It answers now (owner: "clicking on the apple logo should make it shimmer.
 * also needs a hover"). One mechanism at two intensities: the pointer runs a
 * slow, faint band across the mark and lifts its environment response; a click fires one
 * bright sweep across it. The prop itself never moves — it is square to the
 * plank ON PURPOSE (the mark's face is the one near-mirror in the scene and
 * off-square it swings out of the environment probe's lit half and goes
 * black), so a hover that turned or lifted it would put the thing it is meant
 * to show you into shadow. */
export function DeskApple({
  palette,
  unitIndex,
}: {
  palette: Palette;
  unitIndex: number;
}) {
  const HOVER = "shimmer:apple";
  const setHovered = useStacks((s) => s.setHovered);
  const { band, mark, texture } = useMetalShimmer({
    unitIndex,
    hoverKey: HOVER,
    idleRoughness: 0.4,
  });
  return (
    <group
      rotation={[0, 0.04, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(HOVER);
      }}
      onPointerOut={() => {
        if (useStacks.getState().hovered === HOVER) setHovered(null);
      }}
    >
      {/* Bead-blasted, and a full stop darker than the mark. Polished it blew
          out under the lamp into a white bar that read as a strip of card
          rather than a block, and the drop in value is also what keeps the
          mark's lower half legible against its own stand. */}
      <RoundedBox
        castShadow
        args={[ABOUT_APPLE_BASE_WIDTH, 0.021, 0.054]}
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
      <mesh
        castShadow
        geometry={appleGeometry(ABOUT_APPLE_MARK_HEIGHT, 0.015)}
        position={[0, 0.017, 0]}
      >
        <meshStandardMaterial
          ref={mark}
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
      {/* The sweep, on its own copy of the silhouette 0.2mm proud. Additive
          and depth-tested against the mark it sits on, so it can only ever
          brighten metal and never paints a shape onto the sky behind it —
          the halo mistake, re-learned once already on the floor lamp. */}
      <mesh
        geometry={appleGeometry(ABOUT_APPLE_MARK_HEIGHT, 0.015)}
        position={[0, 0.017, 0.0002]}
        scale={[1.002, 1.002, 1.06]}
        renderOrder={2}
      >
        <meshBasicMaterial
          ref={band}
          map={texture}
          transparent
          opacity={0}
          visible={false}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
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

/** A clipboard's board, in world units: 0.30 × 0.42 × 0.014. A real A5
 * clipboard is 0.16 × 0.23 m, which at the shelf family's 2.00 units per metre
 * is 0.32 × 0.46 — this is that, a hair under, so it stays clear of the top
 * plank's neighbours. Exported because the seat below is derived from it. */
const CLIPBOARD = { w: 0.3, h: 0.42, t: 0.014 } as const;

/** The mount y at which a leaning clipboard rests on the plank, derived from
 * its own box and its own tilt exactly as `polaroidSeat` is. The board is
 * anchored at its bottom-back edge, so this is not `h/2·cos θ` — a bare
 * literal here is the single most-regrown bug in this scene. */
export const routineBoardSeat = (rotation: [number, number, number]) =>
  seat(rotation, CLIPBOARD);

/** The checklist printed on the sheet. Deliberately unreadable: the same
 * "title marks" idiom the book spines use, because at the ~40 px this
 * subtends real words would be a smear and fake words would be a lie. What
 * has to READ is the shape — boxes down the left margin, three of them
 * struck through — and that reads at any size. */
const routineSheetCache = new Map<string, THREE.CanvasTexture>();
function routineSheetTexture(ink: string): THREE.CanvasTexture {
  const hit = routineSheetCache.get(ink);
  if (hit) return hit;
  const w = 256;
  const h = 358;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#f7f2e6";
  ctx.fillRect(0, 0, w, h);
  // A ruled margin, which is what makes a blank sheet read as a FORM.
  ctx.strokeStyle = "rgba(150, 130, 100, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(46, 24);
  ctx.lineTo(46, h - 20);
  ctx.stroke();
  const rows = 7;
  for (let i = 0; i < rows; i++) {
    const y = 52 + i * 42;
    const done = i < 3;
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = 3;
    ctx.strokeRect(16, y - 11, 22, 22);
    if (done) {
      // A tick, drawn as a tick — two strokes, because a filled box reads as
      // a black square and a black square is not a checked box.
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(19, y);
      ctx.lineTo(26, y + 8);
      ctx.lineTo(37, y - 9);
      ctx.stroke();
    }
    ctx.globalAlpha = done ? 0.3 : 0.55;
    ctx.fillStyle = ink;
    ctx.fillRect(60, y - 5, 60 + rand(i, 91) * 130, 7);
    if (done) {
      ctx.globalAlpha = 0.45;
      ctx.fillRect(58, y - 2, 66 + rand(i, 91) * 130, 2);
    }
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  routineSheetCache.set(ink, texture);
  return texture;
}

/**
 * The daily checklist on a clipboard, standing up — the door to /routine.
 *
 * It replaces `InboxTray` (owner, of the tray: "wtf is this? Replace it with
 * something better"). The tray was not badly built; it was badly ORIENTED. A
 * letter tray is a shallow horizontal box and its contents are flat sheets, so
 * at this camera — which sits 2.24° above the shelf line — everything that
 * identified it was seen within a couple of degrees of edge-on. What arrived
 * was a cream box with dark diagonal slabs in it, which is not a reading of a
 * tray, it is the absence of one. The same geometry made the old ContactPools
 * invisible and put the conference badge on its edge instead of on its face.
 *
 * So the replacement is chosen by that rule rather than by taste: **anything
 * on this shelf that carries meaning has to stand up.** A clipboard is a
 * vertical plane by construction, and the one mark it carries — a column of
 * boxes with the first three ticked — survives being 40 px tall, which no
 * arrangement of loose sheets does. It is also the more honest object for
 * where it hangs: this prop is the link to /routine, and a checklist IS the
 * routine, where a tray of paper was a metaphor for one.
 *
 * No GLB. `scripts/stacks-models.mjs` has 26 downloaded props and the pipeline
 * research (memory: stacks-glb-props) records that CreativeTrio's CC0 set has
 * no clipboard, notebook, planner or desk tray of any kind — "no CC0 notebook"
 * is one of its durable negative results. Four boxes and a canvas is cheaper
 * than the wrong model.
 */
export function RoutineBoard({ palette }: { palette: Palette }) {
  const sheet = useMemo(() => routineSheetTexture(palette.ink), [palette.ink]);
  return (
    // Anchored at the bottom-BACK edge, like a leaning print: the caller mounts
    // it with routineBoardSeat() and it stands on the wood at any tilt.
    <group position={[0, CLIPBOARD.h / 2, CLIPBOARD.t / 2]}>
      <RoundedBox
        castShadow
        args={[CLIPBOARD.w, CLIPBOARD.h, CLIPBOARD.t]}
        radius={0.006}
        smoothness={4}
      >
        <meshStandardMaterial color={palette.woodDark} roughness={0.72} />
      </RoundedBox>
      {/* The sheet, inset so a rim of board shows on all four sides — that
          border is most of what says "clipboard" rather than "picture". */}
      <mesh position={[0, -0.012, CLIPBOARD.t / 2 + 0.0015]}>
        <planeGeometry args={[CLIPBOARD.w - 0.036, CLIPBOARD.h - 0.062]} />
        <meshStandardMaterial map={sheet} roughness={0.94} />
      </mesh>
      {/* The clip. Metal exception, the DeskApple/trophy rule: the shared prop
          atlas forces metalness 0, and a clipboard with a matte clip is a
          rectangle with a smaller rectangle on it. */}
      <RoundedBox
        castShadow
        args={[0.126, 0.038, 0.026]}
        radius={0.006}
        smoothness={3}
        position={[0, CLIPBOARD.h / 2 - 0.03, CLIPBOARD.t / 2 - 0.002]}
      >
        <meshStandardMaterial
          color={palette.metal}
          metalness={0.65}
          roughness={0.34}
          envMapIntensity={1.6}
        />
      </RoundedBox>
      {/* The roll bar across the clip's face. Laid along X — a cylinder is
          Y-up by default, and left unrotated it stands the bar on end, which
          is a rivet rather than a spring. */}
      <mesh
        position={[0, CLIPBOARD.h / 2 - 0.03, CLIPBOARD.t / 2 + 0.012]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry args={[0.007, 0.007, 0.104, 8]} />
        <meshStandardMaterial
          color={palette.metal}
          metalness={0.65}
          roughness={0.3}
        />
      </mesh>
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
   * blog as a whole. */
  linkUnit?: number;
}) {
  const setHovered = useStacks((s) => s.setHovered);
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
        const x =
          i * 0.105 - (count * 0.105) / 2 + (i === count - 1 ? 0.015 : 0);
        const spine = (
          <RoundedBox
            castShadow
            args={[0.062, 0.52, 0.34]}
            radius={0.008}
            smoothness={4}
            rotation={[0, 0, lean]}
            onPointerOver={
              key
                ? (e) => {
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
              linkUnit === undefined && key && onNotebookClick
                ? (e) => {
                    if ((e.delta ?? 0) > 6) return; // swipe, not a tap
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
        if (linkUnit !== undefined) {
          return (
            <Grabbable
              key={i}
              unitIndex={linkUnit}
              hoverKey={
                key ? `notebook:${key}` : `grab:notebook:${linkUnit}:${i}`
              }
              base={[x, 0.257, 0]}
              shadeColor={palette.shadow}
              shadeWidth={0.14}
              shape="box"
              massKg={0.45}
              onTap={key ? () => onNotebookClick?.(key) : undefined}
              href={key}
              doorLabel={key ? "Read this musing" : undefined}
              to={key ? undefined : "blog"}
              external
            >
              {spine}
            </Grabbable>
          );
        }
        // Only clickable preview spines pay for a useFrame slot. 0.257 = lean-
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
        return (
          <group key={i} position={[x, 0.257, 0]}>
            {spine}
          </group>
        );
      })}
    </group>
  );
}

const MUSINGS_PDF_PAGE_URLS = [5, 4, 3, 2, 1].map(
  (page) => `/images/stacks/musings/gpt3-2021-page-${page}.webp?v=2`,
);

/** Five real pages from Chappy's 2021 GPT-3 paper plus a dimensioned pen.
 * `linkUnit` makes the paper a door to Musings; the pen remains its own prop. */
export function PaperStack({
  palette,
  linkUnit,
}: {
  palette: Palette;
  linkUnit?: number;
}) {
  const pageTextures = useTexture(MUSINGS_PDF_PAGE_URLS);
  useEffect(() => {
    for (const texture of pageTextures) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      // The sheet lies landscape on the shelf. Rotate the portrait PDF page
      // in UV space so its 11:8.5 aspect matches the paper instead of being
      // stretched sideways into an almost blank-looking wash.
      texture.center.set(0.5, 0.5);
      texture.rotation = -Math.PI / 2;
      texture.needsUpdate = true;
    }
  }, [pageTextures]);

  // US Letter is 8.5 x 11 inches. At the shelf family's 2.00 units per metre
  // that is 0.432 x 0.559 units. The old 0.016-unit slabs were 8 mm thick at
  // this scale, closer to foam board than paper. These 0.0022-unit sheets are
  // still exaggerated enough to survive antialiasing, but read as paper.
  const paperWidth = MUSINGS_PAPER_STACK.width;
  const paperDepth = MUSINGS_PAPER_STACK.depth;
  const paperThickness = MUSINGS_PAPER_STACK.sheetThickness;
  const sheetStep = MUSINGS_PAPER_STACK.sheetStep;
  const sheets = pageTextures.map((texture, i) => {
    const y = paperThickness / 2 + i * sheetStep;
    const x = i * 0.006 - 0.012;
    const z = i * -0.004 + 0.008;
    const rotation = rand(i, 61) * 0.14 - 0.07;
    return (
      <group
        key={MUSINGS_PDF_PAGE_URLS[i]}
        position={[x, y, z]}
        rotation={[0, rotation, 0]}
      >
        <RoundedBox
          castShadow
          args={[paperWidth, paperThickness, paperDepth]}
          radius={0.0012}
          smoothness={3}
        >
          <meshStandardMaterial color={palette.paper} roughness={0.96} />
        </RoundedBox>
        <mesh
          position={[0, paperThickness / 2 + 0.0012, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <planeGeometry args={[paperWidth - 0.012, paperDepth - 0.012]} />
          <meshStandardMaterial
            map={texture}
            roughness={0.92}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-4}
            polygonOffsetUnits={-4}
          />
        </mesh>
      </group>
    );
  });
  const penBase: [number, number, number] = [
    0.105,
    paperThickness + sheetStep * 4 + 0.009,
    0.095,
  ];
  const pen = (
    <group key="pen" rotation={[0, -0.58, 0]}>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.0085, 0.0085, 0.272, 16]} />
        <meshStandardMaterial
          color="#25272b"
          roughness={0.36}
          metalness={0.22}
        />
      </mesh>
      <mesh position={[0.144, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.0085, 0.028, 16]} />
        <meshStandardMaterial
          color={palette.metal}
          roughness={0.3}
          metalness={0.78}
        />
      </mesh>
      <mesh position={[0.13, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.009, 0.009, 0.012, 16]} />
        <meshStandardMaterial
          color={palette.metal}
          roughness={0.28}
          metalness={0.74}
        />
      </mesh>
      <mesh position={[-0.144, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.0092, 0.0092, 0.016, 16]} />
        <meshStandardMaterial
          color="#17191c"
          roughness={0.4}
          metalness={0.18}
        />
      </mesh>
      <RoundedBox
        args={[0.082, 0.0035, 0.005]}
        radius={0.0015}
        smoothness={3}
        position={[-0.074, 0.009, -0.001]}
      >
        <meshStandardMaterial
          color={palette.metal}
          roughness={0.32}
          metalness={0.72}
        />
      </RoundedBox>
    </group>
  );
  return (
    <group>
      {linkUnit === undefined ? (
        <>
          {sheets}
          <group position={penBase}>{pen}</group>
        </>
      ) : (
        <>
          <Grabbable
            unitIndex={linkUnit}
            to="blog"
            hoverKey={`grab:paper:${linkUnit}`}
            base={[0, 0, 0]}
            shadeColor={palette.shadow}
            shadeWidth={0.55}
            shape="box"
            massKg={0.024}
            tiltWhileHeld={false}
            heldFacingRotation={[Math.PI / 2, 0, 0]}
            heldMinRaise={MUSINGS_PAPER_STACK.heldClearance}
          >
            {/* The five visible sheets are thinner than the solver's 8 mm
                scene-unit minimum. This broad, low backing gives them one
                honest hull instead of borrowing the pen's geometry. */}
            <mesh
              name="physics:musings-paper-stack"
              position={[0, MUSINGS_PAPER_STACK.colliderCenterY, 0]}
            >
              <boxGeometry
                args={[
                  MUSINGS_PAPER_STACK.colliderWidth,
                  MUSINGS_PAPER_STACK.colliderHeight,
                  MUSINGS_PAPER_STACK.colliderDepth,
                ]}
              />
              <meshBasicMaterial
                transparent
                opacity={0}
                depthWrite={false}
                colorWrite={false}
              />
            </mesh>
            {sheets}
          </Grabbable>
          <Grabbable
            unitIndex={linkUnit}
            hoverKey={`grab:pen:${linkUnit}`}
            base={penBase}
            shadeColor={palette.shadow}
            shadeWidth={0.24}
            shape="box"
            massKg={0.012}
          >
            {pen}
          </Grabbable>
        </>
      )}
    </group>
  );
}

for (const url of MUSINGS_PDF_PAGE_URLS) useTexture.preload(url);

/**
 * A drinks can, at the room's real scale, in whatever colour the shelf wants.
 *
 * The owner picked the model and asked "can we do a few diff colors?", so this
 * exists to keep the SIZE in one place while the colour varies: three cans in
 * three units diverging on scale would read as three different objects.
 *
 * soda-can.glb is 10.0583 tall by 6.1135 across, a ratio of 1.645 against a
 * real 330 ml can's 115 / 66 = 1.742 — close enough that no correction is
 * worth the distortion. At the shelves' 2.00 world units per metre a 115 mm can
 * is 0.230 world, so the scale is 0.230 / 10.0583 = 0.02287 and it lands
 * 0.140 across against a real 0.132.
 *
 * `F44336` is the body — the ONE colour slot. The base ring (78909C) and the
 * tab (FFFFFF) are deliberately left alone: tint those and the can stops being
 * aluminium and becomes a painted cylinder.
 */
export const SODA_CAN_SCALE = 0.02287;

export type SodaBrand = "diet-dr-pepper" | "sunkist-zero" | "mtn-dew-zero";

const SODA_BRAND_COLORS: Record<SodaBrand, { body: string; ring: string }> = {
  "diet-dr-pepper": { body: "#111315", ring: "#a91524" },
  "sunkist-zero": { body: "#f5f1e8", ring: "#ef741d" },
  "mtn-dew-zero": { body: "#101512", ring: "#6fbe44" },
};

const canLabelCache = new Map<SodaBrand, THREE.CanvasTexture>();

/** Original low-poly label art: recognizable product colour/word-shape cues,
 * never copied packaging artwork. Drawn twice around the circumference so a
 * can remains identifiable after a visitor rotates or throws it. */
function canLabelTexture(brand: SodaBrand): THREE.CanvasTexture {
  const cached = canLabelCache.get(brand);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  const drawDietPepper = (x: number) => {
    ctx.fillStyle = "#111315";
    ctx.fillRect(x, 0, 256, 256);
    ctx.save();
    ctx.translate(x + 128, 132);
    ctx.rotate(-0.14);
    ctx.fillStyle = "#b21d2e";
    ctx.beginPath();
    ctx.ellipse(0, 0, 92, 62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#dc5260";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
    ctx.textAlign = "center";
    ctx.fillStyle = "#f4eee7";
    ctx.font = "700 31px Arial, sans-serif";
    ctx.fillText("DIET", x + 128, 72);
    ctx.font = "italic 800 38px Georgia, serif";
    ctx.fillText("Dr Pepper", x + 128, 144);
    ctx.font = "700 15px Arial, sans-serif";
    ctx.fillText("ZERO SUGAR", x + 128, 187);
  };
  const drawSunkist = (x: number) => {
    ctx.fillStyle = "#f6f1e7";
    ctx.fillRect(x, 0, 256, 256);
    ctx.save();
    ctx.translate(x + 128, 112);
    ctx.fillStyle = "#f27a1b";
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.fillRect(-4, -102, 8, 44);
    }
    ctx.beginPath();
    ctx.arc(0, 0, 73, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.textAlign = "center";
    ctx.fillStyle = "#153f70";
    ctx.font = "italic 900 39px Arial, sans-serif";
    ctx.fillText("SUNKIST", x + 128, 124);
    ctx.fillStyle = "#1f4367";
    ctx.font = "800 19px Arial, sans-serif";
    ctx.fillText("ZERO SUGAR", x + 128, 185);
    ctx.fillStyle = "#ef741d";
    ctx.font = "700 14px Arial, sans-serif";
    ctx.fillText("ORANGE", x + 128, 211);
  };
  const drawDew = (x: number) => {
    ctx.fillStyle = "#101512";
    ctx.fillRect(x, 0, 256, 256);
    ctx.fillStyle = "#66bd3d";
    ctx.beginPath();
    ctx.moveTo(x + 24, 152);
    ctx.lineTo(x + 69, 62);
    ctx.lineTo(x + 226, 91);
    ctx.lineTo(x + 181, 190);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#b6da63";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.save();
    ctx.translate(x + 127, 128);
    ctx.rotate(-0.12);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f4f1e9";
    ctx.font = "900 26px Arial, sans-serif";
    ctx.fillText("MTN", -45, -2);
    ctx.fillStyle = "#173b22";
    ctx.font = "italic 900 43px Arial, sans-serif";
    ctx.fillText("DEW", 37, 18);
    ctx.fillStyle = "#d82732";
    ctx.font = "900 17px Arial, sans-serif";
    ctx.fillText("ZERO", 1, 56);
    ctx.restore();
  };

  for (const x of [0, 256]) {
    if (brand === "diet-dr-pepper") drawDietPepper(x);
    else if (brand === "sunkist-zero") drawSunkist(x);
    else drawDew(x);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  canLabelCache.set(brand, texture);
  return texture;
}

export function SodaCan({
  dark,
  body,
  accent,
  brand,
  rotation = [0, 0, 0],
}: {
  dark: boolean;
  /** The body colour, one per shelf. Palette-derived, never the stock red. */
  body?: string;
  /** Colour of the lower ring, used to compose the owner's three two-tone
   * favourites as one intentional trio instead of scattered single cans. */
  accent?: string;
  brand?: SodaBrand;
  rotation?: [number, number, number];
}) {
  const brandColors = brand ? SODA_BRAND_COLORS[brand] : null;
  const label = useMemo(() => (brand ? canLabelTexture(brand) : null), [brand]);
  return (
    <group rotation={rotation}>
      <React.Suspense fallback={null}>
        <ModelProp
          url="/models/soda-can.glb"
          dark={dark}
          variant="tinted"
          tints={{
            F44336: body ?? brandColors?.body ?? "#171717",
            ...((accent ?? brandColors?.ring)
              ? { "78909C": accent ?? brandColors!.ring }
              : {}),
          }}
          scale={SODA_CAN_SCALE}
        />
      </React.Suspense>
      {label && (
        <mesh castShadow position={[0, 0.115, 0]} rotation={[0, Math.PI, 0]}>
          <cylinderGeometry args={[0.0715, 0.0715, 0.172, 24, 1, true]} />
          <meshStandardMaterial
            map={label}
            roughness={0.58}
            metalness={0.12}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
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
export type ClockFaceStyle = "alarm" | "grandfather";

export function ClockFace({
  radius = 0.082,
  sweepRef,
  faceStyle = "alarm",
}: {
  radius?: number;
  sweepRef?: { current: ClockSweep | null };
  faceStyle?: ClockFaceStyle;
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
      const oldCase = faceStyle === "grandfather";
      ctx.fillStyle = oldCase ? "#f4e5bf" : "#f6efdf";
      ctx.beginPath();
      ctx.arc(c, c, c, 0, Math.PI * 2);
      ctx.fill();
      if (oldCase) {
        ctx.strokeStyle = "#a57d37";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(c, c, c * 0.91, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#d0ae66";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c, c, c * 0.82, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = oldCase ? "#5a452d" : "#6e5d49";
      ctx.lineWidth = 6;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = i % 3 === 0 ? 0.78 : 0.86;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * c * r0, c + Math.sin(a) * c * r0);
        ctx.lineTo(c + Math.cos(a) * c * 0.92, c + Math.sin(a) * c * 0.92);
        ctx.stroke();
      }
      if (oldCase) {
        ctx.fillStyle = "#5a452d";
        ctx.font = "600 25px Georgia, serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const [label, x, y] of [
          ["XII", c, c * 0.22],
          ["III", c * 1.77, c],
          ["VI", c, c * 1.78],
          ["IX", c * 0.23, c],
        ] as const)
          ctx.fillText(label, x, y);
      }
      ctx.strokeStyle = oldCase ? "#2f2922" : "#443a2d";
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
      ctx.fillStyle = oldCase ? "#a57d37" : "#443a2d";
      ctx.beginPath();
      ctx.arc(c, c, 10, 0, Math.PI * 2);
      ctx.fill();
    };
    const live = liveTurns();
    draw(live.h, live.m);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return { draw, texture, mounted: { h: live.h, m: live.m } };
  }, [faceStyle]);
  useEffect(() => () => face.texture.dispose(), [face]);
  const last = useRef(face.mounted);
  const lastLiveDraw = useRef(performance.now());
  useUnitFrame(() => {
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
