"use client";

// GLB prop loader for the curated CC0 set (see scripts/stacks-models.mjs).
// Three variants:
// - "atlas": CreativeTrio props ship stripped of their shared 128×128
//   palette atlas; ONE themed MeshStandardMaterial per theme (map =
//   /models/atlas-{theme}.png) is shared across every atlas prop, so the
//   whole set recolors with a ~0.8KB texture swap. Never tint atlas props
//   via material.color — it tints clock faces and pages too.
// - "recolor": the houseplants, stripped the same way but pointed at the
//   tiny-treats pair — a second shared atlas, otherwise identical.
// - "tinted": untextured props (Quaternius open book, the golf club) keep
//   their own materials; `tints` remaps colors by material name. Props with
//   a private texture (basketball) use "tinted" with `tintAll` to mute the
//   stock hue toward the palette.
// Every material is forced to metalness 0 / roughness ~0.7 — CreativeTrio
// ships 0.4/0.272, which reads as tinted chrome under our environment map.
import { INERT_HOVER, useStacks } from "../store";
import { useGLTF, useTexture } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { mergeVertices } from "three-stdlib";

import { HOVER_MOTION_SCALE, LIFT_LAMBDA, hingeShift } from "./Lift";
import {
  DESK_LAMP_HEAD_NODE,
  DESK_LAMP_HEAD_PIVOT,
  DESK_LAMP_MOUTH,
  DESK_LAMP_SHADE_GLOW_NODE,
  DESK_LAMP_SHADE_NODE,
  DESK_LAMP_SHADE_VENT,
  type QuaternionTuple,
} from "./deskLampHead";
import { cameraSideHoverTilt, cameraSideSlide } from "./hoverTilt";
import {
  HOVER_MAX_SIZE,
  type Hinge,
  hingeFor,
  hingePivotForTilt,
  litByOwnRig,
  useInteractionClaimed,
} from "./interaction";
import {
  extractTriangles,
  findIslands,
  findSphereIsland,
  findSpinAxis,
  partitionTrianglesByOctant,
} from "./islands";
import { LEAN_CLEARANCE_MARGIN, leanBudget } from "./leanClearance";
import {
  filterTrianglesToHalfSpace,
  modelDetailHalfSpace,
} from "./oneSidedDetailGeometry";
import {
  type ReactionArchetype,
  archetypeFor,
  bandMotionFor,
  recordArchetype,
} from "./reactionArchetype";
import { useSceneQualityControls } from "./sceneQualityController";

/** Name of the node `spinPart` isolates. Animators find it by traversing the
 * subtree rather than through a prop, which keeps ModelProp's memo free of
 * caller-supplied objects — see the disposal note below for why that matters. */
export const SPIN_NODE = "stacks-spin";

export const ATLAS_URLS = ["/models/atlas-light.png", "/models/atlas-dark.png"];

export const MODEL_URLS = [
  "/models/desk-lamp.glb",
  "/models/mug.glb",
  "/models/alarm-clock.glb",
  "/models/headphones.glb",
  "/models/dumbbell.glb",
  "/models/globe.glb",
  "/models/trophy.glb",
  "/models/open-book.glb",
  "/models/golf-club.glb",
  "/models/basketball.glb",
  "/models/cup-tea.glb",
  "/models/grandfather-clock.glb",
  "/models/sansevieria.glb",
  "/models/potted-plant.glb",
  "/models/pothos.glb",
  "/models/barbell.glb",
  "/models/kettlebell.glb",
  // v5 additions. These six are placed by unit files but were never in the
  // preload batch, so they arrived after the first paint and popped in one at
  // a time; the eames-chair is also the seat's click target, which made its
  // late arrival an interaction gap rather than only a visual one.
  // `armchair.glb` came the other way: preloaded, and placed by nothing since
  // the About chair was swapped for the eames. This list is the placed set.
  "/models/monstera.glb",
  "/models/cactus.glb",
  "/models/lamp-floor.glb",
  "/models/mac.glb",
  // v7, the owner's own picks off poly.pizza. The couch is the seat's click
  // target, so it belongs here for the same reason the eames-chair it replaced
  // did: arriving late makes it an interaction gap, not just a visual pop.
  //
  // Three entries came OUT at the same time — ct-books, ladder and eames-chair
  // — because the props they preloaded are no longer placed by anything. A
  // stale entry here is not free: this list is fetched on every load and every
  // byte of it counts against the models payload budget, while rendering
  // nothing.
  "/models/couch.glb",
  "/models/microphone.glb",
  "/models/soda-can.glb",
  "/models/protein-powder.glb",
  // The two loose balls beside the basketball on the Training shelves.
  "/models/baseball.glb",
  "/models/tennis-ball.glb",
  // Owner-selected CC0 plants from the same tiny-treats atlas as pothos;
  // their geometry is separate, their themed texture is already shared.
  "/models/succulent-pot.glb",
  "/models/yucca-plant.glb",
  "/models/kettle.glb",
  // 2026-08-22: the Musings sailboat came out and the Gay Head lighthouse
  // went in (owner's call). Same slot, same reason for being here: a
  // placed prop that is not preloaded pops in on its own after first paint.
  "/models/lighthouse.glb",
  "/models/phone.glb",
  "/models/notebook.glb",
  "/models/harmonica.glb",
  // Systems: the frozen chicken bags (FrozenBag.tsx loads this directly, not
  // through ModelProp, but it belongs in the same warm batch for the same
  // reason as everything above — a late bag is a visible pop on arrival).
  "/models/bag.glb",
];

/** Isa Lousberg's tiny-treats props are a second atlas set: every prop in it
 * samples ONE shared texture, so the palette-remapped pair themes all of
 * them at once — same mechanism and same ~2KB as the CreativeTrio atlas.
 * The pipeline refuses to build a `recolor` prop that doesn't match it. */
export const RECOLOR_URLS = [
  "/models/tiny-treats-light.png",
  "/models/tiny-treats-dark.png",
];

// One shared material per themed atlas texture (drei caches the texture by
// URL, so the uuid is stable across every ModelProp instance).
const atlasMaterials = new Map<string, THREE.MeshStandardMaterial>();

const ABOUT_CHAIR_URL = "/models/couch.glb";
const BARBELL_URL = "/models/barbell.glb";
let aboutChairFabric:
  | { color: THREE.DataTexture; roughness: THREE.DataTexture }
  | undefined;

