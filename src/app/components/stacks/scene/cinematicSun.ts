"use client";

import { useSyncExternalStore } from "react";
import type * as THREE from "three";

type Listener = () => void;

let cinematicSun: THREE.Mesh | null = null;
const listeners = new Set<Listener>();

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return cinematicSun;
}

/**
 * Bridges the scene-owned light source into the composer without keeping the
 * mesh alive when Cinematic+ is off. The returned cleanup is identity-safe so
 * a retiring source cannot clear a newer one during a rapid quality change.
 */
export function registerCinematicSun(sun: THREE.Mesh) {
  cinematicSun = sun;
  listeners.forEach((listener) => listener());
  return () => {
    if (cinematicSun !== sun) return;
    cinematicSun = null;
    listeners.forEach((listener) => listener());
  };
}

export function useCinematicSun() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
