"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";

import {
  CROSSING_BLOCK_ID,
  CROSSING_TOKENS,
  type CrossingRun,
  coordinationCrossing,
  crossingBlinker,
} from "./coordinationCrossing";
import {
  COORDINATION_CROSSING_FRAGMENT,
  COORDINATION_CROSSING_VERTEX,
} from "./coordinationCrossingShader";
import { CROSSING_WIRE_IGNORE } from "./coordinationCrossingWire";

/** Runs after the composer, which renders at priority 1. */
const CROSSING_RENDER_PRIORITY = 2;

const isRoomRoot = (object: THREE.Object3D) =>
  object.name.startsWith("room-unit:") ||
  object.name === "stacks-monstera-anchor";

/** A glow is a card that only looks like light because of its texture and blend.
 * Under an override material it is a solid sheet flat against its lamp. */
const isGlow = (material: THREE.Material) =>
  material.blending !== THREE.NormalBlending ||
  (material.transparent && !material.depthWrite);

/** Sprites and points have no surface for an override material to wire. */
function staysOutOfWire(object: THREE.Object3D) {
  if (
    object.userData[CROSSING_WIRE_IGNORE] ||
    (object as THREE.Sprite).isSprite ||
    (object as THREE.Points).isPoints
  )
    return true;
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh) return false;
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  return materials.every(
    (material) =>
      !material.visible ||
      !material.colorWrite ||
      material.opacity === 0 ||
      isGlow(material),
  );
}

/** Everything the wire pass leaves out: the environment around the room units,
 * and whatever inside them an override material would paint wrongly, like
 * invisible hit areas and glows. Lights stay put so the mask pass cannot change
 * light state. */
export function collectWirePassExclusions(scene: THREE.Object3D) {
  const excluded: THREE.Object3D[] = [];
  const holdsRoom = (object: THREE.Object3D): boolean => {
    if (isRoomRoot(object)) {
      object.traverse((child) => {
        if (staysOutOfWire(child)) excluded.push(child);
      });
      return true;
    }
    const children = object.children.map((child) => ({
      child,
      room: holdsRoom(child),
    }));
    if (!children.some(({ room }) => room)) return false;
    for (const { child, room } of children) {
      if (!room && !(child as THREE.Light).isLight) excluded.push(child);
    }
    return true;
  };
  holdsRoom(scene);
  return excluded;
}

const unitColor = ([r, g, b]: readonly [number, number, number]) =>
  new THREE.Vector3(r / 255, g / 255, b / 255);