/** A tiny deterministic woven surface used only by the About couch. The
 * source model is flat-colour low-poly geometry; multiplying its tint by a
 * near-white weave plus a higher-frequency roughness/bump map adds actual
 * fabric response without changing any other tinted ModelProp instance. */
function aboutChairFabricMaps() {
  if (aboutChairFabric) return aboutChairFabric;
  const size = 64;
  const color = new Uint8Array(size * size * 4);
  const roughness = new Uint8Array(size * size * 4);
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Crossed four-pixel yarns with deterministic micro-variation. Values
      // stay close to white so the authored blue remains the dominant color.
      const yarn = (x % 4 === 0 ? -7 : 2) + (y % 4 === 0 ? -6 : 2);
      const noise = ((((x * 37 + y * 61) ^ (x * y * 13)) & 15) - 7.5) * 0.5;
      const c = byte(239 + yarn * 0.9 + noise * 0.75);
      const r = byte(226 - yarn * 1.5 + noise * 2.1);
      color.set([c, c, c, 255], i);
      roughness.set([r, r, r, 255], i);
    }
  }
  const texture = (data: Uint8Array, colorSpace: THREE.ColorSpace) => {
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    map.colorSpace = colorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(6, 5);
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
    // Module-lifetime and shared only by the couch's two upholstery meshes.
    map.userData.shared = true;
    return map;
  };
  aboutChairFabric = {
    color: texture(color, THREE.SRGBColorSpace),
    roughness: texture(roughness, THREE.NoColorSpace),
  };
  return aboutChairFabric;
}

type AtlasColorSwap = {
  from: string;
  to: string;
  /** RGB byte distance. Palette roles are flat; this only catches resized
   * edge pixels without bleeding into a neighbouring role. */
  tolerance?: number;
};

/** Make a private final-colour atlas for one prop. The source texture and the
 * shared material stay immutable, so a leaf fix cannot recolor another pot. */
function remapAtlasTexture(
  source: THREE.Texture,
  swaps: ReadonlyArray<AtlasColorSwap>,
): THREE.CanvasTexture {
  const image = source.image as CanvasImageSource & {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  const width = image.naturalWidth ?? image.width ?? 256;
  const height = image.naturalHeight ?? image.height ?? 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height);
  const parsed = swaps.map((swap) => {
    const from = Number.parseInt(swap.from.slice(1), 16);
    const to = Number.parseInt(swap.to.slice(1), 16);
    return {
      from: [(from >> 16) & 255, (from >> 8) & 255, from & 255],
      to: [(to >> 16) & 255, (to >> 8) & 255, to & 255],
      toleranceSq: (swap.tolerance ?? 5) ** 2,
    };
  });
  for (let i = 0; i < pixels.data.length; i += 4) {
    for (const swap of parsed) {
      const dr = pixels.data[i]! - swap.from[0]!;
      const dg = pixels.data[i + 1]! - swap.from[1]!;
      const db = pixels.data[i + 2]! - swap.from[2]!;
      if (dr * dr + dg * dg + db * db > swap.toleranceSq) continue;
      pixels.data[i] = swap.to[0]!;
      pixels.data[i + 1] = swap.to[1]!;
      pixels.data[i + 2] = swap.to[2]!;
      break;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = source.flipY;
  texture.colorSpace = source.colorSpace;
  texture.magFilter = source.magFilter;
  texture.minFilter = source.minFilter;
  texture.wrapS = source.wrapS;
  texture.wrapT = source.wrapT;
  texture.anisotropy = source.anisotropy;
  texture.generateMipmaps = source.generateMipmaps;
  texture.needsUpdate = true;
  return texture;
}

function atlasMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial {
  let mat = atlasMaterials.get(tex.uuid);
  if (!mat) {
    tex.flipY = false; // glTF UV convention — drei's loader defaults to flipped
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    mat = new THREE.MeshStandardMaterial({
      map: tex,
      metalness: 0,
      roughness: 0.7,
      // COLOR_0 carries the pipeline's baked vertex AO (--ao). Meshes
      // without it get a white fill in ModelProp — an unbound color
      // attribute would render black.
      vertexColors: true,
    });
    // Cached and reused by every atlas prop — never disposable.
    mat.userData.shared = true;
    atlasMaterials.set(tex.uuid, mat);
  }
  return mat;
}

/**
 * Pull the ball out of a single-mesh globe so it can turn inside its own ring.
 *
 * The prop arrives as ONE mesh — base, stem, two axle pins, meridian ring and
 * ball, 478 triangles, one material — so the parts have to be recovered from
 * connectivity (see ./islands). The ball is identified by SHAPE, never by
 * index: it is the island whose bounding box is cubic (1.000 against 0.394 for
 * the next nearest), because traversal order is an exporter artifact and the
 * next re-export through scripts/stacks-models.mjs could reorder it silently.
 *
 * Layout produced:
 *   root
 *     ├ mesh            everything except the ball, untouched
 *     └ group           at the ball's centre, tilted so +Y is the axle
 *         └ SPIN_NODE   an animator writes rotation.y here
 *             └ mesh    the ball, baked into that frame
 *
 * The ball never collides with the ring it turns inside, at any angle: it is a
 * sphere rotating about an axis through its own centre, so it maps onto
 * itself. The axle tilt is therefore about how it READS — a globe spinning
 * bolt upright looks like a ball on a spike — rather than about clearance.
 * The pivot is the BALL's centre with the pins' DIRECTION: the pin midpoint
 * sits ~0.001 off the ball centre, which would otherwise wobble.
 *
 * Detection failure leaves the prop whole and logs. An animator then turns the
 * entire globe, which is the old behaviour and merely less good — the outcome
 * worth preventing is silently spinning the stand.
 */
function splitSpinPart(root: THREE.Object3D): void {
  type PropMesh = THREE.Mesh<
    THREE.BufferGeometry,
    THREE.Material | THREE.Material[]
  >;
  const meshes: PropMesh[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o as PropMesh);
  });
  const mesh = meshes[0];
  if (meshes.length !== 1 || !mesh) {
    console.error(
      `[stacks] spinPart: expected one mesh, found ${meshes.length}. Prop left whole.`,
    );
    return;
  }

  const geometry = mesh.geometry;
  const islands = findIslands(geometry);
  const total = islands.reduce((n, i) => n + i.triangles.length, 0);
  const ball = findSphereIsland(islands, total);
  if (!ball) {
    console.error(
      `[stacks] spinPart: no spherical island among ${islands.length} ` +
        `(best sphericity ${Math.max(...islands.map((i) => i.sphericity)).toFixed(2)}). ` +
        "Prop left whole — run `node scripts/stacks-render.mjs <name> --report` to see the islands.",
    );
    return;
  }

  const { axis, tiltDegrees, derived } = findSpinAxis(islands, ball);
  if (!derived) {
    console.warn(
      "[stacks] spinPart: no axle pins found; spinning the ball about vertical.",
    );
  }

  const rest = islands
    .filter((i) => i !== ball)
    .flatMap((i) => i.triangles)
    .sort((a, b) => a - b);
  // +Y of the spin frame onto the axle; the inverse bakes the ball into it.
  const align = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    axis,
  );
  const inverseAlign = align.clone().invert();
  // Keep the visual ball exact, but split it into local octants so the live
  // collision index sees eight tight curved-surface bounds instead of one
  // rotating cube that sweeps through the stationary meridian ring.
  const ballGeometries = partitionTrianglesByOctant(
    geometry,
    ball.triangles,
    ball.center,
    inverseAlign,
  ).map((triangles) =>
    extractTriangles(geometry, triangles, ball.center, inverseAlign),
  );
  const restGeometry = extractTriangles(geometry, rest);

  const spin = new THREE.Group();
  spin.name = SPIN_NODE;
  for (const ballGeometry of ballGeometries) {
    const ballMesh = new THREE.Mesh(ballGeometry, mesh.material);
    ballMesh.castShadow = mesh.castShadow;
    ballMesh.receiveShadow = mesh.receiveShadow;
    spin.add(ballMesh);
  }

  const mount = new THREE.Group();
  mount.position.copy(ball.center);
  mount.quaternion.copy(align);
  mount.add(spin);

  mesh.geometry = restGeometry;
  mesh.add(mount);
  // Keep the mount in the mesh's own frame — it is a child of the mesh, and
  // the mesh may carry a transform from the GLB's node graph.
  mount.updateMatrixWorld(true);

  if (process.env.NODE_ENV === "development") {
    console.info(
      `[stacks] spinPart: ball ${ball.triangles.length}/${total} tris, ` +
        `sphericity ${ball.sphericity.toFixed(3)}, axle tilt ${tiltDegrees.toFixed(1)}°`,
    );
  }
}

