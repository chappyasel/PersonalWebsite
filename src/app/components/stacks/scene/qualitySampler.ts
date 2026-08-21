import {
  QUALITY_SAMPLE_INTERVAL_MS,
  QUALITY_SAMPLE_WINDOW_MS,
  type SceneQualityMetrics,
  summariseSceneFrameWindow,
} from "./quality";

export type SceneQualitySamplerFrame = Readonly<{
  now: number;
  frameMs: number;
  cpuMs: number;
  instrumented: boolean;
  visible: boolean;
}>;

export type SceneQualitySamplerResult = Readonly<{
  metrics: SceneQualityMetrics;
  instrumented: boolean;
}>;

type RetainedFrame = Readonly<{
  at: number;
  ms: number;
  cpuMs: number;
  instrumented: boolean;
}>;

/**
 * The production quality sampler without React or renderer dependencies.
 *
 * Renderer CPU timing belongs to the previously submitted frame. A foreground
 * resume therefore drops two combined samples: the first can contain the
 * pre-suspension cost and the second closes that one-frame lag without mixing
 * either value into a new decision window.
 */
export function createSceneQualitySampler({
  now,
  visible,
}: Readonly<{ now: number; visible: boolean }>) {
  let documentVisible = visible;
  let frames: RetainedFrame[] = [];
  let lastSampleAt = now;
  let resumeFramesToDiscard = 0;

  const clear = (at: number, discardLaggingCpuFrames: boolean) => {
    frames = [];
    lastSampleAt = at;
    resumeFramesToDiscard = discardLaggingCpuFrames ? 2 : 0;
  };

  return {
    setDocumentVisible(nextVisible: boolean, at: number) {
      documentVisible = nextVisible;
      clear(at, nextVisible);
    },

    /** A persisted pageshow is a resume even if visibility never changed. */
    resume(at: number) {
      documentVisible = true;
      clear(at, true);
    },

    push(frame: SceneQualitySamplerFrame): SceneQualitySamplerResult | null {
      if (frame.visible !== documentVisible) {
        documentVisible = frame.visible;
        clear(frame.now, frame.visible);
      }
      if (!documentVisible) return null;

      if (resumeFramesToDiscard > 0) {
        resumeFramesToDiscard -= 1;
        return null;
      }

      if (
        Number.isFinite(frame.frameMs) &&
        frame.frameMs > 0 &&
        frame.frameMs < 1_000
      )
        frames.push({
          at: frame.now,
          ms: frame.frameMs,
          cpuMs: frame.cpuMs,
          instrumented: frame.instrumented,
        });

      while (
        frames.length > 0 &&
        frame.now - frames[0]!.at > QUALITY_SAMPLE_WINDOW_MS
      )
        frames.shift();

      if (frame.now - lastSampleAt < QUALITY_SAMPLE_INTERVAL_MS) return null;
      lastSampleAt = frame.now;
      const metrics = summariseSceneFrameWindow(frames);
      if (!metrics) return null;
      return {
        metrics: {
          ...metrics,
          windowMs: frames.at(-1)!.at - frames[0]!.at,
        },
        instrumented: frames.some((retained) => retained.instrumented),
      };
    },
  };
}
