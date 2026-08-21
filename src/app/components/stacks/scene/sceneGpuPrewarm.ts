import * as THREE from "three";

export const SCENE_UNIT_LIGHT_USER_DATA_KEY = "scenePerformanceUnit";

export function sceneUnitLightUserData(unitIndex: number) {
  return { [SCENE_UNIT_LIGHT_USER_DATA_KEY]: unitIndex };
}

type SceneGpuProgramRenderer = {
  compile: (
    scene: THREE.Object3D,
    camera: THREE.Camera,
    targetScene?: THREE.Scene | null,
  ) => unknown;
};

export type SceneGpuPrewarmRenderer = SceneGpuProgramRenderer & {
  shadowMap: { autoUpdate: boolean };
  getRenderTarget: () => Parameters<THREE.WebGLRenderer["setRenderTarget"]>[0];
  getActiveCubeFace: () => number;
  getActiveMipmapLevel: () => number;
  setRenderTarget: (
    target: Parameters<THREE.WebGLRenderer["setRenderTarget"]>[0],
    activeCubeFace?: number,
    activeMipmapLevel?: number,
  ) => void;
  render: (scene: THREE.Object3D, camera: THREE.Camera) => void;
  info: { reset: () => void };
};

type ProgramPrewarmInput = Readonly<{
  renderer: SceneGpuProgramRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  withUnitRootsVisible: (run: () => void) => void;
}>;

type PrewarmInput = ProgramPrewarmInput &
  Readonly<{
    renderer: SceneGpuPrewarmRenderer;
  }>;

export function shouldWarmSceneGpuResources(
  previousVariant: string | null,
  nextVariant: string,
): boolean {
  return previousVariant !== nextVariant;
}

function withSceneRenderablesUnculled(scene: THREE.Scene, run: () => void) {
  const renderables: Array<
    Readonly<{ object: THREE.Object3D; value: boolean }>
  > = [];
  scene.traverse((object) => {
    if (
      !(object instanceof THREE.Mesh) &&
      !(object instanceof THREE.Points) &&
      !(object instanceof THREE.Line) &&
      !(object instanceof THREE.Sprite)
    )
      return;
    renderables.push({ object, value: object.frustumCulled });
    object.frustumCulled = false;
  });
  try {
    run();
  } finally {
    for (const { object, value } of renderables) object.frustumCulled = value;
  }
}

/** Compile every mounted mesh for the current shader state without repeating
 * the texture and geometry upload. */
export function prewarmSceneGpuPrograms({
  renderer,
  scene,
  camera,
  withUnitRootsVisible,
}: ProgramPrewarmInput): void {
  withSceneRenderablesUnculled(scene, () =>
    withUnitRootsVisible(() => renderer.compile(scene, camera)),
  );
}

/**
 * Force one tiny offscreen draw of the complete mounted room.
 *
 * `WebGLRenderer.compile()` creates shader programs but does not upload every
 * geometry or texture. Safari then pays those allocations on the first frame
 * that a distant unit becomes visible. The 1x1 draw moves that one-time work
 * behind the boot screen without allocating a scene-sized render target. It
 * necessarily creates the linear-target program variant as well; compiling
 * first keeps the visible sRGB variant warm. Shadow maps stay frozen because
 * main-pass geometry buffers are shared, while drawing every full-size shadow
 * target here would turn a bounded upload into another large render.
 */
export function prewarmSceneGpuResources({
  renderer,
  scene,
  camera,
  withUnitRootsVisible,
}: PrewarmInput): void {
  const previousTarget = renderer.getRenderTarget();
  const previousCubeFace = renderer.getActiveCubeFace();
  const previousMipmapLevel = renderer.getActiveMipmapLevel();
  const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
  const target = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
  });
  renderer.shadowMap.autoUpdate = false;
  try {
    withSceneRenderablesUnculled(scene, () =>
      withUnitRootsVisible(() => {
        // Compile while the caller's screen target is still active. Three keys
        // programs by output color space, so compiling after binding the linear
        // upload target would leave the visible sRGB variant cold.
        renderer.compile(scene, camera);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      }),
    );
  } finally {
    try {
      renderer.setRenderTarget(
        previousTarget,
        previousCubeFace,
        previousMipmapLevel,
      );
    } finally {
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      target.dispose();
      // The warm-up draw is not a user-visible frame and must not leak its
      // aggregate counts into either the HUD or the performance trace.
      renderer.info.reset();
    }
  }
}