const DESK_LAMP_SHADE_GLOW_STOPS = [
  [0, 0.06],
  [0.1, 0.46],
  [0.2, 0.84],
  [0.29, 1],
  [0.45, 0.8],
  [0.62, 0.46],
  [0.8, 0.18],
  [0.92, 0.05],
  [1, 0.02],
] as const;

export function deskLampShadeGlowStrength(distanceFromMouth: number) {
  const t = THREE.MathUtils.clamp(distanceFromMouth, 0, 1);
  for (let index = 1; index < DESK_LAMP_SHADE_GLOW_STOPS.length; index++) {
    const left = DESK_LAMP_SHADE_GLOW_STOPS[index - 1]!;
    const right = DESK_LAMP_SHADE_GLOW_STOPS[index]!;
    if (t > right[0]) continue;
    return THREE.MathUtils.lerp(
      left[1],
      right[1],
      (t - left[0]) / (right[0] - left[0]),
    );
  }
  return DESK_LAMP_SHADE_GLOW_STOPS.at(-1)![1];
}

/** The former shade shell carried this warm ramp in a canvas texture. Keep the
 * same colour and alpha profile in a tiny shared data texture so the exact
 * shade surface stays amber under the composer instead of becoming a
 * grayscale overlay. */
let deskLampShadeGlowTextureCache: THREE.DataTexture | null = null;
function deskLampShadeGlowTexture() {
  if (deskLampShadeGlowTextureCache) return deskLampShadeGlowTextureCache;
  const width = 4;
  const height = 128;
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const fromMouth = row / (height - 1);
    const alpha = Math.round(deskLampShadeGlowStrength(fromMouth) * 255);
    for (let column = 0; column < width; column++) {
      const offset = (row * width + column) * 4;
      data[offset] = 255;
      data[offset + 1] = 201;
      data[offset + 2] = 138;
      data[offset + 3] = alpha;
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  deskLampShadeGlowTextureCache = texture;
  return texture;
}

/** Recover the shade and bulb from the desk lamp's single source mesh, then
 * hang them from the measured arm/shade seam. The arm remains in the rest
 * mesh. */
export function articulateDeskLampHead(
  root: THREE.Object3D,
  quaternion: QuaternionTuple,
  shadeGlow?: { color: string; opacity: number },
): boolean {
  type PropMesh = THREE.Mesh<
    THREE.BufferGeometry,
    THREE.Material | THREE.Material[]
  >;
  const meshes: PropMesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object as PropMesh);
  });
  const mesh = meshes[0];
  if (meshes.length !== 1 || !mesh) return false;
  const source = mesh.geometry;
  const islands = findIslands(source);
  const head = islands.filter(
    (island) =>
      island.min.y > 0.27 &&
      (island.max.y > 0.39 || island.triangles.length > 120),
  );
  if (head.length !== 2) return false;
  const shade = head.reduce((largest, island) =>
    island.extent.lengthSq() > largest.extent.lengthSq() ? island : largest,
  );
  const selected = new Set(head);
  const rest = islands
    .filter((island) => !selected.has(island))
    .flatMap((island) => island.triangles)
    .sort((left, right) => left - right);
  // The measurements are in the loaded model's root frame, while the source
  // triangles are in the child mesh's accessor frame. desk-lamp.glb places
  // that mesh at y=.2081 with a .2081 scale, so treating the two frames as
  // interchangeable rotates the shade around the wrong point and leaves the
  // separately authored emission visibly behind. Convert both the hinge and
  // the extra rotation into mesh-local space before cutting the geometry.
  root.updateWorldMatrix(true, true);
  const meshToRoot = root.matrixWorld
    .clone()
    .invert()
    .multiply(mesh.matrixWorld);
  const rootToMesh = meshToRoot.clone().invert();
  const pivot = new THREE.Vector3(...DESK_LAMP_HEAD_PIVOT).applyMatrix4(
    rootToMesh,
  );
  const shadeVent = new THREE.Vector3(...DESK_LAMP_SHADE_VENT)
    .applyMatrix4(rootToMesh)
    .sub(pivot);
  const shadeMouth = new THREE.Vector3(...DESK_LAMP_MOUTH)
    .applyMatrix4(rootToMesh)
    .sub(pivot);
  const meshRotation = new THREE.Quaternion();
  meshToRoot.decompose(new THREE.Vector3(), meshRotation, new THREE.Vector3());
  const headRotation = new THREE.Quaternion(...quaternion);
  const localRotation = meshRotation
    .clone()
    .invert()
    .multiply(headRotation)
    .multiply(meshRotation);
  const mount = new THREE.Group();
  mount.name = DESK_LAMP_HEAD_NODE;
  mount.position.copy(pivot);
  mount.quaternion.copy(localRotation);
  for (const island of head) {
    const geometry = extractTriangles(source, island.triangles, pivot);
    const part = new THREE.Mesh(geometry, mesh.material);
    part.castShadow = mesh.castShadow;
    part.receiveShadow = mesh.receiveShadow;
    if (island === shade) {
      part.name = DESK_LAMP_SHADE_NODE;
      if (shadeGlow) {
        const glowGeometry = geometry.clone();
        glowGeometry.userData = { ...glowGeometry.userData, owned: true };
        const position = glowGeometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        const uvs = new Float32Array(position.count * 2);
        const axis = shadeMouth.clone().sub(shadeVent);
        const axisLengthSq = axis.lengthSq();
        const point = new THREE.Vector3();
        for (let index = 0; index < position.count; index++) {
          point.fromBufferAttribute(position, index);
          const ventToPoint = point.sub(shadeVent);
          const fromVent = THREE.MathUtils.clamp(
            ventToPoint.dot(axis) / axisLengthSq,
            0,
            1,
          );
          const fromMouth = 1 - fromVent;
          // A texture coordinate, rather than a vertex colour, preserves the
          // bulb-weighted peak across the shade's long low-poly faces: the GPU
          // interpolates v per fragment before sampling the 128-step ramp.
          uvs[index * 2] = 0.5;
          uvs[index * 2 + 1] = fromMouth;
        }
        glowGeometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: shadeGlow.color,
          map: deskLampShadeGlowTexture(),
          transparent: true,
          opacity: shadeGlow.opacity,
          blending: THREE.AdditiveBlending,
          depthTest: true,
          depthFunc: THREE.EqualDepth,
          depthWrite: false,
          toneMapped: true,
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.name = DESK_LAMP_SHADE_GLOW_NODE;
        glow.castShadow = false;
        glow.receiveShadow = false;
        part.add(glow);
      }
    }
    mount.add(part);
  }
  mesh.geometry = extractTriangles(source, rest);
  mesh.add(mount);
  mount.updateMatrixWorld(true);
  return true;
}