function createCrossingPass(run: CrossingRun) {
  const tokens = CROSSING_TOKENS[run.theme];
  const uniforms = {
    uRoom: { value: null as THREE.Texture | null },
    uWire: { value: null as THREE.Texture | null },
    uBuffer: { value: new THREE.Vector2(1, 1) },
    uOrb: { value: new THREE.Vector2(run.origin.x, run.origin.y) },
    uDpr: { value: 1 },
    uTime: { value: 0 },
    uReach: { value: 1 },
    uDark: { value: run.theme === "dark" ? 1 : 0 },
    uGround: { value: unitColor(tokens.ground) },
    uDot: { value: unitColor(tokens.dot) },
    uTone: { value: unitColor(tokens.tone) },
    uAccent: { value: unitColor(tokens.accent) },
    uBlockMin: { value: new THREE.Vector2() },
    uBlockMax: { value: new THREE.Vector2() },
    uEm: { value: 72 },
    uBlock: { value: 0 },
    uBloom: { value: 0 },
    uFlare: { value: 0 },
  };
  const compositeMaterial = new THREE.ShaderMaterial({
    vertexShader: COORDINATION_CROSSING_VERTEX,
    fragmentShader: COORDINATION_CROSSING_FRAGMENT,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const triangle = new THREE.BufferGeometry();
  triangle.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const compositeMesh = new THREE.Mesh(triangle, compositeMaterial);
  compositeMesh.frustumCulled = false;
  const compositeScene = new THREE.Scene();
  compositeScene.add(compositeMesh);
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Filled props write depth and green, so the lines drawn after them hide
  // behind the fronts of solid objects.
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0, 1, 0),
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    toneMapped: false,
    fog: false,
  });
  const lineMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1, 1, 0),
    wireframe: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });

  const buffer = new THREE.Vector2();
  const clearColor = new THREE.Color();
  let roomTexture: THREE.FramebufferTexture | null = null;
  let wireTarget: THREE.WebGLRenderTarget | null = null;
  let exclusions: THREE.Object3D[] | null = null;

  const fit = (width: number, height: number) => {
    if (roomTexture?.image.width === width && roomTexture.image.height === height)
      return;
    roomTexture?.dispose();
    wireTarget?.dispose();
    roomTexture = new THREE.FramebufferTexture(width, height);
    roomTexture.minFilter = THREE.LinearFilter;
    roomTexture.magFilter = THREE.LinearFilter;
    wireTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    });
    uniforms.uRoom.value = roomTexture;
    uniforms.uWire.value = wireTarget.texture;
  };

  const renderWire = (
    gl: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) => {
    exclusions ??= collectWirePassExclusions(scene);
    const hidden = exclusions.filter((object) => object.visible);
    const background = scene.background;
    const shadowUpdate = gl.shadowMap.autoUpdate;
    const autoClear = gl.autoClear;
    const clearAlpha = gl.getClearAlpha();
    gl.getClearColor(clearColor);
    for (const object of hidden) object.visible = false;
    scene.background = null;
    gl.shadowMap.autoUpdate = false;
    gl.autoClear = false;
    try {
      gl.setRenderTarget(wireTarget);
      gl.setClearColor(0x000000, 0);
      gl.clear(true, true, false);
      scene.overrideMaterial = fillMaterial;
      gl.render(scene, camera);
      scene.overrideMaterial = lineMaterial;
      gl.render(scene, camera);
      scene.overrideMaterial = null;
      gl.setRenderTarget(null);
      gl.render(compositeScene, compositeCamera);
    } finally {
      scene.overrideMaterial = null;
      scene.background = background;
      gl.setClearColor(clearColor, clearAlpha);
      for (const object of hidden) object.visible = true;
      gl.setRenderTarget(null);
      gl.autoClear = autoClear;
      gl.shadowMap.autoUpdate = shadowUpdate;
    }
  };

  return {
    draw(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
      gl.setRenderTarget(null);
      gl.getDrawingBufferSize(buffer);
      fit(buffer.x, buffer.y);
      if (!roomTexture) return;
      gl.copyFramebufferToTexture(roomTexture);

      const canvasWidth = gl.domElement.clientWidth || buffer.x;
      const dpr = buffer.x / canvasWidth;
      const width = buffer.x / dpr;
      const height = buffer.y / dpr;
      uniforms.uBuffer.value.copy(buffer);
      uniforms.uDpr.value = dpr;
      const time = performance.now() - run.startedAt;
      uniforms.uTime.value = time;
      const blinker = crossingBlinker(time);
      uniforms.uBlock.value = blinker.block;
      uniforms.uBloom.value = blinker.bloom;
      uniforms.uFlare.value = blinker.flare;
      // The hold frame's own block, so the shader's lands exactly on it.
      const block = document
        .getElementById(CROSSING_BLOCK_ID)
        ?.getBoundingClientRect();
      if (block) {
        uniforms.uBlockMin.value.set(block.left, block.top);
        uniforms.uBlockMax.value.set(block.right, block.bottom);
        uniforms.uEm.value = block.width / 0.6;
      }
      uniforms.uReach.value = Math.hypot(
        Math.max(run.origin.x, width - run.origin.x),
        Math.max(run.origin.y, height - run.origin.y),
      );
      renderWire(gl, scene, camera);
    },
    dispose() {
      roomTexture?.dispose();
      wireTarget?.dispose();
      triangle.dispose();
      compositeMaterial.dispose();
      fillMaterial.dispose();
      lineMaterial.dispose();
    },
  };
}

function ActiveCrossingPass({ run }: { run: CrossingRun }) {
  const pass = useRef<ReturnType<typeof createCrossingPass> | null>(null);
  useEffect(() => {
    const created = createCrossingPass(run);
    pass.current = created;
    return () => {
      pass.current = null;
      created.dispose();
    };
  }, [run]);
  useFrame((state) => {
    // Mounting this subscriber takes rendering away from r3f. With the
    // composer gone, as on phones, this pass has to draw the room itself.
    if (state.internal.priority <= 1) state.gl.render(state.scene, state.camera);
    pass.current?.draw(state.gl, state.scene, state.camera);
  }, CROSSING_RENDER_PRIORITY);
  return null;
}

/** Mounts its frame subscriber only during a crossing, so the off path has no
 * render targets, texture samples, or per-frame work. */
export function CoordinationCrossingPass() {
  const run = useSyncExternalStore(
    coordinationCrossing.subscribe,
    () => coordinationCrossing.getSnapshot().run,
    () => null,
  );
  return run ? <ActiveCrossingPass key={run.id} run={run} /> : null;
}
