import type { SceneQualityEvidenceSnapshot } from "./qualityEvidence";

export const SCENE_QUALITY_LOG_SCHEMA_VERSION = 2;

export type SceneQualityLog = Readonly<{
  schema: "stacks-quality-log";
  version: typeof SCENE_QUALITY_LOG_SCHEMA_VERSION;
  generatedAt: string;
  elapsedMs: number;
  visibility: DocumentVisibilityState;
  queryFlags: readonly string[];
  viewport: Readonly<{
    width: number;
    height: number;
    deviceDpr: number;
  }>;
  device: Readonly<{
    userAgent: string;
    platform: string;
    hardwareConcurrency: number | null;
    deviceMemoryGb: number | null;
  }>;
  renderer: Readonly<{
    maxTextureSize: number | null;
    maxSamples: number | null;
    unmaskedRenderer: string | null;
  }>;
  evidence: SceneQualityEvidenceSnapshot;
  quality: Readonly<Record<string, unknown>>;
}>;

type SceneQualityLogInput = Omit<
  SceneQualityLog,
  "schema" | "version" | "queryFlags" | "quality"
> &
  Readonly<{
    queryFlags: readonly string[];
    quality: Readonly<Record<string, unknown>>;
  }>;

/** Build a stable support artifact without retaining URL values. Query keys
 * identify test switches while avoiding accidental tokens or private values. */
export function createSceneQualityLog(
  input: SceneQualityLogInput,
): SceneQualityLog {
  return {
    schema: "stacks-quality-log",
    version: SCENE_QUALITY_LOG_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    elapsedMs: input.elapsedMs,
    visibility: input.visibility,
    queryFlags: [...input.queryFlags],
    viewport: { ...input.viewport },
    device: { ...input.device },
    renderer: { ...input.renderer },
    evidence: {
      samples: input.evidence.samples.map((sample) => ({
        ...sample,
        axes: { ...sample.axes },
        metrics: { ...sample.metrics },
        renderer: { ...sample.renderer },
      })),
      lifecycle: input.evidence.lifecycle.map((event) => ({ ...event })),
    },
    quality: { ...input.quality },
  };
}

export function sceneQualityLogFilename(generatedAt: string) {
  return `stacks-quality-${generatedAt.replace(/[:.]/g, "-")}.json`;
}

export function downloadSceneQualityLog(log: SceneQualityLog) {
  const blob = new Blob([JSON.stringify(log, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sceneQualityLogFilename(log.generatedAt);
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