/**
 * Preserve a model's rendered triangles while giving each disconnected part
 * its own mesh bound. The insect collision index is deliberately one AABB per
 * mesh. Some assets group physically separate pieces into broad material
 * meshes: the barbell's shaft otherwise inherits a box spanning both plates
 * (and the retired Musings sailboat's masthead inherited a hull-sized blocker
 * the same way — the lighthouse that replaced it ships its parts as separate
 * nodes, so it needs no split).
 */
export function splitDisconnectedMeshIslands(root: THREE.Object3D): void {
  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh)
      meshes.push(object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>);
  });
  for (const mesh of meshes) {
    const islands = findIslands(mesh.geometry);
    if (islands.length <= 1) continue;
    const geometries = islands.map((island) =>
      extractTriangles(mesh.geometry, island.triangles),
    );
    mesh.geometry = geometries[0]!;
    for (let index = 1; index < geometries.length; index++) {
      const part = new THREE.Mesh(geometries[index], mesh.material);
      part.name = `${mesh.name || "mesh"}:island:${index}`;
      part.castShadow = mesh.castShadow;
      part.receiveShadow = mesh.receiveShadow;
      mesh.add(part);
    }
  }
}

/** Default floor motion, amplified by the same scene-wide control as Lift.
 * The swell alone does not read from a camera sitting ~2° above the shelf
 * line, which is why there is a rise at all. Both still sit UNDER a linked
 * prop's amplified motion on purpose — a prop that opens a page should
 * out-move one that only acknowledges you. */
const FLOOR_LIFT = 0.032 * HOVER_MOTION_SCALE;
const FLOOR_GROW = 1 + 0.022 * HOVER_MOTION_SCALE;

/** ADR 0020 band three. Furniture answers without displacing: it swells very
 * slightly and, where its material is its own, brightens.
 *
 * Smaller than FLOOR_GROW even though these are the biggest props, because
 * swell is proportional — 2% of a 2.4-unit grandfather clock moves its top
 * five centimetres, where 2% of a mug moves nothing. The small props can
 * afford a bigger number precisely because they are small. */
const GLOW_GROW = 1 + 0.008 * HOVER_MOTION_SCALE;
/** Added to `emissiveIntensity` at full hover, on private materials only. */
const GLOW_EMISSIVE = 0.35;

/** Twin of the helper in eggs.tsx (not exported there). */
function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Wrapper-group name for the floor: `prop:<model>`. Named because pixels
 * cannot say WHICH object moved — the harness reads the transform through
 * `window.__stacks.node()`, the same reason SPIN_NODE has a name. */
export function hoverNodeName(url: string): string {
  return `prop:${
    url
      .split("/")
      .pop()
      ?.replace(/\.glb$/, "") ?? "model"
  }`;
}

/**
 * Backstop for interaction shells that predate `InteractionClaim`: ask the
 * live scene graph whether an ancestor already handles hover. r3f's own event
 * dispatcher reads exactly this field to decide which objects an event bubbles
 * through (`__r3f.handlers`), so the answer is the dispatcher's own. Every
 * hover shell in this scene — EggTrigger, LampSwitch, HoverShell, Grabbable —
 * is an `onPointerOver` on a group, and nothing in the scene uses
 * onPointerMove or onPointerEnter, so this one key is the whole surface.
 */
function ancestorHandlesHover(from: THREE.Object3D): boolean {
  type Instance = { handlers?: Record<string, unknown> };
  for (let o = from.parent; o; o = o.parent) {
    const instance = (o as THREE.Object3D & { __r3f?: Instance }).__r3f;
    if (instance?.handlers?.onPointerOver) return true;
  }
  return false;
}

