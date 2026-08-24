"use client";

// A seven-day pill case for the Systems shelf — the set from the supplements
// print (systems-supplements-v8) made physical, two smoke-black and two
// frosted-white. No GLB: CreativeTrio's CC0 set has nothing shaped like this,
// and a moulded tray is a handful of boxes.
//
// Solid, and everything that identifies it is geometry.
//
// Two things were tried here and cut, both worth not re-inventing. Making the
// body translucent with pills inside it did read as plastic, and it cost a
// per-case instanced mesh and a scatter to do it — the owner's call was that
// the case does not need to be see-through (2026-08-23). Before that, the
// contents and the compartment seams were PAINTED — a canvas scatter of
// capsule shapes and ruled strokes on the front face — and that failed for a
// different and more general reason: a texture on a box wraps every face, so
// the capsules printed across the front wall and the lid tops and floated
// over the day letters. Decals read as decals the moment anyone looks
// closely.
//
// So the seams are ribs, the lids are seven separate tiles, and the only
// texture left is the day lettering, which on a real case genuinely is
// printed flat on the lid.
import { RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

import {
  PILL_CASE_FILL_H as COLLAR_H,
  PILL_CASE_LID_H as LID_H,
  PILL_ORGANIZER,
  PILL_CASE_TRAY_H as TRAY_H,
  type PillOrganizerVariant,
} from "./systemsPillLayout";

const LID_INSET = 0.005;
/** Barely a seam. A real case's lids are moulded almost edge to edge. */
const LID_GAP = 0.0015;

const CELL_W = (PILL_ORGANIZER.length - LID_INSET * 2) / 7;
/** The whole moulded body below the lids: tray plus the collar the lids
 * close onto. Summed from the real case's height rather than restated. */
const BODY_H = TRAY_H + COLLAR_H;
/** Six ribs, one between each pair of the seven compartments. */
const RIBS = [1, 2, 3, 4, 5, 6];

/** The photo's own lettering: Sunday through Saturday, two-letter forms
 * where one letter would collide with another day's. */
const DAYS = ["Su", "M", "T", "W", "Th", "F", "S"] as const;

const VARIANTS: Record<
  PillOrganizerVariant,
  { shell: string; lid: string; rib: string; ink: string; roughness: number }
> = {
  // Smoke polycarbonate: near-black with a little blue.
  //
  // Darker than a colour picker would say, because this case has to read
  // black in two very different lights. The back pair stands in the plank's
  // shadow; the front pair sits in the desk lamp's throw, and the lamp aims
  // straight down the row. At a mid grey the lit case came out pale tan and
  // the set stopped reading as two dark and two light.
  smoke: {
    shell: "#22262c",
    lid: "#333941",
    rib: "#3d444d",
    ink: "#eef2f8",
    roughness: 0.4,
  },
  // The frosted case prints warm off-white rather than pure white — pure
  // white on this shelf reads a stop brighter than the room, the bag-tint
  // lesson — with the letters in the room's ink grey.
  white: {
    shell: "#ded8cc",
    lid: "#ece7dc",
    rib: "#c4bcac",
    ink: "#3f3f3b",
    roughness: 0.44,
  },
};

/** The day letters, and the one thing here that is legitimately a texture: on
 * a real case they are printed on the lid, flat and with no volume. */
const letterCache = new Map<PillOrganizerVariant, THREE.CanvasTexture>();
function dayLetterTexture(variant: PillOrganizerVariant): THREE.CanvasTexture {
  const hit = letterCache.get(variant);
  if (hit) return hit;
  const w = 896;
  const h = 152;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = VARIANTS[variant].ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 66px 'Helvetica Neue', Arial, sans-serif";
  DAYS.forEach((day, i) => {
    ctx.fillText(day, ((i + 0.5) / 7) * w, h / 2 + 2);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  letterCache.set(variant, texture);
  return texture;
}

export default function PillOrganizer({
  variant,
  yaw = 0,
}: {
  variant: PillOrganizerVariant;
  /** Turn for a loose diagonal on the plank, like the bag and bottle rows. */
  yaw?: number;
}) {
  const tone = VARIANTS[variant];
  const letters = useMemo(() => dayLetterTexture(variant), [variant]);
  const { length, depth } = PILL_ORGANIZER;
  return (
    <group rotation={[0, yaw, 0]}>
      <RoundedBox
        castShadow
        args={[length, BODY_H, depth]}
        radius={0.005}
        smoothness={3}
        position={[0, BODY_H / 2, 0]}
      >
        <meshStandardMaterial
          color={tone.shell}
          roughness={tone.roughness}
          metalness={0}
        />
      </RoundedBox>
      {/* The compartment seams, standing proud of the front face. Geometry
          and not a drawn line, for the reason at the top of this file — and
          because a moulded rib survives the grazing angle this camera reads
          the plank at, where a painted one would flatten out. Without them
          the case is a featureless bar. */}
      {RIBS.map((i) => (
        <mesh
          key={i}
          position={[
            -length / 2 + LID_INSET + CELL_W * i,
            BODY_H * 0.52,
            depth / 2 - 0.0015,
          ]}
        >
          <boxGeometry args={[0.0035, BODY_H * 0.78, 0.004]} />
          <meshStandardMaterial
            color={tone.rib}
            roughness={tone.roughness}
            metalness={0}
          />
        </mesh>
      ))}
      {/* Seven lids, as seven tiles. A painted strip would vanish at this
          camera's grazing angle where real gaps keep reading — the InboxTray
          lesson, at prop scale. */}
      {DAYS.map((day, i) => (
        <RoundedBox
          key={day}
          castShadow
          args={[CELL_W - LID_GAP, LID_H, depth - 0.01]}
          radius={0.0018}
          smoothness={2}
          position={[
            -length / 2 + LID_INSET + CELL_W * (i + 0.5),
            BODY_H + LID_H / 2,
            0,
          ]}
        >
          <meshStandardMaterial
            color={tone.lid}
            roughness={tone.roughness}
            metalness={0}
          />
        </RoundedBox>
      ))}
      {/* The hinge rail the seven lids share, along the back top edge. */}
      <mesh position={[0, BODY_H + LID_H * 0.6, -depth / 2 + 0.005]}>
        <boxGeometry args={[length - 0.006, LID_H * 1.2, 0.009]} />
        <meshStandardMaterial
          color={tone.shell}
          roughness={tone.roughness}
          metalness={0}
        />
      </mesh>
      <mesh
        position={[0, BODY_H + LID_H + 0.0006, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[CELL_W * 7, depth - 0.016]} />
        <meshStandardMaterial
          map={letters}
          transparent
          depthWrite={false}
          roughness={0.6}
          metalness={0}
        />
      </mesh>
    </group>
  );
}
