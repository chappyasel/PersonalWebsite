export type PerformanceTraceSession = Record<string, unknown>;

export type PerformanceTraceRenderer = Readonly<{
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  textures: number;
  geometries: number;
  programs: number;
}>;

export type PerformanceTraceFrame = Readonly<{
  at: number;
  frameMs: number;
  moving: boolean;
  progress: number;
  activeUnit: number;
  renderer: PerformanceTraceRenderer | null;
  physicsMs: number | null;
  cameraYawDeg: number | null;
  cameraLookLagX: number | null;
  visibleUnits: readonly number[];
  qualityProfile?: string | null;
  dpr?: number | null;
  glassMode?: string | null;
  unitActivity?: readonly string[];
  unitWorkExecuted?: number;
  unitWorkSkipped?: number;
}>;

export type PerformanceTraceEvent = Readonly<{
  at: number;
  type: string;
  detail?: Record<string, unknown>;
}>;

export type PerformanceTraceLongTask = Readonly<{
  at: number;
  durationMs: number;
}>;

export type PerformanceTraceLongAnimationFrame = Readonly<{
  at: number;
  durationMs: number;
  blockingDurationMs: number;
  renderStart: number | null;
  styleAndLayoutStart: number | null;
  scripts: readonly Readonly<{
    name: string;
    source: string;
    durationMs: number;
    forcedStyleAndLayoutMs: number;
  }>[];
}>;

export type PerformanceTraceReactCommit = Readonly<{
  at: number;
  id: string;
  phase: string;
  durationMs: number;
  baseDurationMs?: number;
}>;

export type PerformanceTraceResource = Readonly<{
  at: number;
  durationMs: number;
  name: string;
  initiatorType: string;
  transferSize: number;
}>;

type FrameDistribution = Readonly<{
  count: number;
  fps: number | null;
  droppedFrameRatio: number;
  frameMs: Readonly<{
    p50: number;
    p95: number;
    p99: number;
    max: number;
  }>;
}>;

export type PerformanceTraceSignal =
  | "travel"
  | "long-task"
  | "long-animation-frame"
  | "react-commit"
  | "resource-load"
  | "program-count-change"
  | "texture-count-change"
  | "render-load-change"
  | "physics-cost"
  | "quality-transition";

export type PerformanceTraceSpike = Readonly<{
  startAt: number;
  endAt: number;
  durationMs: number;
  maxFrameMs: number;
  moving: boolean;
  progress: readonly [number, number];
  activeUnits: readonly number[];
  visibleUnits: readonly number[];
  cameraYawDeg: readonly [number, number] | null;
  cameraLookLagX: readonly [number, number] | null;
  signals: readonly PerformanceTraceSignal[];
}>;

export type PerformanceTraceReport = Readonly<{
  version: 3;
  startedAt: number | null;
  stoppedAt: number | null;
  truncated: boolean;
  session: PerformanceTraceSession;
  summary: Readonly<{
    targetFrameMs: number;
    all: FrameDistribution;
    settled: FrameDistribution;
    travel: FrameDistribution;
    travelToSettledP95Ratio: number | null;
  }>;
  spikes: readonly PerformanceTraceSpike[];
  frames: readonly PerformanceTraceFrame[];
  events: readonly PerformanceTraceEvent[];
  longTasks: readonly PerformanceTraceLongTask[];
  longAnimationFrames: readonly PerformanceTraceLongAnimationFrame[];
  reactCommits: readonly PerformanceTraceReactCommit[];
  resources: readonly PerformanceTraceResource[];
}>;

export type PerformanceTraceStatus = Readonly<{
  active: boolean;
  hasReport: boolean;
  startedAt: number | null;
  stoppedAt: number | null;
}>;

const EMPTY_DISTRIBUTION: FrameDistribution = {
  count: 0,
  fps: null,
  droppedFrameRatio: 0,
  frameMs: { p50: 0, p95: 0, p99: 0, max: 0 },
};