/** Whether a prop that asked for the floor gets it, and why not if it doesn't.
 * `size` is reported either way — it is what the dev log is for, and since
 * ADR 0020 it is also what picks the archetype.
 *
 * The own-rig test lives in `interaction.ts` as `litByOwnRig`. SIZE is no
 * longer a refusal here: a prop too big to bob is furniture, and furniture now
 * answers on the glow channel instead of being dropped from the raycast set.
 * That change is half of "some things aren't reactive" — the couch, the floor
 * lamp, the grandfather clock and the golf club are exactly the props a
 * visitor points at first, and exactly the ones that used to do nothing at
 * all. The cutoff
 * still governs whether a prop may RISE, because a vertical bob is a thing
 * furniture does not do; it just no longer governs whether it may ANSWER. */
function floorVerdict(group: THREE.Object3D): {
  reason: string | null;
  size: number;
} {
  // Measure before testing anything, so the dev log reports a size for every
  // prop in the world and not only the ones that survive the earlier gates —
  // the size cutoff below was chosen off exactly that census.
  //
  // World, not local: ancestors carry the unit pose and the two house scales
  // (2.00 units/m on the shelves, ~0.96 on the floor). updateWorldMatrix first
  // — this runs before the first frame, so the matrices up the chain have not
  // necessarily been composed yet.
  group.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return { reason: "empty", size: 0 };
  const s = box.getSize(new THREE.Vector3());
  const size = Math.max(s.x, s.y, s.z);
  if (ancestorHandlesHover(group)) return { reason: "shell", size };
  if (litByOwnRig(group, box)) return { reason: "rig", size };
  return { reason: null, size };
}

/**
 * The interaction floor: a prop that has no other answer at least
 * acknowledges the pointer. A damped rise of a couple of centimetres and a
 * swell you would not notice on its own, easing on Lift's curve so the whole
 * world settles alike.
 *
 * Hover state lives in refs and drives the group inside useFrame — no React
 * render per pointer move, the rule the rest of this scene is built on (see
 * Lift). At rest the frame callback compares two numbers and returns, so an
 * untouched prop costs nothing.
 *
 * The swell pivots at the prop's OWN base, not the wrapper's origin: the
 * primitive keeps whatever `position` the caller gave it, so scaling the
 * wrapper would drag a prop standing 1.3 m along the shelf sideways by 2 cm —
 * a slide, not a swell. Undoing that by the same factor scales about the
 * child's origin, which is where the prop meets the wood.
 *
 * The nod is the third channel, and it hinges the same way every other prop in
 * the world does (see Lift's TIP and hingeFor): about the prop's own
 * supporting bottom edge, so the opposite half rises off the plank instead
 * of driving through it. It rides the SAME two gates as the rise — a prop too
 * big to bob is too big to nod, and a prop wearing its own lighting rig gets
 * neither, because turning a floor lamp slides its shade out of the spotlight
 * that is a sibling of the model rather than a child of it.
 */
