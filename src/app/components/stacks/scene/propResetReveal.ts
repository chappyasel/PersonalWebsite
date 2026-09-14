import * as THREE from "three";

/** Temporary private materials keep a returning prop's fade from changing
 * other objects that use the same atlas material. No work survives the fade. */
export function beginPropResetReveal(
  root: THREE.Object3D,
  reducedMotion: boolean,
) {
  const scale = root.scale.clone();
  const materials = new Map<THREE.Material, THREE.Material>();
  const bindings: Array<{
    mesh: THREE.Mesh;
    original: THREE.Material | THREE.Material[];
    temporary: THREE.Material | THREE.Material[];
  }> = [];
  const clone = (original: THREE.Material) => {
    let temporary = materials.get(original);
    if (!temporary) {
      temporary = original.clone();
      temporary.onBeforeCompile = original.onBeforeCompile.bind(temporary);
      temporary.customProgramCacheKey =
        original.customProgramCacheKey.bind(original);
      temporary.transparent = true;
      temporary.depthWrite = false;
      temporary.opacity = 0;
      materials.set(original, temporary);
    }
    return temporary;
  };
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const mesh = node as THREE.Mesh<
      THREE.BufferGeometry,
      THREE.Material | THREE.Material[]
    >;
    const original = mesh.material;
    const temporary = Array.isArray(original)
      ? original.map(clone)
      : clone(original);
    bindings.push({ mesh, original, temporary });
    mesh.material = temporary;
  });
  let elapsed = 0;
  let finished = false;
  const duration = reducedMotion ? 0.18 : 0.32;
  if (!reducedMotion) root.scale.copy(scale).multiplyScalar(0.82);
  const reveal = {
    opacity: 0,
    finish() {
      if (finished) return;
      finished = true;
      reveal.opacity = 1;
      root.scale.copy(scale);
      for (const { mesh, original, temporary } of bindings)
        if (mesh.material === temporary) mesh.material = original;
      for (const material of materials.values()) material.dispose();
    },
    advance(delta: number) {
      if (finished) return true;
      elapsed += Math.max(0, delta);
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - (1 - t) ** 3;
      reveal.opacity = eased;
      for (const [original, temporary] of materials)
        temporary.opacity = original.opacity * eased;
      if (!reducedMotion)
        root.scale.copy(scale).multiplyScalar(0.82 + 0.18 * eased);
      if (t === 1) reveal.finish();
      return finished;
    },
  };
  return reveal;
}
