import * as THREE from "three";

import {
  CROSSING_TOKENS,
  type CrossingTheme,
  crossingDustGain,
} from "./coordinationCrossing";
import {
  type DustScatter,
  scatterCoordinationDust,
  stepDustScatter,
} from "./coordinationDustScatter";
import { SCATTER_FRAGMENT, SCATTER_VERTEX } from "./coordinationDustShader";

type Screen = Readonly<{ x: number; y: number }>;

const displayColor = ([r, g, b]: readonly [number, number, number]) =>
  new THREE.Vector3(r / 255, g / 255, b / 255);

/** Takes each grain from where it sits in the orb, so the first frame is the
 * frame before it, and throws it across the window. */
export function createCrossingDust({
  source,
  orb,
  theme,
  viewport,
  toScreen,
}: {
  source: THREE.Points<THREE.BufferGeometry>;
  orb: Screen;
  theme: CrossingTheme;
  viewport: Readonly<{ width: number; height: number }>;
  toScreen: (world: THREE.Vector3) => Screen;
}) {
  const local = source.geometry.getAttribute("position");
  const world = new THREE.Vector3();
  const grains = Array.from({ length: local.count }, (_, index) =>
    toScreen(
      world.fromBufferAttribute(local, index).applyMatrix4(source.matrixWorld),
    ),
  );
  const scatter: DustScatter = scatterCoordinationDust(grains, orb, viewport);
  const dark = theme === "dark";

  const position = new THREE.BufferAttribute(scatter.position, 2);
  position.setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", position);
  for (const name of ["aAlpha", "aKind", "aSize", "aPhase"]) {
    const attribute = source.geometry.getAttribute(name);
    geometry.setAttribute(
      name,
      new THREE.BufferAttribute(Float32Array.from(attribute.array), 1),
    );
  }
  const uniforms = {
    uColors: { value: CROSSING_TOKENS[theme].grains.map(displayColor) },
    uViewport: { value: new THREE.Vector2(viewport.width, viewport.height) },
    uDpr: { value: 1 },
    uTime: { value: 0 },
    uGain: { value: 1 },
    uCore: { value: dark ? 1 : 0 },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader: SCATTER_VERTEX,
    fragmentShader: SCATTER_FRAGMENT,
    uniforms,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    update(time: number, delta: number, dpr: number) {
      stepDustScatter(scatter, delta);
      position.needsUpdate = true;
      uniforms.uDpr.value = dpr;
      uniforms.uTime.value = time / 1000;
      uniforms.uGain.value = crossingDustGain(time);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
