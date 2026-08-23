"use client";

// A shallow round tray of sand for the lighthouse to stand in. Three tries
// at "something resembling sand" on 2026-08-22 ended here: a tray first, then
// loose sand (strewn grains broke physics, strewn decals read as paint), and
// the owner asked for the tray back. Sand reads as sand when it has an edge:
// a weathered-oak ring, a polar grid of sand inside it that rises toward the
// tower and ripples a little, and a fine speckle grain drawn once onto a
// canvas and shared as colour and bump. The tray, sand, and tower live inside
// one Grabbable carrier. Their meshes therefore contribute to one rigid body
// and travel together instead of leaving scenery behind when the lighthouse
// is picked up.
import { rand } from "../../theme";
import { WoodMaterial } from "../primitives";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { MUSINGS_OAK } from "./VineyardCutout";

/** Shared with the lighthouse pose: the tower stands on the sand's crown. */
export const MUSINGS_SAND_TRAY = {
  /** Outer radius of the rim; the rim is 12 mm thick. The lower-shelf row
   * (`MUSINGS_LOWER_LAYOUT`) is packed around this as the lighthouse's
   * footprint: at `lighthouseX` 1.174 the rim stops 2 cm short of the
   * plank's end and clears the island cutout's foot corner. */
  radius: 0.125,
  rimHeight: 0.03,
  /** Solid wooden floor, visible whenever the tray leaves the shelf. */
  baseThickness: 0.008,
  /** Sand height at the rim, and how much higher it piles at the tower. */
  sandEdge: 0.018,
  mound: 0.01,
  /** The tower's foot radius (54.4 source units at 0.0016) and the width of
   * the slope piled against it. */
  footRadius: 0.087,
  slope: 0.026,
} as const;

/** Where the tower's base sits: on the crown of the mound, sunk a touch so
 * the sand meets the brick rather than ending at it. */
export const MUSINGS_SAND_TRAY_TOP =
  MUSINGS_SAND_TRAY.sandEdge + MUSINGS_SAND_TRAY.mound - 0.002;

const SAND_HEX = { light: "#d8c4a0", dark: "#8c7d63" } as const;
const RIM_THICKNESS = 0.012;

const sandTextureCache = new Map<string, THREE.CanvasTexture>();
/** Dry-sand speckle: a base tone with thousands of one-pixel grains a little
 * lighter and darker than it, and a few dozen two-pixel pebbles. Doubles as
 * the bump. Cached per hex; theme flips switch entries. */
