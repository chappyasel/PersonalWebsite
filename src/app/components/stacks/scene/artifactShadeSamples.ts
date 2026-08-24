"use client";

// Where the measured per-print shade lives between the render loop that
// takes it and the DOM preview that wears it.
//
// Split from `artifactShadeProbe.ts` on purpose: the probe needs three, the
// preview must not. Keeping the store free of that import is what lets the
// modal chunk read a sample without pulling the renderer in behind it.
import { useSyncExternalStore } from "react";

/** The correction that turns the true photo into the print as the room
 * renders it, factored so CSS can apply it: a scalar `brightness` (which may
 * exceed 1, which is why a multiply layer cannot carry it alone) and a `tint`
 * whose channels are all <= 1 so a multiply layer CAN carry it. */
export type ArtifactShadeSample = {
  brightness: number;
  tint: readonly [number, number, number];
};

type ShadeMap = ReadonlyMap<string, ArtifactShadeSample>;

const EMPTY: ShadeMap = new Map();

let samples: ShadeMap = EMPTY;
const listeners = new Set<() => void>();

export function publishArtifactShadeSample(
  artifact: string,
  sample: ArtifactShadeSample | null,
) {
  if (!sample && !samples.has(artifact)) return;
  const next = new Map(samples);
  if (sample) next.set(artifact, sample);
  else next.delete(artifact);
  samples = next;
  for (const listener of listeners) listener();
}

export function artifactShadeSamples(): ShadeMap {
  return samples;
}

export function subscribeArtifactShadeSamples(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Snapshot map rather than a version counter, so the memo that reads it can
 * depend on a value React can compare. */
export function useArtifactShadeSamples(): ShadeMap {
  return useSyncExternalStore(
    subscribeArtifactShadeSamples,
    artifactShadeSamples,
    () => EMPTY,
  );
}

/** Test seam. */
export function resetArtifactShadeSamples() {
  samples = EMPTY;
}