function percentile(sorted: readonly number[], amount: number) {
  if (!sorted.length) return 0;
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * amount) - 1)
  ]!;
}

function rounded(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function distribution(
  frames: readonly PerformanceTraceFrame[],
  targetFrameMs: number,
): FrameDistribution {
  if (!frames.length) return EMPTY_DISTRIBUTION;
  const sorted = frames.map(({ frameMs }) => frameMs).sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: frames.length,
    fps: rounded((frames.length * 1_000) / total, 2),
    droppedFrameRatio: rounded(
      sorted.filter((value) => value > targetFrameMs * 1.5).length /
        sorted.length,
      4,
    ),
    frameMs: {
      p50: rounded(percentile(sorted, 0.5)),
      p95: rounded(percentile(sorted, 0.95)),
      p99: rounded(percentile(sorted, 0.99)),
      max: rounded(sorted.at(-1) ?? 0),
    },
  };
}

function overlaps(at: number, durationMs: number, start: number, end: number) {
  return at <= end && at + durationMs >= start;
}

function rendererChanged(
  frames: readonly PerformanceTraceFrame[],
  field: keyof PerformanceTraceRenderer,
) {
  const values = frames
    .map(({ renderer }) => renderer?.[field])
    .filter((value): value is number => value != null);
  return values.length > 1 && Math.min(...values) !== Math.max(...values);
}

