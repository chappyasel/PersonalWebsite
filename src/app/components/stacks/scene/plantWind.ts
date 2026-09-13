import * as THREE from "three";

import { type Island, findIslands } from "./islands";

export const PLANT_KINDS = [
  "monstera",
  "pothos",
  "potted-plant",
  "sansevieria",
  "yucca-plant",
  "succulent-pot",
] as const;
export type PlantKind = (typeof PLANT_KINDS)[number];

// Root-space measurements of the approved assets, not placement scale or island IDs.
const PROFILES = {
  monstera: {
    pot: [0, 0.7, 0.9],
    stems: 7,
    leaves: 7,
    stemFlex: 0.24,
    leafFlex: 0.7,
  },
  pothos: {
    pot: [0.2182, 0.6182, 0.45],
    stems: 3,
    leaves: 13,
    stemFlex: 0.42,
    leafFlex: 0.85,
  },
  "potted-plant": {
    pot: [0, 0.1295, 0.12],
    stems: 1,
    leaves: 14,
    stemFlex: 1.8,
    leafFlex: 1.0,
  },
  sansevieria: {
    pot: [0, 0.8057, 1.2],
    stems: 0,
    leaves: 8,
    stemFlex: 0,
    leafFlex: 0.23,
  },
  "yucca-plant": {
    pot: [0, 0.3997, 0.49],
    stems: 6,
    leaves: 12,
    stemFlex: 0,
    leafFlex: 0.7,
  },
  "succulent-pot": {
    pot: [0.0001, 0.4, 1.48],
    stems: 0,
    leaves: 48,
    stemFlex: 0,
    leafFlex: 0.12,
  },
} satisfies Record<
  PlantKind,
  {
    pot: number[];
    stems: number;
    leaves: number;
    stemFlex: number;
    leafFlex: number;
  }
>;

type Part = { island: Island; vertices: number[] };
export type PlantLeaf = {
  vertices: number[];
  attachment: THREE.Vector3;
  stemAttachment: THREE.Vector3;
  axis: THREE.Vector3;
  length: number;
  phase: number;
  collar: number;
};

/** Measured model-root bounds, deliberately independent of exporter island order.
 * Fail closed when an asset no longer has the reviewed structure. */
