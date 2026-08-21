import type { SceneFrameConstraint, SceneQualityMetrics } from "./quality";
import type { SceneQualityAxes } from "./qualityAxes";

export const SCENE_QUALITY_SAMPLE_EVIDENCE_LIMIT = 1_024;
export const SCENE_QUALITY_LIFECYCLE_EVIDENCE_LIMIT = 64;

export type SceneQualitySampleEvidence = Readonly<{
  at: number;
  instrumented: boolean;
  visible: boolean;
  focused: boolean;
  usable: boolean;
  moving: boolean;
  constraint: SceneFrameConstraint;
  axes: SceneQualityAxes;
  metrics: SceneQualityMetrics;
  renderer: Readonly<{
    programs: number | null;
    textures: number | null;
    geometries: number | null;
  }>;
}>;

export type SceneQualityPageLifecycleType =
  | "visibility-visible"
  | "visibility-hidden"
  | "window-focus"
  | "window-blur"
  | "pageshow"
  | "pagehide"
  | "freeze"
  | "resume";

export type SceneQualityPageLifecycleEvidence = Readonly<{
  at: number;
  type: SceneQualityPageLifecycleType;
  persisted: boolean | null;
}>;

export type SceneQualityEvidenceSnapshot = Readonly<{
  samples: readonly SceneQualitySampleEvidence[];
  lifecycle: readonly SceneQualityPageLifecycleEvidence[];
}>;

type EvidenceLimits = Readonly<{
  sampleLimit: number;
  lifecycleLimit: number;
}>;

const copySample = (
  sample: SceneQualitySampleEvidence,
): SceneQualitySampleEvidence => ({
  ...sample,
  axes: { ...sample.axes },
  metrics: { ...sample.metrics },
  renderer: { ...sample.renderer },
});

const copyLifecycle = (
  event: SceneQualityPageLifecycleEvidence,
): SceneQualityPageLifecycleEvidence => ({ ...event });

function appendBounded<T>(values: T[], value: T, limit: number) {
  values.push(value);
  const excess = values.length - limit;
  if (excess > 0) values.splice(0, excess);
}

/** Keeps enough production evidence to separate a browser lifecycle pause,
 * renderer-resource change, and ordinary quality response without mounting
 * the performance trace observers. */
export class SceneQualityEvidence {
  private readonly limits: EvidenceLimits;
  private readonly samples: SceneQualitySampleEvidence[] = [];
  private readonly lifecycle: SceneQualityPageLifecycleEvidence[] = [];

  constructor(
    limits: EvidenceLimits = {
      sampleLimit: SCENE_QUALITY_SAMPLE_EVIDENCE_LIMIT,
      lifecycleLimit: SCENE_QUALITY_LIFECYCLE_EVIDENCE_LIMIT,
    },
  ) {
    this.limits = limits;
  }

  recordSample(sample: SceneQualitySampleEvidence) {
    appendBounded(this.samples, copySample(sample), this.limits.sampleLimit);
  }

  recordLifecycle(event: SceneQualityPageLifecycleEvidence) {
    appendBounded(
      this.lifecycle,
      copyLifecycle(event),
      this.limits.lifecycleLimit,
    );
  }

  snapshot(): SceneQualityEvidenceSnapshot {
    return {
      samples: this.samples.map(copySample),
      lifecycle: this.lifecycle.map(copyLifecycle),
    };
  }

  reset() {
    this.samples.length = 0;
    this.lifecycle.length = 0;
  }
}

export const sceneQualityEvidence = new SceneQualityEvidence();
