"use client";

import { isWorldRevealed, worldBoot } from "../boot/worldBootSession";
import { useStacks } from "../store";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import * as THREE from "three";

import { getSceneInteraction } from "./interactionRegistry";
import { meadowDiagnosticsController } from "./meadowDiagnostics";
import { MEADOW_WIND, sampleMeadowWind } from "./meadowMotion";
import {
  type PlantKind,
  createPlantWindBinding,
  createPlantWindClock,
  stepPlantWindClock,
} from "./plantWind";
import { plantWindDiagnosticsController } from "./plantWindDiagnostics";
import { useUnitFrame } from "./unitActivity";

export type PlantWindOptions = {
  kind: PlantKind;
  unitIndex: number;
  hoverKey?: string;
};

/** The disabled path mounts no frame subscriber and allocates no geometry. */
export function PlantWind({
  object,
  options,
}: {
  object: THREE.Object3D;
  options: PlantWindOptions;
}) {
  const enabled = useSyncExternalStore(
    plantWindDiagnosticsController.subscribe,
    plantWindDiagnosticsController.getSnapshot,
    () => false,
  );
  return enabled ? <ActivePlantWind object={object} options={options} /> : null;
}

function ActivePlantWind({
  object,
  options,
}: {
  object: THREE.Object3D;
  options: PlantWindOptions;
}) {
  const binding = useRef<ReturnType<typeof createPlantWindBinding> | null>(
    null,
  );
  const motion = useRef(createPlantWindClock());
  const reduced = useRef(false);
  const worldPosition = useRef(new THREE.Vector3());
  const worldRotation = useRef(new THREE.Quaternion());
  const wind = useRef(new THREE.Vector3());
  const { kind, unitIndex, hoverKey } = options;
  useLayoutEffect(() => {
    const meshes: THREE.Mesh[] = [];
    object.traverse((node) => {
      if (node instanceof THREE.Mesh) meshes.push(node as THREE.Mesh);
    });
    if (meshes.length !== 1) return;
    try {
      binding.current = createPlantWindBinding(meshes[0]!, object, kind);
      const m = motion.current;
      binding.current.update(
        m.time,
        m.windX,
        m.windZ,
        m.ramp * m.ramp * (3 - 2 * m.ramp),
      );
    } catch (error) {
      console.warn(
        "[stacks] Plant wind left the unrecognized model at rest",
        error,
      );
    }
    return () => {
      binding.current?.dispose();
      binding.current = null;
    };
  }, [object, kind]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const resetIfNeeded = () => {
      reduced.current = media.matches;
      const view = worldBoot.getView();
      if (
        media.matches ||
        view.status !== "live" ||
        view.epoch !== motion.current.epoch
      ) {
        Object.assign(motion.current, createPlantWindClock(), {
          epoch: view.epoch,
        });
        binding.current?.restore();
      }
    };
    resetIfNeeded();
    media.addEventListener("change", resetIfNeeded);
    const unsubscribe = worldBoot.subscribe(resetIfNeeded);
    return () => {
      media.removeEventListener("change", resetIfNeeded);
      unsubscribe();
    };
  }, []);
  useUnitFrame(({ clock }, delta) => {
    const b = binding.current;
    if (!b) return;
    const view = worldBoot.getView();
    const state = useStacks.getState();
    const carrier = hoverKey ? getSceneInteraction(hoverKey)?.root : undefined;
    const handled = Boolean(
      hoverKey &&
        (state.dragging === hoverKey ||
          (carrier &&
            carrier.quaternion.x ** 2 +
              carrier.quaternion.y ** 2 +
              carrier.quaternion.z ** 2 >
              0.02 ** 2)),
    );
    const meadow = meadowDiagnosticsController.getSnapshot();
    const active = stepPlantWindClock(motion.current, {
      epoch: view.epoch,
      live: view.status === "live",
      reduced: reduced.current,
      paused:
        !isWorldRevealed() ||
        state.modalOpen ||
        document.hidden ||
        Math.abs(state.activeUnit - unitIndex) > 1 ||
        handled,
      delta,
      speed: meadow.speed / MEADOW_WIND.speed,
    });
    if (!active) {
      if (motion.current.ramp === 0) b.restore();
      return;
    }
    object.getWorldPosition(worldPosition.current);
    object.getWorldQuaternion(worldRotation.current).invert();
    const breeze = sampleMeadowWind(
      worldPosition.current.x,
      worldPosition.current.z,
      clock.elapsedTime,
      meadow.wind,
      meadow.speed,
    );
    wind.current
      .set(breeze.x, 0, breeze.z)
      .applyQuaternion(worldRotation.current);
    const m = motion.current;
    const blend = 1 - Math.exp(-2.5 * Math.min(delta, 1 / 30));
    m.windX += (wind.current.x - m.windX) * blend;
    m.windZ += (wind.current.z - m.windZ) * blend;
    b.update(m.time, m.windX, m.windZ, m.ramp * m.ramp * (3 - 2 * m.ramp));
  });
  return null;
}