export function classifyPlant(geometry: THREE.BufferGeometry, kind: PlantKind) {
  const position = geometry.getAttribute("position");
  const parts: Part[] = findIslands(geometry).map((island) => ({
    island,
    vertices: [
      ...new Set(
        island.triangles.flatMap((t) =>
          [0, 1, 2].map((k) => geometry.index?.getX(t * 3 + k) ?? t * 3 + k),
        ),
      ),
    ],
  }));
  const profile = PROFILES[kind];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.003;
  const pots = parts.filter(
    ({ island: i }) =>
      near(i.min.y, profile.pot[0]!) &&
      near(i.max.y, profile.pot[1]!) &&
      Math.min(i.extent.x, i.extent.z) > profile.pot[2]!,
  );
  if (pots.length !== 1)
    throw new Error(`${kind}: planter classification changed`);
  const pot = pots[0]!;
  // The snake plant exports its rim and soil separately from its planter.
  const fixed = parts.filter(
    (part) =>
      part === pot ||
      (kind === "sansevieria" &&
        ((near(part.island.min.y, 0.6702) && near(part.island.max.y, 1)) ||
          (near(part.island.min.y, 0.8493) && part.island.extent.y < 0.001))),
  );
  if (fixed.length !== (kind === "sansevieria" ? 3 : 1))
    throw new Error(`${kind}: fixed parts classification changed`);
  const stems = parts.filter(
    (part) =>
      !fixed.includes(part) &&
      (kind === "monstera"
        ? near(part.island.min.y, 0.4812)
        : kind === "pothos"
          ? part.island.extent.y > 0.45
          : kind === "potted-plant"
            ? near(part.island.min.y, 0.1119) && part.island.extent.x < 0.03
            : kind === "yucca-plant"
              ? Math.max(part.island.extent.x, part.island.extent.z) < 0.14
              : false),
  );
  const leaves = parts.filter(
    (part) => !fixed.includes(part) && !stems.includes(part),
  );
  if (stems.length !== profile.stems || leaves.length !== profile.leaves)
    throw new Error(`${kind}: foliage classification changed`);
  if (kind === "yucca-plant") fixed.push(...stems);
  const triangle = new THREE.Triangle();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const leafMetadata: PlantLeaf[] = leaves.map(({ vertices, island }) => {
    let distance = Infinity;
    const attachment = new THREE.Vector3();
    const stemAttachment = new THREE.Vector3();
    for (const stem of stems)
      for (const t of stem.island.triangles) {
        [triangle.a, triangle.b, triangle.c].forEach((v, k) =>
          v.fromBufferAttribute(
            position,
            geometry.index?.getX(t * 3 + k) ?? t * 3 + k,
          ),
        );
        for (const i of vertices) {
          p.fromBufferAttribute(position, i);
          triangle.closestPointToPoint(p, q);
          const d = p.distanceToSquared(q);
          if (d < distance) {
            distance = d;
            attachment.copy(p);
            stemAttachment.copy(q);
          }
        }
      }
    // Monstera petioles meet the interior of a broad lamina triangle, not
    // necessarily one of its sparse vertices. Check the reverse projection too.
    for (const t of island.triangles) {
      [triangle.a, triangle.b, triangle.c].forEach((v, k) =>
        v.fromBufferAttribute(
          position,
          geometry.index?.getX(t * 3 + k) ?? t * 3 + k,
        ),
      );
      for (const stem of stems)
        for (const i of stem.vertices) {
          p.fromBufferAttribute(position, i);
          triangle.closestPointToPoint(p, q);
          const d = p.distanceToSquared(q);
          if (d < distance) {
            distance = d;
            attachment.copy(q);
            stemAttachment.copy(p);
          }
        }
    }
    if (stems.length === 0) {
      // Rosette leaves and snake-plant blades emerge directly from the soil.
      // Anchor the lowest authored vertex and keep a size-relative root collar.
      const lowest = vertices.reduce((a, b) =>
        position.getY(a) < position.getY(b) ? a : b,
      );
      attachment.fromBufferAttribute(position, lowest);
      stemAttachment.copy(attachment);
      distance = 0;
    }
    if (distance > 0.06 ** 2) throw new Error(`${kind}: detached leaf`);
    let length = 0;
    const axis = new THREE.Vector3();
    for (const i of vertices) {
      p.fromBufferAttribute(position, i).sub(attachment);
      if (p.length() > length) {
        length = p.length();
        axis.copy(p).normalize();
      }
    }
    return {
      vertices,
      attachment,
      stemAttachment,
      axis,
      length,
      phase:
        (attachment.x * 17 + attachment.y * 11 + attachment.z * 23) /
        Math.max(pot.island.extent.y, 0.1),
      collar: Math.min(0.02, length * 0.08),
    };
  });
  return { pot, fixed, stems, leaves: leafMetadata };
}

/** A shared displacement field keeps separate leaf and stem surfaces together.
 * Everything inside the planter stays fixed. Outside it, trailing vines gain
 * flexibility with their drop as well as their distance from the rim. */
export function plantStemWeight(
  p: THREE.Vector3,
  pot: Island,
  kind: PlantKind,
) {
  if (PROFILES[kind].stemFlex === 0) return 0;
  const radius = Math.max(pot.extent.x, pot.extent.z) / 2;
  const outside = Math.max(
    0,
    Math.hypot(p.x - pot.center.x, p.z - pot.center.z) - radius,
  );
  const above = Math.max(0, p.y - pot.max.y);
  const drop = Math.max(0, pot.max.y - p.y);
  const trail =
    kind === "pothos"
      ? drop * drop * (1 - Math.exp((-outside * outside) / 0.0025))
      : 0;
  return above * above + outside * outside + trail;
}

export function plantLeafWeight(p: THREE.Vector3, leaf: PlantLeaf) {
  // A collar scaled to each leaf keeps even tiny leaves attached to the stem.
  const along = Math.max(
    0,
    p.clone().sub(leaf.attachment).dot(leaf.axis) - leaf.collar,
  );
  return (along * along) / leaf.length;
}

