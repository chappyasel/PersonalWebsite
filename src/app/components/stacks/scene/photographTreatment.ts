"use client";

import { useSyncExternalStore } from "react";
import * as THREE from "three";

export type PhotographTreatmentSnapshot = Readonly<{
  /** Keep display-referred photographs out of the room's chroma rebuild. */
  chromaProtection: boolean;
  /** Multiplies each print's authored warm-tint strength. */
  warmthMultiplier: number;
  /** Texture-space contrast applied only to photographs. */
  contrast: number;
}>;

export const DEFAULT_PHOTOGRAPH_TREATMENT: PhotographTreatmentSnapshot =
  Object.freeze({
    chromaProtection: true,
    warmthMultiplier: 1,
    contrast: 0,
  });

export const PHOTOGRAPH_TREATMENT_LIMITS = Object.freeze({
  warmthMultiplier: Object.freeze({ min: 0, max: 3 }),
  contrast: Object.freeze({ min: -1, max: 1 }),
});

/** Clone sampler state for one print while retaining its decoded image. */
export function clonePhotographTexture(source: THREE.Texture): THREE.Texture {
  const clone = source.clone();
  const isolatedSource = new THREE.Source(source.image);
  isolatedSource.dataReady = source.source.dataReady;
  clone.source = isolatedSource;
  return clone;
}

/** Session-only photograph controls. The small interface keeps texture
 * preparation and the composer mask on one shared interpretation of the
 * current treatment. */
class PhotographTreatmentController {
  private snapshot = DEFAULT_PHOTOGRAPH_TREATMENT;
  private listeners = new Set<() => void>();

  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch: Partial<PhotographTreatmentSnapshot>) {
    const clamp = (
      value: number,
      limits: Readonly<{ min: number; max: number }>,
      fallback: number,
    ) =>
      Number.isFinite(value)
        ? Math.min(limits.max, Math.max(limits.min, value))
        : fallback;
    const next: PhotographTreatmentSnapshot = {
      chromaProtection:
        patch.chromaProtection ?? this.snapshot.chromaProtection,
      warmthMultiplier: clamp(
        patch.warmthMultiplier ?? this.snapshot.warmthMultiplier,
        PHOTOGRAPH_TREATMENT_LIMITS.warmthMultiplier,
        this.snapshot.warmthMultiplier,
      ),
      contrast: clamp(
        patch.contrast ?? this.snapshot.contrast,
        PHOTOGRAPH_TREATMENT_LIMITS.contrast,
        this.snapshot.contrast,
      ),
    };
    if (
      next.chromaProtection === this.snapshot.chromaProtection &&
      next.warmthMultiplier === this.snapshot.warmthMultiplier &&
      next.contrast === this.snapshot.contrast
    )
      return;
    this.snapshot = next;
    for (const listener of this.listeners) listener();
  }

  reset() {
    if (this.snapshot === DEFAULT_PHOTOGRAPH_TREATMENT) return;
    this.snapshot = DEFAULT_PHOTOGRAPH_TREATMENT;
    for (const listener of this.listeners) listener();
  }
}

export const photographTreatmentController =
  new PhotographTreatmentController();

export function usePhotographTreatment() {
  return useSyncExternalStore(
    photographTreatmentController.subscribe,
    photographTreatmentController.getSnapshot,
    photographTreatmentController.getSnapshot,
  );
}