function sandTexture(hex: string): THREE.CanvasTexture {
  const hit = sandTextureCache.get(hex);
  if (hit) return hit;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 7000; i++) {
    const x = Math.floor(rand(i, 401) * size);
    const y = Math.floor(rand(i, 402) * size);
    const dark = rand(i, 403) > 0.5;
    ctx.fillStyle = dark
      ? `rgba(40, 30, 20, ${0.05 + rand(i, 404) * 0.14})`
      : `rgba(255, 246, 226, ${0.06 + rand(i, 405) * 0.16})`;
    ctx.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 48; i++) {
    const x = Math.floor(rand(i, 406) * size);
    const y = Math.floor(rand(i, 407) * size);
    ctx.fillStyle = `rgba(60, 45, 30, ${0.12 + rand(i, 408) * 0.14})`;
    ctx.fillRect(x, y, 2, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  sandTextureCache.set(hex, texture);
  return texture;
}

/** Polar grid of sand: flat at the rim, rising in a rounded slope against
 * the tower's foot, with a little ripple so it is not a lathe surface. */
function sandGeometry(): THREE.BufferGeometry {
  const { radius, sandEdge, mound, footRadius, slope } = MUSINGS_SAND_TRAY;
  const inner = radius - RIM_THICKNESS + 0.002; // tuck under the rim
  const rings = 16;
  const segments = 48;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const height = (r: number, theta: number) => {
    const t = Math.max(0, Math.min(1, (r - footRadius) / slope));
    const pile = mound * (1 - t) * (1 - t);
    const ripple =
      0.0012 * Math.sin(theta * 7 + r * 90) * Math.sin(r * 140 + theta * 3);
    return sandEdge + pile + ripple;
  };
  positions.push(0, height(0, 0), 0);
  uvs.push(0.5, 0.5);
  for (let ring = 1; ring <= rings; ring++) {
    const r = (inner * ring) / rings;
    for (let seg = 0; seg < segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      positions.push(x, height(r, theta), z);
      uvs.push(0.5 + x / (2 * inner), 0.5 + z / (2 * inner));
    }
  }
  const at = (ring: number, seg: number) =>
    ring === 0 ? 0 : 1 + (ring - 1) * segments + (seg % segments);
  for (let seg = 0; seg < segments; seg++)
    indices.push(at(0, 0), at(1, seg + 1), at(1, seg));
  for (let ring = 1; ring < rings; ring++)
    for (let seg = 0; seg < segments; seg++) {
      const a = at(ring, seg);
      const b = at(ring, seg + 1);
      const c = at(ring + 1, seg);
      const d = at(ring + 1, seg + 1);
      indices.push(a, d, c, a, b, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function rimGeometry(): THREE.ExtrudeGeometry {
  const { radius, rimHeight } = MUSINGS_SAND_TRAY;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius - RIM_THICKNESS, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: rimHeight,
    bevelEnabled: true,
    bevelThickness: 0.002,
    bevelSize: 0.002,
    bevelSegments: 1,
    curveSegments: 48,
  });
  // Extrude runs along +z; stand it up and put its foot on the wood.
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox!.min.y, 0);
  return geometry;
}

/** The carrier owns pointer interaction; its child surfaces still participate
 * in collider extraction even though they do not raycast independently. */
const noRaycast = () => null;

export function SandTray({
  dark,
  position,
}: {
  dark: boolean;
  position: readonly [number, number, number];
}) {
  const theme = dark ? "dark" : "light";
  const sand = useMemo(() => sandGeometry(), []);
  const rim = useMemo(() => rimGeometry(), []);
  useEffect(
    () => () => {
      sand.dispose();
      rim.dispose();
    },
    [sand, rim],
  );
  const grain = useMemo(() => {
    const texture = sandTexture(SAND_HEX[theme]).clone();
    texture.repeat.set(3, 3);
    texture.needsUpdate = true;
    return texture;
  }, [theme]);
  useEffect(() => () => grain.dispose(), [grain]);
  return (
    <group position={[position[0], position[1], position[2]]}>
      <mesh
        position={[0, MUSINGS_SAND_TRAY.baseThickness / 2, 0]}
        raycast={noRaycast}
      >
        <cylinderGeometry
          args={[
            MUSINGS_SAND_TRAY.radius - RIM_THICKNESS,
            MUSINGS_SAND_TRAY.radius - RIM_THICKNESS,
            MUSINGS_SAND_TRAY.baseThickness,
            48,
          ]}
        />
        <WoodMaterial
          hex={MUSINGS_OAK[theme].foot}
          repeat={[2, 2]}
          roughness={0.84}
        />
      </mesh>
      <mesh geometry={rim} raycast={noRaycast}>
        <WoodMaterial
          hex={MUSINGS_OAK[theme].foot}
          repeat={[2, 0.4]}
          roughness={0.82}
        />
      </mesh>
      {/* ExtrudeGeometry compresses the annulus sidewall UVs. Give the visible
          outside face its own cylindrical UV strip so the grain wraps around
          the rim instead of reading as a flat brown band. */}
      <mesh
        position={[0, MUSINGS_SAND_TRAY.rimHeight / 2, 0]}
        raycast={noRaycast}
      >
        <cylinderGeometry
          args={[
            MUSINGS_SAND_TRAY.radius + 0.0007,
            MUSINGS_SAND_TRAY.radius + 0.0007,
            MUSINGS_SAND_TRAY.rimHeight,
            48,
            1,
            true,
          ]}
        />
        <WoodMaterial
          hex={MUSINGS_OAK[theme].foot}
          repeat={[3.5, 0.65]}
          roughness={0.82}
        />
      </mesh>
      <mesh geometry={sand} raycast={noRaycast}>
        <meshStandardMaterial
          map={grain}
          bumpMap={grain}
          bumpScale={0.0015}
          roughness={1}
          metalness={0}
        />
      </mesh>
    </group>
  );
}
