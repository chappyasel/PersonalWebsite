import * as THREE from "three";

const sourceWorldMatrix = new THREE.Matrix4();
const returnWorldMatrix = new THREE.Matrix4();
let source: THREE.Object3D | null = null;
let captured = false;
let returnReady = false;

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
    sourceWorldMatrix.copy(source.matrixWorld);
    returnWorldMatrix.copy(source.matrixWorld);
    captured = true;
    returnReady = true;
    return true;
  },
  updateReturnAnchor() {
    if (!source) return false;
    source.updateWorldMatrix(true, true);
    returnWorldMatrix.copy(source.matrixWorld);
    returnReady = true;
    return true;
  },
  sourceMatrix() {
    return captured ? sourceWorldMatrix : null;
  },
  returnMatrix() {
    return returnReady ? returnWorldMatrix : null;
  },
  reset() {
    captured = false;
    returnReady = false;
  },
};
