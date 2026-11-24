"use client";

// Which shelves have their contents mounted.
//
// The boot reveal waits for every asset the loading manager has seen. With
// all seven shelves mounted at boot, that meant every shelf's models,
// textures, and photos had to arrive and decode before the arrival shelf
// could show, in 8 to 10 consecutive batches (docs/plans/room-boot-speed.md).
// Before the room is live, only the arrival shelf and its neighbours mount
// their contents, so the gate waits on those alone. Once the room is live the
// rest mount one at a time, nearest first, each after the previous batch has
// settled and outside travel. A shelf the camera comes near mounts at once.
// Mounted shelves never unmount.
//
// The unit root group stays mounted throughout: activity, physics, and insect
// collision register against it, and pick up late children on their own
// schedules (physics at grab time, insects on their index refresh).
import { UNIT_COUNT, initialScenePositionFromLocation } from "../data";
import { worldBoot } from "../boot/worldBootSession";
import { useStacks } from "../store";
import { useProgress } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useSyncExternalStore } from "react";
import * as THREE from "three";

import { assetLoadComplete } from "../boot/worldBootMachine";
import { preloadModels } from "./ModelProp";
import { scenePrewarmDeferred } from "./scenePerformance";
import { screenshotModeController } from "./screenshotMode";

/** The arrival shelf and its neighbours, clamped to the room. */
export function nearUnits(active: number, count = UNIT_COUNT): number[] {
  const center = Math.min(count - 1, Math.max(0, Math.round(active)));
  return [center - 1, center, center + 1].filter(
    (index) => index >= 0 && index < count,
  );
}

/** The unmounted shelf nearest the camera, ties broken toward the right
 * (the direction a first visit travels). Null once every shelf is mounted. */
export function nextUnitToMount(
  mounted: ReadonlySet<number>,
  active: number,
  count = UNIT_COUNT,
): number | null {
  let best: number | null = null;
  let bestDistance = Infinity;
  for (let index = 0; index < count; index++) {
    if (mounted.has(index)) continue;
    const distance = Math.abs(index - active);
    if (
      distance < bestDistance ||
      (distance === bestDistance && best !== null && index > best)
    ) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

/** Deferral is for a visitor's boot. Captures and the measurement harness
 * expect the whole room on their first ready frame, and `?units=all` restores
 * the old whole-room boot for a before-and-after measurement. */
export function unitContentDeferralAllowed(search: string): boolean {
  const params = new URLSearchParams(search);
  return (
    !params.has("screenshot") &&
    !params.has("harness") &&
    params.get("units") !== "all"
  );
}

/** The shelf this visit arrives on. RoomNavigation writes a deep link's
 * position into the store in an effect, after the scene's first render, so
 * the URL answers until it has. */
function arrivalUnit(): number {
  const { activeUnit } = useStacks.getState();
  if (activeUnit !== 0) return activeUnit;
  return Math.round(
    initialScenePositionFromLocation(
      window.location.pathname,
      window.location.hash,
    ),
  );
}

class UnitContentResidency {
  private mounted: Set<number> | null = null;
  private readonly listeners = new Set<() => void>();

  private ensure(): Set<number> {
    if (this.mounted) return this.mounted;
    const deferral =
      typeof window !== "undefined" &&
      unitContentDeferralAllowed(window.location.search) &&
      !screenshotModeController.getSnapshot().enabled;
    this.mounted = new Set(
      deferral
        ? nearUnits(arrivalUnit())
        : Array.from({ length: UNIT_COUNT }, (_, index) => index),
    );
    return this.mounted;
  }

  readonly isMounted = (index: number) => this.ensure().has(index);

  allMounted() {
    return this.ensure().size >= UNIT_COUNT;
  }

  mount(indexes: readonly number[]) {
    const mounted = this.ensure();
    let changed = false;
    for (const index of indexes) {
      if (index < 0 || index >= UNIT_COUNT || mounted.has(index)) continue;
      mounted.add(index);
      changed = true;
    }
    if (changed) for (const listener of this.listeners) listener();
  }

  mountAll() {
    this.mount(Array.from({ length: UNIT_COUNT }, (_, index) => index));
  }

  next(active: number) {
    return nextUnitToMount(this.ensure(), active);
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const unitContentResidency = new UnitContentResidency();

export function useUnitContentMounted(index: number): boolean {
  return useSyncExternalStore(
    unitContentResidency.subscribe,
    () => unitContentResidency.isMounted(index),
    () => true,
  );
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
      const next = unitContentResidency.next(
        useStacks.getState().activeUnit,
      );
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
