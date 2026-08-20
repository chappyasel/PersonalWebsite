import {
  SCENE_DROPPED_FRAME_MULTIPLIER,
  SCENE_FRAME_BUDGET_MS,
} from "./frameBudget";
import type { DurableQualityRung, QualityTransitionReason } from "./quality";

export type QualityTransition = {
  at: number;
  from: DurableQualityRung;
  to: DurableQualityRung;
  reason: QualityTransitionReason;
};

export type FrameSummary = {
  active: boolean;
  count: number;
  elapsedMs: number;
  fps: number | null;
  refreshHz: number | null;
  frameMs: { p50: number; p95: number; p99: number } | null;
  droppedFrameRatio: number | null;
  transitions: QualityTransition[];
};

const percentile = (sorted: readonly number[], amount: number) => {
  if (!sorted.length) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * amount) - 1),
  );
  return sorted[index]!;
};

export class ScenePerformanceSampler {
  private active = false;
  private startedAt = 0;
  private stoppedAt = 0;
  private frames: number[] = [];
  private transitions: QualityTransition[] = [];

  start(now = performance.now()) {
    this.active = true;
    this.startedAt = now;
    this.stoppedAt = 0;
    this.frames = [];
    this.transitions = [];
  }

  stop(now = performance.now()) {
    this.active = false;
    this.stoppedAt = now;
  }

  reset() {
    this.active = false;
    this.startedAt = 0;
    this.stoppedAt = 0;
    this.frames = [];
    this.transitions = [];
  }

  frame(deltaSeconds: number) {
    if (!this.active || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0)
      return;
    this.frames.push(deltaSeconds * 1000);
    // Five minutes at 120 Hz is ample for a bounded manual trace.
    if (this.frames.length > 36_000) this.frames.shift();
  }

  transition(value: QualityTransition) {
    if (this.active) this.transitions.push(value);
  }

  summary(now = performance.now()): FrameSummary {
    const sorted = [...this.frames].sort((a, b) => a - b);
    const end = this.active ? now : this.stoppedAt || now;
    const elapsedMs = this.startedAt ? Math.max(0, end - this.startedAt) : 0;
    if (!sorted.length) {
      return {
        active: this.active,
        count: 0,
        elapsedMs,
        fps: null,
        refreshHz: null,
        frameMs: null,
        droppedFrameRatio: null,
        transitions: [...this.transitions],
      };
    }
    // The 10th percentile filters occasional long frames while estimating the
    // display cadence. Clamp to common browser refresh limits.
    //
    // This is the one place an observed percentile is still allowed, because
    // it answers "what is this display's refresh rate", which can only be
    // learned by looking. It reports `refreshHz` and nothing else: a device
    // must never get to define what counts as a dropped frame, which is the
    // defect that made a steady 40 Hz read as healthy.
    const cadenceMs = Math.min(
      16.667,
      Math.max(8.333, percentile(sorted, 0.1)),
    );
    const dropped = sorted.filter(
      (ms) => ms > SCENE_FRAME_BUDGET_MS * SCENE_DROPPED_FRAME_MULTIPLIER,
    ).length;
    const totalFrameMs = sorted.reduce((sum, ms) => sum + ms, 0);
    return {
      active: this.active,
      count: sorted.length,
      elapsedMs,
      fps: Number(((sorted.length * 1000) / totalFrameMs).toFixed(2)),
      refreshHz: Math.round(1000 / cadenceMs),
      frameMs: {
        p50: Number(percentile(sorted, 0.5).toFixed(3)),
        p95: Number(percentile(sorted, 0.95).toFixed(3)),
        p99: Number(percentile(sorted, 0.99).toFixed(3)),
      },
      droppedFrameRatio: Number((dropped / sorted.length).toFixed(4)),
      transitions: [...this.transitions],
    };
  }
}