function HoverFloor({
  name,
  lift,
  grow,
  force,
  children,
}: {
  name: string;
  lift: number;
  grow: number;
  force: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const hovered = useRef(false);
  const rise = useRef(0);
  const swell = useRef(1);
  const nod = useRef(0);
  const cameraDirection = useMemo(() => new THREE.Vector3(), []);
  const cameraWorld = useMemo(() => new THREE.Vector3(), []);
  const nodeWorld = useMemo(() => new THREE.Vector3(), []);
  const parentWorld = useMemo(() => new THREE.Quaternion(), []);
  /** undefined = not measured yet (a GLB may still be streaming), null =
   * measured and refused. Resolved on first hover rather than in the mount
   * effect for exactly that reason: `floorVerdict` runs before the first frame
   * and can measure an empty box, and a hinge edge derived from an empty box
   * is a hinge through the origin. */
  const hinge = useRef<Hinge | null | undefined>(undefined);
  /** Signed local-Z pull that stands in for a lean the prop has no
   * headroom for, and the damped value chasing it. See leanClearance.ts. */
  const slideAim = useRef(0);
  const slide = useRef(0);
  const still = useMemo(() => reducedMotion(), []);
  // Resolved once, after the tree has committed — the prop is attached and
  // measurable by then, every shell above it has its handlers, and a mounted
  // prop never changes parents. A prop that stands down drops its handlers
  // entirely rather than merely ignoring the pointer: with no handlers r3f
  // leaves it out of the raycast set (furniture is big geometry to hit-test
  // for nothing) AND out of the bubble chain, so the shell above it is reached
  // exactly as it was before this component existed.
  // Claims the store's hover slot under the INERT prefix: the floor moves a
  // prop, it does not open anything, and a pointer finger over a prop with no
  // destination promises a click that never lands (see store.ts). The claim
  // still buys correct cursor arbitration against the props that DO open
  // something, and gives the harness something to read.
  const hoverKey = INERT_HOVER + useId();
  const [inert, setInert] = useState(false);
  /** The band this prop answers on, resolved from its MEASURED world size.
   * `force` is a call site insisting on the small-prop treatment for something
   * the tape would otherwise call furniture. */
  const [archetype, setArchetype] = useState<ReactionArchetype>("tip");
  /** Whether this prop may RISE, which is a stricter test than whether it may
   * tip. See the two cutoffs in interaction.ts. */
  const [canRise, setCanRise] = useState(true);
  /** Materials this prop actually OWNS, collected on hover-start. Never
   * collected across frames: `atlasOverride` rebuilds the clone on a parent
   * re-render, and a cached list would point at freed materials — the same
   * trap `Glint` documents in UnitProjects. */
  const glowMaterials = useRef<THREE.MeshStandardMaterial[] | null>(null);
  const glowLevel = useRef(0);
  useEffect(() => {
    const g = ref.current;
    if (!g) return;
    const { reason, size } = floorVerdict(g);
    if (reason) setInert(true);
    const resolved = archetypeFor({ size: force ? undefined : size });
    setArchetype(resolved);
    setCanRise(force || size <= HOVER_MAX_SIZE);
    if (!reason) {
      recordArchetype({
        id: `${name}#${hoverKey}`,
        archetype: resolved,
        source: "floor",
        size,
      });
    }
    if (process.env.NODE_ENV === "development") {
      console.info(
        `[stacks] floor ${name} size=${size.toFixed(3)} → ${reason ?? resolved}`,
      );
    }
  }, [name, force, hoverKey]);
  useFrame(({ camera }, delta) => {
    const g = ref.current;
    if (!g || inert) return;
    const glow = archetype === "glow";
    // Reduced motion does not silence a prop, it moves it to the channel that
    // does not displace anything. That is glow, so glow is the one band that
    // still answers. See `reducedMotionArchetype`.
    const on = hovered.current && (!still || glow);
    // Measured lazily, and only once the pointer is actually on the prop — by
    // then the GLB has certainly streamed in, and a prop nobody touches never
    // pays for a bbox walk at all. Glow never tips, so it never measures.
    if (on && !glow && hinge.current === undefined) {
      const measured = hingeFor(g, false, HOVER_MAX_SIZE);
      if (measured) hinge.current = measured.reason ? null : measured;
    }
    const measuredHinge = glow ? null : (hinge.current ?? null);
    // A prop between HOVER_MAX_SIZE and TILT_MAX_SIZE may TIP but must not
    // RISE: a nod about the edge a thing rests on is what a standing object
    // does, while a vertical bob is not. The two cutoffs differ on purpose and
    // the reasoning is written out in interaction.ts.
    // Headroom gates the RISE for the same reason it gates the lean: a prop
    // with a neighbour resting on it has nowhere to bob to. `FLAT_LIFT` has
    // banned exactly this by hand since long before the floor existed.
    const roomToRise =
      (measuredHinge?.headroom ?? Number.POSITIVE_INFINITY) >
      lift + LEAN_CLEARANCE_MARGIN;
    const ty = on && !glow && canRise && roomToRise ? lift : 0;
    const tSlide = on && measuredHinge ? slideAim.current : 0;
    const ts = on ? (glow ? GLOW_GROW : grow) : 1;
    let tn = 0;
    if (on && measuredHinge) {
      camera.getWorldPosition(cameraWorld);
      g.getWorldPosition(nodeWorld);
      cameraDirection.copy(cameraWorld).sub(nodeWorld);
      if (g.parent) {
        g.parent.getWorldQuaternion(parentWorld).invert();
        cameraDirection.applyQuaternion(parentWorld);
      }
      // The floor rides the same band table as Grabbable, so an unshelled
      // prop and a carryable one of the same weight answer alike.
      const band = bandMotionFor(archetype);
      // The hinge stops a lean going DOWN through the plank and nothing was
      // stopping it going up into whatever is stacked on the prop. Where it
      // does not fit, the travel is spent pulling toward the viewer instead.
      const budget = leanBudget(
        measuredHinge,
        Math.sign(band.lean) *
          cameraSideHoverTilt(cameraDirection, Math.abs(band.lean)),
      );
      tn = budget.lean;
      slideAim.current = cameraSideSlide(cameraDirection, budget.slide);
    }
    const pivot = measuredHinge
      ? hingePivotForTilt(measuredHinge, tn || nod.current)
      : null;
    // Glow is a fourth damped channel and has to be tested alongside the other
    // three. Left out of the sum, the early return fires as soon as the SWELL
    // lands — and the swell's travel is 0.02 where glow's is 1.0, so it always
    // lands first — freezing the fade part-way and leaving every furniture
    // prop permanently, faintly lit after one hover.
    const tg = glow && on ? 1 : 0;
    if (
      Math.abs(rise.current - ty) +
        Math.abs(swell.current - ts) +
        Math.abs(nod.current - tn) +
        Math.abs(slide.current - tSlide) +
        Math.abs(glowLevel.current - tg) <
      1e-4
    ) {
      if (
        rise.current === ty &&
        swell.current === ts &&
        nod.current === tn &&
        slide.current === tSlide &&
        glowLevel.current === tg
      )
        return; // settled
      rise.current = ty;
      swell.current = ts;
      nod.current = tn;
      slide.current = tSlide;
      glowLevel.current = tg;
    } else {
      rise.current = THREE.MathUtils.damp(rise.current, ty, LIFT_LAMBDA, delta);
      swell.current = THREE.MathUtils.damp(
        swell.current,
        ts,
        LIFT_LAMBDA,
        delta,
      );
      nod.current = THREE.MathUtils.damp(nod.current, tn, LIFT_LAMBDA, delta);
      slide.current = THREE.MathUtils.damp(
        slide.current,
        tSlide,
        LIFT_LAMBDA,
        delta,
      );
      glowLevel.current = THREE.MathUtils.damp(
        glowLevel.current,
        tg,
        LIFT_LAMBDA,
        delta,
      );
    }
    // The glow channel. Emissive is written only to materials this prop owns:
    // `atlasMaterial` hands ONE MeshStandardMaterial to every atlas prop in
    // the scene, so brightening it would brighten the mugs, the clocks and
    // every other prop sharing it. Props on the shared atlas therefore answer
    // with the swell alone — see the work log, this is a known gap.
    if (glow) {
      if (on && !glowMaterials.current) {
        const owned: THREE.MeshStandardMaterial[] = [];
        g.traverse((o) => {
          const mesh = o as THREE.Mesh;
          const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
          if (!mat?.isMeshStandardMaterial) return;
          if ((mat.userData as { shared?: boolean }).shared === true) return;
          owned.push(mat);
        });
        glowMaterials.current = owned;
      }
      for (const mat of glowMaterials.current ?? [])
        mat.emissiveIntensity = 1 + GLOW_EMISSIVE * glowLevel.current;
      if (!on && glowLevel.current === 0) glowMaterials.current = null;
    }
    const base = g.children[0]?.position;
    const k = 1 - swell.current;
    g.scale.setScalar(swell.current);
    g.rotation.x = nod.current;
    g.position.set(
      base ? base.x * k : 0,
      (base ? base.y * k : 0) + rise.current,
      (base ? base.z * k : 0) + slide.current,
    );
    // The hinge compensation, on top of the swell's own. Taken from the
    // rotation the group HAS this frame, not the one it is easing toward, so
    // the contact edge is pinned throughout the ease rather than only at the
    // ends. Exactly zero at rest, so an untouched prop is where it always was.
    if (pivot) g.position.add(hingeShift(pivot, g.rotation, undefined));
  });
  // The group stays mounted either way — dropping it would re-parent the model
  // and churn the graph other systems cache nodes out of. Only the handlers go.
  const handlers = inert
    ? {}
    : {
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation(); // or every prop behind this one lights up too
          hovered.current = true;
          useStacks.getState().setHovered(hoverKey);
        },
        onPointerOut: () => {
          hovered.current = false;
          // Clear only our own slot — a late out must never drop another
          // prop's freshly claimed hover (the house rule, see EggTrigger).
          if (useStacks.getState().hovered === hoverKey)
            useStacks.getState().setHovered(null);
        },
      };
  return (
    <group ref={ref} name={name} {...handlers}>
      {children}
    </group>
  );
}