function median(values: readonly number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Composer render targets can make texture memory oscillate briefly without
 * any upload or retained allocation. Compare robust leading/trailing samples
 * so only a persistent step is reported as a texture change. */
function rendererPersistentStep(
  frames: readonly PerformanceTraceFrame[],
  field: keyof PerformanceTraceRenderer,
  minimumDelta: number,
) {
  if (frames.length < 2) return false;
  const sampleSize = Math.max(1, Math.floor(frames.length / 4));
  const leading = frames
    .slice(0, sampleSize)
    .map(({ renderer }) => renderer?.[field])
    .filter((value): value is number => value != null);
  const trailing = frames
    .slice(-sampleSize)
    .map(({ renderer }) => renderer?.[field])
    .filter((value): value is number => value != null);
  return Math.abs(median(trailing) - median(leading)) >= minimumDelta;
}

function pushBounded<T>(values: T[], value: T, maximum: number) {
  values.push(value);
  if (values.length > maximum) values.splice(0, values.length - maximum);
}

export class ScenePerformanceTrace {
  private readonly maxFrames: number;
  private readonly maxAuxiliaryEntries: number;
  private frameBuffer: Array<PerformanceTraceFrame | undefined>;
  private frameCount = 0;
  private frameWriteIndex = 0;
  private active = false;
  private truncated = false;
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private session: PerformanceTraceSession = {};
  private events: PerformanceTraceEvent[] = [];
  private longTasks: PerformanceTraceLongTask[] = [];
  private longAnimationFrames: PerformanceTraceLongAnimationFrame[] = [];
  private reactCommits: PerformanceTraceReactCommit[] = [];
  private resources: PerformanceTraceResource[] = [];
  private listeners = new Set<() => void>();
  private status: PerformanceTraceStatus = {
    active: false,
    hasReport: false,
    startedAt: null,
    stoppedAt: null,
  };

  constructor({
    maxFrames = 36_000,
    maxAuxiliaryEntries = 1_000,
  }: {
    maxFrames?: number;
    maxAuxiliaryEntries?: number;
  } = {}) {
    this.maxFrames = Math.max(1, maxFrames);
    this.maxAuxiliaryEntries = Math.max(1, maxAuxiliaryEntries);
    this.frameBuffer = new Array<PerformanceTraceFrame | undefined>(
      this.maxFrames,
    );
  }

  readonly getStatus = () => this.status;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  isActive() {
    return this.active;
  }

  start({
    now = performance.now(),
    session,
  }: {
    now?: number;
    session: PerformanceTraceSession;
  }) {
    this.frameBuffer = new Array<PerformanceTraceFrame | undefined>(
      this.maxFrames,
    );
    this.frameCount = 0;
    this.frameWriteIndex = 0;
    this.events = [];
    this.longTasks = [];
    this.longAnimationFrames = [];
    this.reactCommits = [];
    this.resources = [];
    this.active = true;
    this.truncated = false;
    this.startedAt = now;
    this.stoppedAt = null;
    this.session = session;
    this.publishStatus();
  }

  stop({ now = performance.now() }: { now?: number } = {}) {
    if (!this.active) return this.report();
    this.active = false;
    this.stoppedAt = now;
    this.publishStatus();
    return this.report();
  }

  reset() {
    this.active = false;
    this.frameBuffer = new Array<PerformanceTraceFrame | undefined>(
      this.maxFrames,
    );
    this.frameCount = 0;
    this.frameWriteIndex = 0;
    this.events = [];
    this.longTasks = [];
    this.longAnimationFrames = [];
    this.reactCommits = [];
    this.resources = [];
    this.truncated = false;
    this.startedAt = null;
    this.stoppedAt = null;
    this.session = {};
    this.publishStatus();
  }

  frame(frame: PerformanceTraceFrame) {
    if (!this.active || !Number.isFinite(frame.frameMs) || frame.frameMs <= 0)
      return;
    this.frameBuffer[this.frameWriteIndex] = frame;
    this.frameWriteIndex = (this.frameWriteIndex + 1) % this.maxFrames;
    if (this.frameCount < this.maxFrames) this.frameCount += 1;
    else this.truncated = true;
  }

  event(event: PerformanceTraceEvent) {
    if (!this.active) return;
    pushBounded(this.events, event, this.maxAuxiliaryEntries);
  }

  longTask(task: PerformanceTraceLongTask) {
    if (!this.active) return;
    pushBounded(this.longTasks, task, this.maxAuxiliaryEntries);
  }

  longAnimationFrame(frame: PerformanceTraceLongAnimationFrame) {
    if (!this.active) return;
    pushBounded(this.longAnimationFrames, frame, this.maxAuxiliaryEntries);
  }

  reactCommit(commit: PerformanceTraceReactCommit) {
    if (!this.active) return;
    pushBounded(this.reactCommits, commit, this.maxAuxiliaryEntries);
  }

  resource(resource: PerformanceTraceResource) {
    if (!this.active) return;
    pushBounded(this.resources, resource, this.maxAuxiliaryEntries);
  }

  report(): PerformanceTraceReport {
    const frames = this.orderedFrames();
    const cadence = frames.map(({ frameMs }) => frameMs).sort((a, b) => a - b);
    const targetFrameMs = rounded(
      Math.min(16.667, Math.max(8.333, percentile(cadence, 0.1) || 16.667)),
    );
    const settledFrames = frames.filter(({ moving }) => !moving);
    const travelFrames = frames.filter(({ moving }) => moving);
    const settled = distribution(settledFrames, targetFrameMs);
    const travel = distribution(travelFrames, targetFrameMs);
    return {
      version: 3,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      truncated: this.truncated,
      session: this.session,
      summary: {
        targetFrameMs,
        all: distribution(frames, targetFrameMs),
        settled,
        travel,
        travelToSettledP95Ratio:
          travel.count && settled.count && settled.frameMs.p95 > 0
            ? rounded(travel.frameMs.p95 / settled.frameMs.p95, 2)
            : null,
      },
      spikes: this.spikes(frames, targetFrameMs),
      frames,
      events: [...this.events],
      longTasks: [...this.longTasks],
      longAnimationFrames: [...this.longAnimationFrames],
      reactCommits: [...this.reactCommits],
      resources: [...this.resources],
    };
  }

  private orderedFrames() {
    if (this.frameCount < this.maxFrames)
      return this.frameBuffer.slice(0, this.frameCount).filter(isPresent);
    return [
      ...this.frameBuffer.slice(this.frameWriteIndex),
      ...this.frameBuffer.slice(0, this.frameWriteIndex),
    ].filter(isPresent);
  }

  private spikes(
    frames: readonly PerformanceTraceFrame[],
    targetFrameMs: number,
  ) {
    const threshold = Math.max(25, targetFrameMs * 1.5);
    const groups: PerformanceTraceFrame[][] = [];
    for (const frame of frames) {
      if (frame.frameMs <= threshold) continue;
      const current = groups.at(-1);
      if (!current || frame.at - current.at(-1)!.at > 150) groups.push([frame]);
      else current.push(frame);
    }
    return groups
      .map((group) => this.describeSpike(group, frames))
      .sort((left, right) => right.maxFrameMs - left.maxFrameMs)
      .slice(0, 40);
  }

  private describeSpike(
    group: readonly PerformanceTraceFrame[],
    allFrames: readonly PerformanceTraceFrame[],
  ) {
    const first = group[0]!;
    const last = group.at(-1)!;
    const start = first.at - first.frameMs;
    const end = last.at;
    // A compile/upload stall is often a single bad frame whose new renderer
    // counts are already stable by the time that frame is recorded. Compare
    // it with a short preceding baseline instead of looking only inside the
    // slow group.
    const rendererContext = allFrames.filter(
      ({ at }) => at >= start - 250 && at <= end,
    );
    const signals = new Set<PerformanceTraceSignal>();
    if (group.some(({ moving }) => moving)) signals.add("travel");
    if (
      this.longTasks.some(({ at, durationMs }) =>
        overlaps(at, durationMs, start, end),
      )
    )
      signals.add("long-task");
    if (
      this.longAnimationFrames.some(({ at, durationMs }) =>
        overlaps(at, durationMs, start, end),
      )
    )
      signals.add("long-animation-frame");
    if (
      this.reactCommits.some(({ at, durationMs }) =>
        overlaps(at, durationMs, start, end),
      )
    )
      signals.add("react-commit");
    if (
      this.resources.some(({ at, durationMs }) =>
        overlaps(at, durationMs, start, end),
      )
    )
      signals.add("resource-load");
    if (rendererChanged(rendererContext, "programs"))
      signals.add("program-count-change");
    if (rendererPersistentStep(rendererContext, "textures", 2))
      signals.add("texture-count-change");
    if (
      rendererChanged(rendererContext, "calls") ||
      rendererChanged(rendererContext, "triangles") ||
      rendererChanged(rendererContext, "geometries")
    )
      signals.add("render-load-change");
    if (group.some(({ physicsMs }) => (physicsMs ?? 0) >= 4))
      signals.add("physics-cost");
    if (
      this.events.some(
        ({ at, type }) =>
          at >= start && at <= end && type === "quality-transition",
      )
    )
      signals.add("quality-transition");
    return {
      startAt: rounded(start),
      endAt: rounded(end),
      durationMs: rounded(end - start),
      maxFrameMs: rounded(Math.max(...group.map(({ frameMs }) => frameMs))),
      moving: group.some(({ moving }) => moving),
      progress: [
        rounded(Math.min(...group.map(({ progress }) => progress)), 5),
        rounded(Math.max(...group.map(({ progress }) => progress)), 5),
      ] as const,
      activeUnits: [...new Set(group.map(({ activeUnit }) => activeUnit))],
      visibleUnits: [
        ...new Set(group.flatMap(({ visibleUnits }) => visibleUnits)),
      ].sort((left, right) => left - right),
      cameraYawDeg: finiteRange(group.map(({ cameraYawDeg }) => cameraYawDeg)),
      cameraLookLagX: finiteRange(
        group.map(({ cameraLookLagX }) => cameraLookLagX),
      ),
      signals: [...signals],
    } satisfies PerformanceTraceSpike;
  }

  private publishStatus() {
    this.status = {
      active: this.active,
      hasReport: this.frameCount > 0,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
    };
    for (const listener of this.listeners) listener();
  }
}

function isPresent<T>(value: T | undefined): value is T {
  return value != null;
}

function finiteRange(values: readonly (number | null)[]) {
  const finite = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return finite.length
    ? ([rounded(Math.min(...finite)), rounded(Math.max(...finite))] as const)
    : null;
}

export const scenePerformanceTrace = new ScenePerformanceTrace();

export function browserPerformanceTraceSession(
  extra: PerformanceTraceSession = {},
): PerformanceTraceSession {
  if (typeof window === "undefined") return extra;
  const navigatorWithMemory = navigator as Navigator & {
    deviceMemory?: number;
  };
  const connection = (
    navigator as Navigator & {
      connection?: { effectiveType?: string; downlink?: number };
    }
  ).connection;
  return {
    capturedAt: new Date().toISOString(),
    viewport: [window.innerWidth, window.innerHeight],
    deviceDpr: window.devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: navigatorWithMemory.deviceMemory ?? null,
    connection: connection
      ? {
          effectiveType: connection.effectiveType ?? null,
          downlinkMbps: connection.downlink ?? null,
        }
      : null,
    userAgent: navigator.userAgent,
    performanceEntryTypes:
      typeof PerformanceObserver === "undefined"
        ? []
        : PerformanceObserver.supportedEntryTypes,
    ...extra,
  };
}

export function downloadPerformanceTrace(report: PerformanceTraceReport) {
  if (typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stacks-performance-${new Date().toISOString().replaceAll(":", "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function resourceName(value: string) {
  try {
    const url = new URL(value, window.location.href);
    return `${url.origin === window.location.origin ? "" : url.origin}${url.pathname}`;
  } catch {
    return value.split("?")[0] ?? value;
  }
}

export function observeBrowserPerformanceTrace() {
  if (typeof PerformanceObserver === "undefined")
    return () => {
      // No browser performance timeline is available in this environment.
    };
  const observers: PerformanceObserver[] = [];
  const observe = (
    type: string,
    callback: (entry: PerformanceEntry) => void,
  ) => {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) callback(entry);
      });
      observer.observe({ type, buffered: false });
      observers.push(observer);
    } catch {
      // Unsupported entry types are expected across Safari/Firefox/Chromium.
    }
  };
  observe("longtask", (entry) =>
    scenePerformanceTrace.longTask({
      at: entry.startTime,
      durationMs: rounded(entry.duration),
    }),
  );
  observe("long-animation-frame", (entry) => {
    const animationFrame = entry as PerformanceEntry & {
      blockingDuration?: number;
      renderStart?: number;
      styleAndLayoutStart?: number;
      scripts?: Array<{
        name?: string;
        invoker?: string;
        sourceURL?: string;
        duration?: number;
        forcedStyleAndLayoutDuration?: number;
      }>;
    };
    scenePerformanceTrace.longAnimationFrame({
      at: animationFrame.startTime,
      durationMs: rounded(animationFrame.duration),
      blockingDurationMs: rounded(animationFrame.blockingDuration ?? 0),
      renderStart: Number.isFinite(animationFrame.renderStart)
        ? rounded(animationFrame.renderStart!)
        : null,
      styleAndLayoutStart: Number.isFinite(animationFrame.styleAndLayoutStart)
        ? rounded(animationFrame.styleAndLayoutStart!)
        : null,
      scripts: (animationFrame.scripts ?? []).map((script) => ({
        name: script.name ?? script.invoker ?? "unknown",
        source: script.sourceURL ? resourceName(script.sourceURL) : "",
        durationMs: rounded(script.duration ?? 0),
        forcedStyleAndLayoutMs: rounded(
          script.forcedStyleAndLayoutDuration ?? 0,
        ),
      })),
    });
  });
  observe("resource", (entry) => {
    const resource = entry as PerformanceResourceTiming;
    scenePerformanceTrace.resource({
      at: resource.startTime,
      durationMs: rounded(resource.duration),
      name: resourceName(resource.name),
      initiatorType: resource.initiatorType,
      transferSize: resource.transferSize,
    });
  });
  return () => {
    for (const observer of observers) observer.disconnect();
  };
}