export function createPlantWindBinding(
  mesh: THREE.Mesh,
  root: THREE.Object3D,
  kind: PlantKind,
) {
  const source = mesh.geometry;
  root.updateWorldMatrix(true, true);
  const toRoot = root.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const toLocal = new THREE.Matrix3().setFromMatrix4(toRoot.clone().invert());
  const normalToRoot = new THREE.Matrix3().getNormalMatrix(toRoot);
  const normalToLocal = new THREE.Matrix3().setFromMatrix4(toRoot).transpose();
  // GLBs use normalized Int16 accessors. Applying the root matrix to those
  // in place clips values outside [-1, 1]; dequantize before measuring.
  const analysis = new THREE.BufferGeometry();
  const sourcePosition = source.getAttribute("position");
  const rootData = new Float32Array(sourcePosition.count * 3);
  for (let i = 0; i < sourcePosition.count; i++) {
    new THREE.Vector3()
      .fromBufferAttribute(sourcePosition, i)
      .applyMatrix4(toRoot)
      .toArray(rootData, i * 3);
  }
  analysis.setAttribute("position", new THREE.BufferAttribute(rootData, 3));
  if (source.index) analysis.setIndex(source.index.clone());
  let parts: ReturnType<typeof classifyPlant>;
  try {
    parts = classifyPlant(analysis, kind);
  } catch (error) {
    analysis.dispose();
    throw error;
  }
  const rootPositions = analysis.getAttribute("position");
  const geometry = source.clone();
  geometry.userData = { ...source.userData };
  // Only dynamic position/normal buffers are replaced. UVs, colors, indices,
  // materials and the mesh transform retain their exact resting values.
  const copyAttribute = (name: string) => {
    const attribute = source.getAttribute(name);
    const data = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++)
      for (let c = 0; c < 3; c++)
        data[i * 3 + c] = attribute.getComponent(i, c);
    return data;
  };
  const restPosition = copyAttribute("position");
  const restNormal = copyAttribute("normal");
  const positions = new THREE.BufferAttribute(restPosition.slice(), 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  const normals = new THREE.BufferAttribute(restNormal.slice(), 3).setUsage(
    THREE.DynamicDrawUsage,
  );
  geometry.setAttribute("position", positions);
  geometry.setAttribute("normal", normals);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const count = positions.count;
  const base = new Float32Array(count);
  const tip = new Float32Array(count);
  const baseGradient = new Float32Array(count * 3);
  const tipGradient = new Float32Array(count * 3);
  const leafIndex = new Int16Array(count).fill(-1);
  const potVertices = new Set(parts.fixed.flatMap((part) => part.vertices));
  const p = new THREE.Vector3();
  const epsilon = 0.00001;
  for (let i = 0; i < count; i++) {
    if (potVertices.has(i)) continue;
    p.fromBufferAttribute(rootPositions, i);
    base[i] = plantStemWeight(p, parts.pot.island, kind);
    for (let c = 0; c < 3; c++) {
      const original = p.getComponent(c);
      p.setComponent(c, original + epsilon);
      const plus = plantStemWeight(p, parts.pot.island, kind);
      p.setComponent(c, original - epsilon);
      const minus = plantStemWeight(p, parts.pot.island, kind);
      p.setComponent(c, original);
      baseGradient[i * 3 + c] = (plus - minus) / (2 * epsilon);
    }
  }
  parts.leaves.forEach((leaf, index) => {
    for (const i of leaf.vertices) {
      p.fromBufferAttribute(rootPositions, i);
      tip[i] = plantLeafWeight(p, leaf);
      leafIndex[i] = index;
      const slope =
        (2 * Math.max(0, p.sub(leaf.attachment).dot(leaf.axis) - leaf.collar)) /
        leaf.length;
      leaf.axis.toArray(tipGradient, i * 3);
      for (let c = 0; c < 3; c++)
        tipGradient[i * 3 + c] = tipGradient[i * 3 + c]! * slope;
    }
  });
  analysis.dispose();
  // Picking retains the authored rest shape; wind never moves the carrier.
  // Existing foliage-base colliders continue to describe the fixed planter.
  // Preserve the original method identity for teardown; call it with its mesh.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const raycast = mesh.raycast;
  mesh.raycast = function (raycaster, intersects) {
    const animated = this.geometry;
    this.geometry = source;
    try {
      raycast.call(this, raycaster, intersects);
    } finally {
      this.geometry = animated;
    }
  };
  mesh.geometry = geometry;
  const breeze = new THREE.Vector3();
  const flutter = parts.leaves.map(() => new THREE.Vector3());
  const zero = new THREE.Vector3();
  const delta = new THREE.Vector3();
  const n = new THREE.Vector3();
  const jx = new THREE.Vector3(),
    jy = new THREE.Vector3(),
    jz = new THREE.Vector3();
  const cross = new THREE.Vector3(),
    transformedNormal = new THREE.Vector3();
  let atRest = true;
  let disposed = false;
  return {
    parts,
    geometry,
    base,
    tip,
    restore() {
      if (atRest) return;
      positions.array.set(restPosition);
      normals.array.set(restNormal);
      positions.needsUpdate = normals.needsUpdate = true;
      atRest = true;
    },
    update(time: number, windX: number, windZ: number, strength: number) {
      if (disposed) return;
      if (strength === 0) {
        this.restore();
        return;
      }
      const profile = PROFILES[kind];
      const pulse = 0.75 + Math.sin(time * 0.83) * 0.25;
      breeze
        .set(windX, 0, windZ)
        .multiplyScalar(profile.stemFlex * strength * pulse);
      parts.leaves.forEach((leaf, i) => {
        const wave =
          Math.sin(time * 1.15 + leaf.phase) * 0.65 +
          Math.sin(time * 1.83 + leaf.phase * 1.7) * 0.35;
        flutter[i]!.set(
          windX * profile.leafFlex,
          wave * Math.hypot(windX, windZ) * profile.leafFlex * 0.55,
          windZ * profile.leafFlex,
        ).multiplyScalar(strength * (0.4 + wave * 0.6));
        // Bend across the blade, without shortening it along its attachment axis.
        flutter[i]!.addScaledVector(leaf.axis, -flutter[i]!.dot(leaf.axis));
      });
      for (let i = 0; i < count; i++) {
        if (base[i] === 0 && tip[i] === 0) continue;
        const f = flutter[leafIndex[i]!] ?? zero;
        delta
          .copy(breeze)
          .multiplyScalar(base[i]!)
          .addScaledVector(f, tip[i]!)
          .applyMatrix3(toLocal);
        positions.setXYZ(
          i,
          restPosition[i * 3]! + delta.x,
          restPosition[i * 3 + 1]! + delta.y,
          restPosition[i * 3 + 2]! + delta.z,
        );
        // Inverse-transpose of the actual deformation Jacobian, applied to the
        // authored normal. Preserve flat/smooth edges instead of recomputing a
        // different smoothing scheme from connectivity every frame.
        jx.copy(breeze)
          .multiplyScalar(baseGradient[i * 3]!)
          .addScaledVector(f, tipGradient[i * 3]!);
        jx.x += 1;
        jy.copy(breeze)
          .multiplyScalar(baseGradient[i * 3 + 1]!)
          .addScaledVector(f, tipGradient[i * 3 + 1]!);
        jy.y += 1;
        jz.copy(breeze)
          .multiplyScalar(baseGradient[i * 3 + 2]!)
          .addScaledVector(f, tipGradient[i * 3 + 2]!);
        jz.z += 1;
        n.fromArray(restNormal, i * 3)
          .applyMatrix3(normalToRoot)
          .normalize();
        transformedNormal
          .crossVectors(jy, jz)
          .multiplyScalar(n.x)
          .addScaledVector(cross.crossVectors(jz, jx), n.y)
          .addScaledVector(cross.crossVectors(jx, jy), n.z)
          .applyMatrix3(normalToLocal)
          .normalize();
        normals.setXYZ(
          i,
          transformedNormal.x,
          transformedNormal.y,
          transformedNormal.z,
        );
      }
      positions.needsUpdate = normals.needsUpdate = true;
      atRest = false;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.geometry = source;
      mesh.raycast = raycast;
      geometry.dispose();
    },
  };
}

export type PlantWindClock = {
  epoch: number;
  time: number;
  ramp: number;
  windX: number;
  windZ: number;
};
export const createPlantWindClock = (): PlantWindClock => ({
  epoch: -1,
  time: 0,
  ramp: 0,
  windX: 0,
  windZ: 0,
});
export function stepPlantWindClock(
  state: PlantWindClock,
  options: {
    epoch: number;
    live: boolean;
    reduced: boolean;
    paused: boolean;
    delta: number;
    speed?: number;
  },
) {
  if (state.epoch !== options.epoch || !options.live || options.reduced) {
    Object.assign(state, createPlantWindClock(), { epoch: options.epoch });
    return false;
  }
  if (options.paused) return false;
  const dt = Math.min(Math.max(options.delta, 0), 1 / 30);
  state.time += dt * (options.speed ?? 1);
  state.ramp = Math.min(1, state.ramp + dt / 2.5);
  return true;
}
