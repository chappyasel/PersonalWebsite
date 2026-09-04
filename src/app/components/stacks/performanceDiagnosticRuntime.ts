export const PERFORMANCE_DIAGNOSTIC_RUNTIME_CHECKPOINT_MS = 5_000;
export const PERFORMANCE_DIAGNOSTIC_RUNTIME_MS = 15_000;
export const PERFORMANCE_DIAGNOSTIC_MAX_RUNTIME_MS = 45_000;
export const PERFORMANCE_DIAGNOSTIC_MAX_RUNTIME_CHECKPOINTS = 4;

export type PerformanceDiagnosticProgress = Readonly<{
  started: boolean;
  paused: boolean;
  observedMs: number;
  remainingMs: number | null;
}>;

export function performanceDiagnosticPageHideAction(persisted: boolean) {
  return persisted ? ("checkpoint" as const) : ("finish" as const);
}

export function performanceDiagnosticSchedule({
  finished,
  runtime,
  capture,
  checkpointCount,
}: {
  finished: boolean;
  runtime: ReturnType<PerformanceDiagnosticRuntimeWindow["snapshot"]>;
  capture: PerformanceDiagnosticProgress;
  checkpointCount: number;
}) {
  if (finished)
    return {
      checkpointInMs: null,
      completionInMs: null,
      deadlineInMs: null,
      progressActive: false,
    };
  const runtimeVisible = runtime.started && !runtime.paused;
  return {
    checkpointInMs:
      runtimeVisible &&
      checkpointCount < PERFORMANCE_DIAGNOSTIC_MAX_RUNTIME_CHECKPOINTS
        ? runtime.checkpointRemainingMs
        : null,
    completionInMs: runtimeVisible ? runtime.remainingMs : null,
    deadlineInMs: capture.paused ? null : capture.remainingMs,
    progressActive: runtimeVisible,
  };
}

const IDLE_PROGRESS: PerformanceDiagnosticProgress = {
  started: false,
  paused: false,
  observedMs: 0,
  remainingMs: null,
};

class PerformanceDiagnosticProgressController {
  private snapshot: PerformanceDiagnosticProgress = IDLE_PROGRESS;
  private readonly listeners = new Set<() => void>();

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  publish(snapshot: PerformanceDiagnosticProgress) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }

  reset() {
    this.publish(IDLE_PROGRESS);
  }
}

/** Counts visible time toward one diagnostic deadline. */
export class PerformanceDiagnosticVisibleClock {
  private observed = 0;
  private visibleSince: number | null = null;
  private started = false;

  constructor(private readonly durationMs: number) {}

  start(now: number, visible: boolean) {
    if (this.started) return;
    this.started = true;
    this.visibleSince = visible ? now : null;
  }

  setVisible(visible: boolean, now: number) {
    if (!this.started) return;
    if (!visible && this.visibleSince !== null) {
      this.observed += Math.max(0, now - this.visibleSince);
      this.visibleSince = null;
      return;
    }
    if (visible && this.visibleSince === null) this.visibleSince = now;
  }

  snapshot(now: number): PerformanceDiagnosticProgress {
    const observedMs = this.started
      ? this.observed +
        (this.visibleSince === null ? 0 : Math.max(0, now - this.visibleSince))
      : 0;
    return {
      started: this.started,
      paused: this.started && this.visibleSince === null,
      observedMs,
      remainingMs: this.started
        ? Math.max(0, this.durationMs - observedMs)
        : null,
    };
  }
}

export class PerformanceDiagnosticRuntimeWindow {
  private readonly clock = new PerformanceDiagnosticVisibleClock(
    PERFORMANCE_DIAGNOSTIC_RUNTIME_MS,
  );
  private checkpointSent = false;

  start(now: number, visible: boolean) {
    this.clock.start(now, visible);
  }

  setVisible(visible: boolean, now: number) {
    this.clock.setVisible(visible, now);
  }

  markCheckpointSent() {
    this.checkpointSent = true;
  }

  snapshot(now: number): PerformanceDiagnosticProgress & {
    checkpointSent: boolean;
    checkpointRemainingMs: number | null;
  } {
    const progress = this.clock.snapshot(now);
    return {
      ...progress,
      checkpointSent: this.checkpointSent,
      checkpointRemainingMs:
        progress.started && !this.checkpointSent
          ? Math.max(
              0,
              PERFORMANCE_DIAGNOSTIC_RUNTIME_CHECKPOINT_MS -
                progress.observedMs,
            )
          : null,
    };
  }
}

export const performanceDiagnosticProgress =
  new PerformanceDiagnosticProgressController();
