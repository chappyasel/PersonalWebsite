import { type Matrix4, type Object3D, Quaternion } from "three";

/** Animation wrappers have a rest contract; authored mesh poses remain untouched. */
export function restWorldMatrix(
  node: Object3D,
  cache = new Map<Object3D, Matrix4>(),
  rotations: ReadonlyMap<string, readonly number[]> = new Map(),
): Matrix4 {
  const cached = cache.get(node);
  if (cached) return cached;
  const local = node.matrix.clone();
  if (
    node.name.startsWith("nod:") ||
    node.name.startsWith("impulse:") ||
    node.name === "room-sway"
  )
    local.identity();
  const rotation = rotations.get(node.name);
  if (rotation)
    local
      .makeRotationFromEuler(
        node.rotation.clone().set(rotation[0]!, rotation[1]!, rotation[2]!),
      )
      .setPosition(node.position)
      .scale(node.scale);
  const approach = node.userData.propApproachRest as number[] | undefined;
  if (approach?.length === 4)
    local.compose(
      node.position,
      new Quaternion().fromArray(approach),
      node.scale,
    );
  const world = node.parent
    ? restWorldMatrix(node.parent, cache, rotations).clone().multiply(local)
    : local;
  cache.set(node, world);
  return world;
}

/** Preserve the archived path spelling while production uses stable animation names. */
function captureName(name: string, legacyClock: boolean) {
  if (legacyClock && name === "room-boot:clock-second-hand") return "";
  if (name === "room-sway") return "render-mask-prototype-sway";
  if (name === "room-boot:lamp-body:egg:lamp:4") return "projects-boot-lamp";
  return name;
}

export function capturedMeshPath(
  node: Object3D,
  unit: Object3D,
  legacyClock = false,
) {
  const segments: string[] = [];
  for (
    let current: Object3D | null = node;
    current && current !== unit;
    current = current.parent
  ) {
    segments.unshift(
      captureName(current.name, legacyClock) ||
        `${current.type}[${current.parent?.children.indexOf(current) ?? 0}]`,
    );
  }
  return segments.join("/");
}
