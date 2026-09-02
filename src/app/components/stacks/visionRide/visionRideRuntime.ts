import type * as THREE from "three";

// Type-only import, deliberately. This module is reached from the placard's
// entry link, which is in the homepage's initial client graph; a value
// import of three here shipped the whole 98 KB core in the first route load
// (PR #45's production deploy failed the route budget on exactly that).
// The matrices are cloned from the registered source instead.
let sourceWorldMatrix: THREE.Matrix4 | null = null;
let returnWorldMatrix: THREE.Matrix4 | null = null;
let source: THREE.Object3D | null = null;

export const visionRideRuntime = {
  registerSource(next: THREE.Object3D) {
    source = next;
    this.updateReturnAnchor();
    return () => {
      if (source === next) source = null;
    };
  },
  captureSource() {
    if (!source) return false;
    source.updateWorldMatrix(true, true);
    sourceWorldMatrix = source.matrixWorld.clone();
    returnWorldMatrix = source.matrixWorld.clone();
    return true;
  },
  updateReturnAnchor() {
    if (!source) return false;
    source.updateWorldMatrix(true, true);
    returnWorldMatrix = source.matrixWorld.clone();
    return true;
  },
  sourceMatrix() {
    return sourceWorldMatrix;
  },
  returnMatrix() {
    return returnWorldMatrix;
  },
  reset() {
    sourceWorldMatrix = null;
    returnWorldMatrix = null;
  },
};
