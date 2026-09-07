import type * as THREE from "three";

export type GeometryHalfSpace = {
  axis: "x" | "y" | "z";
  sign: -1 | 1;
};

/** Scene-ready model policy: the source club duplicates its white groove
 * geometry on both sides, but only model +X is the striking face. */
export function modelDetailHalfSpace(
  url: string,
  materialName: string,
): GeometryHalfSpace | null {
  if (
    url === "/models/golf-club.glb" &&
    materialName === "M_PCL_Flat_White_Darker"
  )
    return { axis: "x", sign: 1 };
  return null;
}

export function filterTrianglesToHalfSpace(
  geometry: THREE.BufferGeometry,
  halfSpace: GeometryHalfSpace,
) {
  const positions = geometry.getAttribute("position");
  const sourceIndex = geometry.getIndex();
  const count = sourceIndex?.count ?? positions.count;
  const component = halfSpace.axis === "x" ? 0 : halfSpace.axis === "y" ? 1 : 2;
  const coordinate = (vertex: number) =>
    positions.getComponent(vertex, component);
  const kept: number[] = [];
  for (let triangle = 0; triangle < count; triangle += 3) {
    const a = sourceIndex?.getX(triangle) ?? triangle;
    const b = sourceIndex?.getX(triangle + 1) ?? triangle + 1;
    const c = sourceIndex?.getX(triangle + 2) ?? triangle + 2;
    const centroid = (coordinate(a) + coordinate(b) + coordinate(c)) / 3;
    if (centroid * halfSpace.sign >= 0) kept.push(a, b, c);
  }
  const filtered = geometry.clone();
  filtered.setIndex(kept);
  filtered.clearGroups();
  filtered.computeBoundingBox();
  filtered.computeBoundingSphere();
  // ModelProp owns and disposes this private clone. Do not share the cached
  // source geometry's userData object or teardown can taint the GLTF cache.
  filtered.userData = { ...filtered.userData, owned: true };
  return filtered;
}
