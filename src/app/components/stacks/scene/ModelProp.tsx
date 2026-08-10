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
import { useGLTF, useTexture } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeVertices } from "three-stdlib";

import {
  extractTriangles,
  findIslands,
  findSphereIsland,
  findSpinAxis,
} from "./islands";

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
  "/models/ct-books.glb",
  "/models/cup-tea.glb",
  "/models/corkboard.glb",
  "/models/grandfather-clock.glb",
  "/models/ladder.glb",
  "/models/armchair.glb",
  "/models/sansevieria.glb",
  "/models/potted-plant.glb",
  "/models/pothos.glb",
  "/models/barbell.glb",
  "/models/kettlebell.glb",
];

/** Isa Lousberg's houseplants are a second atlas set: every prop in it
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
  const ballGeometry = extractTriangles(
    geometry,
    ball.triangles,
    ball.center,
    align.clone().invert(),
  );
  const restGeometry = extractTriangles(geometry, rest);

  const ballMesh = new THREE.Mesh(ballGeometry, mesh.material);
  ballMesh.castShadow = mesh.castShadow;
  ballMesh.receiveShadow = mesh.receiveShadow;

  const spin = new THREE.Group();
  spin.name = SPIN_NODE;
  spin.add(ballMesh);

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

export default function ModelProp({
  url,
  dark,
  variant = "atlas",
  tints,
  tintAll,
  roughness = 0.7,
  atlasOverride,
  smoothNormals,
  spinPart,
  position,
  rotation,
  scale,
}: {
  url: string;
  dark: boolean;
  variant?: "atlas" | "tinted" | "recolor";
  /** tinted only: material name → hex color remap. */
  tints?: Record<string, string>;
  /** tinted only: multiply every material (and its texture) by this color. */
  tintAll?: string;
  roughness?: number;
  /** atlas only: clone the shared atlas material for THIS prop and adjust —
   * the trophy's metal exception, the dumbbell's iron darkening. Without
   * this every atlas prop shares one material, so never mutate that one. */
  atlasOverride?: { tint?: string; metalness?: number; roughness?: number };
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
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}) {
  const { scene } = useGLTF(url, false);
  // Two atlas sets, one code path: recolor props sample the tiny-treats
  // pair, everything else the CreativeTrio pair. Same hook, same cache.
  const atlases = useTexture(variant === "recolor" ? RECOLOR_URLS : ATLAS_URLS);
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
      }
      clone.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const geo = o.geometry as THREE.BufferGeometry;
        const pos = geo.attributes.position;
        if (!geo.attributes.color && pos) {
          geo.setAttribute(
            "color",
            new THREE.BufferAttribute(new Float32Array(3 * pos.count).fill(1), 3),
          );
        }
        o.material = mat;
      });
    } else {
      clone.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const src = o.material as THREE.MeshStandardMaterial;
        const mat = src.clone();
        const tint = tints?.[src.name];
        if (tint) mat.color.set(tint);
        if (tintAll) mat.color.multiply(new THREE.Color(tintAll));
        mat.metalness = 0;
        mat.roughness = roughness;
        o.material = mat;
      });
    }
    if (spinPart === "sphere") splitSpinPart(clone);
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
        welded.userData.owned = true;
        o.geometry = welded;
      });
    }
    return clone;
  }, [scene, atlases, dark, variant, tints, tintAll, roughness, atlasOverride, smoothNormals, spinPart]);

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
          if (!shared) m.dispose();
        }
        const owned = (mesh.geometry.userData as { owned?: boolean }).owned;
        if (owned === true) mesh.geometry.dispose();
      });
    };
  }, [object]);
  return (
    <primitive
      object={object}
      position={position}
      rotation={rotation}
      scale={scale}
    />
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