export default function ModelProp({
  url,
  dark,
  variant = "atlas",
  tints,
  materialProperties,
  tintAll,
  roughness = 0.7,
  atlasOverride,
  smoothNormals,
  spinPart,
  deskLampHeadQuaternion,
  deskLampShadeGlowColor,
  deskLampShadeGlowOpacity,
  hover = true,
  position,
  rotation,
  scale,
}: {
  url: string;
  dark: boolean;
  variant?: "atlas" | "tinted" | "recolor";
  /** tinted only: material name → hex color remap. */
  tints?: Record<string, string>;
  /** tinted only: opt selected materials into physically metallic shading
   * without making grips, pages, or other sibling materials metallic, or give
   * one material its own glow (the lighthouse lantern's Glass) without
   * touching its siblings. */
  materialProperties?: Record<
    string,
    {
      metalness?: number;
      roughness?: number;
      emissive?: string;
      emissiveIntensity?: number;
    }
  >;
  /** tinted only: multiply every material (and its texture) by this color. */
  tintAll?: string;
  roughness?: number;
  /** atlas/recolor only: clone the shared atlas material for THIS prop and
   * adjust. `colorSwaps` also clones the map; neither shared global is ever
   * mutated. */
  atlasOverride?: {
    tint?: string;
    metalness?: number;
    roughness?: number;
    colorSwaps?: ReadonlyArray<AtlasColorSwap>;
  };
  /** Weld + regenerate normals at load — the basketball ships faceted and
   * the node pipeline can't round-trip its embedded texture (GLTFExporter
   * needs a DOM to re-encode images). Position+uv-equal vertices merge;
   * normals regenerate smooth. */
  smoothNormals?: boolean;
  /** Isolate one part of a single-mesh prop into a node named SPIN_NODE that
   * an animator can rotate on its own — "sphere" pulls the globe's ball out
   * of its stand and ring. A plain string literal on purpose: this lands in
   * the memo deps below, and an object here would rebuild the model on every
   * parent render. */
  spinPart?: "sphere";
  /** Isolate the desk-lamp shade and bulb at their measured arm/shade hinge,
   * then apply this fixed local articulation without moving its base or arms. */
  deskLampHeadQuaternion?: QuaternionTuple;
  /** Exact-surface additive treatment for desk-lamp fabric. Both values must
   * be present; other models and unlit lamp uses create no extra mesh. */
  deskLampShadeGlowColor?: string;
  deskLampShadeGlowOpacity?: number;
  /** Universal interaction floor, ON by default: a small prop with no other
   * answer still rises a little under the pointer.
   *
   * It stands down on its own for anything that should not bob — furniture (by
   * measured size), a prop lit by a rig of siblings, a prop inside a shell that
   * already handles the pointer, a prop with `spinPart`. Overridable in both
   * directions: `false` is an unconditional no, `{ force: true }` puts the
   * floor on a prop the size cutoff would have excluded. `{ lift, grow }` tunes
   * the motion — a heavy prop wants a smaller lift rather than none. */
  hover?: boolean | { lift?: number; grow?: number; force?: boolean };
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  const { scene } = useGLTF(url, false);
  const { cinematicPlus } = useSceneQualityControls();
  // Two atlas sets, one code path: recolor props sample the tiny-treats
  // pair, everything else the CreativeTrio pair. Same hook, same cache.
  const atlases = useTexture(variant === "recolor" ? RECOLOR_URLS : ATLAS_URLS);
  // Read here, used only by the wrapper below — the hover floor deliberately
  // owns no state that could reach the memo's deps.
  const claimed = useInteractionClaimed();
  const object = useMemo(() => {
    const clone = scene.clone(true);
    if (variant === "atlas" || variant === "recolor") {
      let mat = atlasMaterial(atlases[dark ? 1 : 0]!);
      if (atlasOverride) {
        mat = mat.clone();
        // Material.clone() deep-copies userData, so the clone would inherit
        // the shared tag and be skipped by disposal forever. It is this
        // prop's own material; it must be freed with this prop.
        mat.userData.shared = false;
        if (atlasOverride.tint) mat.color.set(atlasOverride.tint);
        if (atlasOverride.metalness !== undefined)
          mat.metalness = atlasOverride.metalness;
        if (atlasOverride.roughness !== undefined)
          mat.roughness = atlasOverride.roughness;
        if (atlasOverride.colorSwaps?.length) {
          mat.map = remapAtlasTexture(mat.map!, atlasOverride.colorSwaps);
          mat.userData.ownedMap = true;
        }
      }
      clone.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const geo = o.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position;
        if (!geo.attributes.color && pos) {
          geo.setAttribute(
            "color",
            new THREE.BufferAttribute(
              new Float32Array(3 * pos.count).fill(1),
              3,
            ),
          );
        }
        o.material = mat;
      });
    } else {
      clone.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mesh = o as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.MeshStandardMaterial
        >;
        const src = mesh.material;
        const mat = src.clone();
        const tint = tints?.[src.name];
        if (tint) mat.color.set(tint);
        if (tintAll) mat.color.multiply(new THREE.Color(tintAll));
        const properties = materialProperties?.[src.name];
        mat.metalness = properties?.metalness ?? 0;
        mat.roughness = properties?.roughness ?? roughness;
        if (properties?.emissive) {
          mat.emissive.set(properties.emissive);
          mat.emissiveIntensity = properties.emissiveIntensity ?? 1;
        }
        const detailHalfSpace = modelDetailHalfSpace(url, src.name);
        if (detailHalfSpace)
          mesh.geometry = filterTrianglesToHalfSpace(
            mesh.geometry,
            detailHalfSpace,
          );
        if (url === ABOUT_CHAIR_URL && src.name === "Couch_Blue") {
          // The 8.5 KB source GLB intentionally has no TEXCOORD_0. Generate a
          // box projection on a private geometry clone; otherwise a map samples
          // one texel across the entire couch and provides no fabric variation.
          const geometry = mesh.geometry.clone();
          const position = geometry.getAttribute(
            "position",
          ) as THREE.BufferAttribute;
          const normal = geometry.getAttribute(
            "normal",
          ) as THREE.BufferAttribute;
          const uv = new Float32Array(position.count * 2);
          for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            const nx = Math.abs(normal.getX(i));
            const ny = Math.abs(normal.getY(i));
            const nz = Math.abs(normal.getZ(i));
            if (ny >= nx && ny >= nz) {
              uv[i * 2] = x;
              uv[i * 2 + 1] = z;
            } else if (nx >= nz) {
              uv[i * 2] = z;
              uv[i * 2 + 1] = y;
            } else {
              uv[i * 2] = x;
              uv[i * 2 + 1] = y;
            }
          }
          geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
          // BufferGeometry.clone/copy shares userData by reference in Three
          // r185. Replace it before tagging ownership or teardown of this
          // private couch clone can taint and dispose the cached GLB.
          geometry.userData = { ...geometry.userData, owned: true };
          mesh.geometry = geometry;
          const fabric = aboutChairFabricMaps();
          mat.map = fabric.color;
          mat.roughnessMap = fabric.roughness;
          mat.roughness = 0.96;
          mat.bumpMap = fabric.roughness;
          mat.bumpScale = 0.014;
        }
        mesh.material = mat;
      });
    }
    if (url === BARBELL_URL) splitDisconnectedMeshIslands(clone);
    if (spinPart === "sphere") splitSpinPart(clone);
    const deskLampHead =
      deskLampHeadQuaternion ??
      (url === "/models/desk-lamp.glb" ? ([0, 0, 0, 1] as const) : undefined);
    if (
      deskLampHead &&
      !articulateDeskLampHead(
        clone,
        deskLampHead,
        deskLampShadeGlowColor !== undefined &&
          deskLampShadeGlowOpacity !== undefined
          ? {
              color: deskLampShadeGlowColor,
              opacity: deskLampShadeGlowOpacity,
            }
          : undefined,
      ) &&
      process.env.NODE_ENV === "development"
    )
      console.error(
        "[stacks] desk lamp head: expected the measured shade and bulb islands; model left whole.",
      );
    if (smoothNormals) {
      clone.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const geo = o.geometry as THREE.BufferGeometry;
        // Meshopt-decoded geometry is INTERLEAVED — mergeVertices silently
        // degenerates it to a zero bbox. De-interleave (dropping normals)
        // into plain attributes first, then weld + regenerate.
        const flat = new THREE.BufferGeometry();
        for (const [name, attr] of Object.entries(geo.attributes)) {
          if (name === "normal") continue;
          const a = attr as THREE.BufferAttribute;
          const arr = new Float32Array(a.count * a.itemSize);
          for (let i = 0; i < a.count; i++)
            for (let c = 0; c < a.itemSize; c++)
              arr[i * a.itemSize + c] = a.getComponent(i, c);
          flat.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
        }
        if (geo.index) flat.setIndex(geo.index.clone());
        const welded = mergeVertices(flat);
        welded.computeVertexNormals();
        welded.userData = { ...welded.userData, owned: true };
        o.geometry = welded;
      });
    }
    return clone;
  }, [
    scene,
    url,
    atlases,
    dark,
    variant,
    tints,
    materialProperties,
    tintAll,
    roughness,
    atlasOverride,
    smoothNormals,
    spinPart,
    deskLampHeadQuaternion,
    deskLampShadeGlowColor,
    deskLampShadeGlowOpacity,
  ]);

  // GLTF nodes do not inherit the castShadow flags used by the hand-authored
  // primitives. Opt their private clones into the temporary daylight shadow
  // pass only while Cinematic+ is live, then restore every original flag.
  useEffect(() => {
    if (!cinematicPlus || dark) return;
    const originals: Array<[THREE.Mesh, boolean]> = [];
    object.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const mesh = node as THREE.Mesh;
      originals.push([mesh, mesh.castShadow]);
      mesh.castShadow = true;
    });
    return () => {
      for (const [mesh, castShadow] of originals) mesh.castShadow = castShadow;
    };
  }, [cinematicPlus, dark, object]);

  // Release what this memo allocated. `tints` and `atlasOverride` are inline
  // object literals at every call site, so their identity changes on ANY
  // parent re-render — a theme flip, a panel opening, the degrade ladder
  // stepping — and the memo rebuilds. Without this, each rebuild stranded a
  // fresh material per tinted mesh (and a welded geometry per smoothNormals
  // mesh) on the GPU, and nothing ever freed them.
  //
  // Only clones are disposed. The shared atlas material is cached by texture
  // uuid and reused across every atlas prop in the scene; disposing that
  // would blank them all, so it is tagged and skipped.
  useEffect(() => {
    const stale = object;
    return () => {
      stale.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mesh = o as THREE.Mesh<
          THREE.BufferGeometry,
          THREE.Material | THREE.Material[]
        >;
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const m of mats) {
          const shared = (m.userData as { shared?: boolean }).shared === true;
          if (!shared) {
            if (
              m instanceof THREE.MeshStandardMaterial &&
              (m.userData as { ownedMap?: boolean }).ownedMap === true
            )
              m.map?.dispose();
            m.dispose();
          }
        }
        const owned = (mesh.geometry.userData as { owned?: boolean }).owned;
        if (owned === true) mesh.geometry.dispose();
      });
    };
  }, [object]);
  const model = (
    <primitive
      object={object}
      position={position}
      rotation={rotation}
      scale={scale}
    />
  );
  // Nothing wrapped, nothing subscribed to the frame loop, and the rendered
  // tree is byte-for-byte what it was before this prop existed. `spinPart` is
  // in here because the two motions fight: the wrapper would carry the stand
  // up with the ball, and the whole point of splitSpinPart is that the stand
  // holds still.
  if (hover === false || claimed || spinPart || deskLampHeadQuaternion)
    return model;
  const tune = hover === true ? null : hover;
  return (
    <HoverFloor
      name={hoverNodeName(url)}
      lift={tune?.lift ?? FLOOR_LIFT}
      grow={tune?.grow ?? FLOOR_GROW}
      force={tune?.force ?? false}
    >
      {model}
    </HoverFloor>
  );
}

/** Fire-and-forget prefetch of the full prop set (~300KB incl. atlases and
 * recolor textures) — called once after the world mounts so props pop in
 * together instead of trickling per-unit. */
export function preloadModels() {
  for (const url of MODEL_URLS) useGLTF.preload(url, false);
  useTexture.preload(ATLAS_URLS);
  useTexture.preload(RECOLOR_URLS);
}
