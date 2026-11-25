"use client";

// Late shelf promotion: mounts the shelves the boot held back once the room
// is live, and warms their textures. Which shelves are mounted lives in
// `unitContentResidencyStore.ts`, which carries no three.js so the Scene
// Diagnostics panel can read it.
import { assetLoadComplete } from "../boot/worldBootMachine";
import { worldBoot } from "../boot/worldBootSession";
import { UNITS } from "../data";
import { useStacks } from "../store";
import { useGLTF, useProgress, useTexture } from "@react-three/drei";
import { useLoader, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";

import { preloadModels } from "./ModelProp";
import { scenePrewarmDeferred } from "./scenePerformance";
import { screenshotModeController } from "./screenshotMode";
import { UNIT_ASSETS } from "./unitAssetManifest";
import {
  nearUnits,
  preloadWithUnit,
  unitContentResidency,
} from "./unitContentResidencyStore";

export {
  nearUnits,
  nextUnitToMount,
  unitContentDeferralAllowed,
  unitContentResidency,
  useAllUnitContentMounted,
  useUnitContentMounted,
} from "./unitContentResidencyStore";

// Start every listed load of a shelf the moment it mounts, so its assets
// arrive in one batch instead of a chain (unitAssetManifest.ts). Each call
// matches its call site's cache key: `useGLTF(url, false)`, `useTexture(url)`,
// `useTexture([a, b])`, `useLoader(SVGLoader, url)`. `?unit-preload=off`
// skips it, to time the chained boot against this one.
const unitPreloadOff =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("unit-preload") === "off";
for (const { slug } of unitPreloadOff ? [] : UNITS) {
  const assets = UNIT_ASSETS[slug];
  preloadWithUnit(slug, () => {
    for (const url of assets.models) useGLTF.preload(url, false);
    for (const url of assets.textures) useTexture.preload(url);
    for (const set of assets.textureSets) useTexture.preload([...set]);
    for (const url of assets.svgs) useLoader.preload(SVGLoader, url);
  });
}

const TEXTURE_SLOTS = [
  "map",
  "alphaMap",
  "aoMap",
  "bumpMap",
  "emissiveMap",
  "lightMap",
  "metalnessMap",
  "normalMap",
  "roughnessMap",
] as const;

/** Upload the textures of one late-mounted shelf. The boot prewarm uploads
 * whatever was mounted behind the boot screen; a shelf mounted afterwards
 * would otherwise pay its uploads on the first frame it comes into view,
 * which on Safari is a visible hitch during travel. Programs are not compiled
 * here: `ShaderPrewarm` compiles after every completed asset batch. */
export function uploadUnitTextures(
  renderer: Pick<THREE.WebGLRenderer, "initTexture">,
  root: THREE.Object3D,
): number {
  const seen = new Set<THREE.Texture>();
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (!material) return;
    for (const entry of Array.isArray(material) ? material : [material]) {
      const record = entry as unknown as Record<string, unknown>;
      for (const slot of TEXTURE_SLOTS) {
        const texture = record[slot];
        if (texture instanceof THREE.Texture && texture.image)
          seen.add(texture as THREE.Texture);
      }
    }
  });
  for (const texture of seen) renderer.initTexture(texture);
  return seen.size;
}

function assetsSettled() {
  const { active, loaded, total, errors } = useProgress.getState();
  return (
    total === 0 ||
    assetLoadComplete({ active, loaded, total, errors: errors.length })
  );
}

/** Mounts the rest of the room after the reveal. Lives inside the Canvas. */
export function UnitContentPromoter() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  // A shelf the camera reaches mounts at once, before or after the reveal.
  useEffect(() => {
    unitContentResidency.mount(nearUnits(useStacks.getState().activeUnit));
    return useStacks.subscribe((state, previous) => {
      if (state.activeUnit !== previous.activeUnit)
        unitContentResidency.mount(nearUnits(state.activeUnit));
    });
  }, []);

  // A capture switched on after mount wants the whole room.
  useEffect(() => {
    const check = () => {
      if (screenshotModeController.getSnapshot().enabled)
        unitContentResidency.mountAll();
    };
    check();
    const unsubscribe = screenshotModeController.subscribe(check);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    let timeout = 0;
    let idle = 0;
    let frame = 0;
    let pendingUpload: number | null = null;
    const idleApi = window as Window & {
      requestIdleCallback?: Window["requestIdleCallback"];
      cancelIdleCallback?: Window["cancelIdleCallback"];
    };

    const later = (run: () => void, ms = 250) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(run, ms);
    };

    const step = () => {
      if (cancelled) return;
      // Wait out travel and any batch still loading, including the one the
      // previous promotion started.
      if (scenePrewarmDeferred() || !assetsSettled()) {
        later(step);
        return;
      }
      if (pendingUpload !== null) {
        // Scene.tsx names each unit root `room-unit:<index>`.
        const root = scene.getObjectByName(`room-unit:${pendingUpload}`);
        pendingUpload = null;
        if (root) {
          try {
            uploadUnitTextures(gl, root);
          } catch {
            // Warming is an optimization; the first draw uploads anyway.
          }
        }
      }
      const next = unitContentResidency.next(useStacks.getState().activeUnit);
      if (next === null) return;
      const mountNext = () => {
        if (cancelled) return;
        if (scenePrewarmDeferred()) {
          later(step);
          return;
        }
        unitContentResidency.mount([next]);
        pendingUpload = next;
        // Let React commit the shelf and its loaders register before the
        // settled check runs again.
        frame = requestAnimationFrame(() => later(step, 100));
      };
      if (idleApi.requestIdleCallback)
        idle = idleApi.requestIdleCallback(mountNext, { timeout: 1000 });
      else later(mountNext, 50);
    };

    const start = () => {
      if (started || cancelled) return;
      started = true;
      // One batch for every compact model, before the shelves that use them.
      preloadModels();
      later(step, 100);
    };

    const observe = () => {
      const { status } = worldBoot.getState();
      if (status === "live" || unitContentResidency.allMounted()) start();
    };
    observe();
    const unsubscribe = worldBoot.subscribe(observe);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
      if (idle && idleApi.cancelIdleCallback) idleApi.cancelIdleCallback(idle);
    };
  }, [gl, scene]);

  return null;
}
