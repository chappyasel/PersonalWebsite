export type PhysicsReasonCode =
  | "geometry-pending"
  | "authored-fallback"
  | "held-safe"
  | "blocked-static"
  | "blocked-dynamic"
  | "cross-unit-contact"
  | "compound-budget-fallback"
  | "static-budget-truncated";

export type PhysicsModuleState = "idle" | "loading" | "ready" | "failed";

export type PhysicsDiagnosticEvent = {
  at: number;
  code: PhysicsReasonCode;
  handle?: string;
  detail?: string;
};

export type PhysicsRuntimeSettings = {
  simulation: boolean;
  heldCollisionProbes: boolean;
  generatedStatics: boolean;
  visibilityResets: boolean;
};

export type PhysicsTiming = {
  frameMs: number;
  stepMs: number;
  peakMs: number;
};

export type PhysicsDiagnosticsSnapshot = {
  moduleState: PhysicsModuleState;
  activeWorld: string | null;
  plane: "top" | "lower" | "floor" | null;
  authoredSurface: "top" | "lower" | "floor" | null;
  broadphase: string | null;
  gravity: number;
  geometryRevision: string | null;
  rootGeometry: Array<{
    root: string;
    revision: string;
    staticCount: number;
  }>;
  readyHandles: string[];
  pendingHandles: string[];
  bodyCount: number;
  staticCount: number;
  hullFallbacks: Array<{ handle: string; code: PhysicsReasonCode }>;
  phase: string | null;
  sleepState: string | null;
  requestedReleaseSpeed: number | null;
  acceptedReleaseSpeed: number | null;
  visibilityResetState: string | null;
  lastBlocker: string | null;
  showHelpers: boolean;
  showAllBounds: boolean;
  runtime: PhysicsRuntimeSettings;
  timing: PhysicsTiming;
  helpers: {
    desired: [number, number, number] | null;
    accepted: [number, number, number] | null;
    lastSafe: [number, number, number] | null;
    velocity: [number, number, number];
    contacts: [number, number, number][];
    normals: Array<{
      origin: [number, number, number];
      direction: [number, number, number];
    }>;
    hulls: Array<{
      position: [number, number, number];
      quaternion: [number, number, number, number];
      halfExtents: [number, number, number];
    }>;
  };
  events: PhysicsDiagnosticEvent[];
};

const INITIAL: PhysicsDiagnosticsSnapshot = {
  moduleState: "idle",
  activeWorld: null,
  plane: null,
  authoredSurface: null,
  broadphase: null,
  gravity: 9.81,
  geometryRevision: null,
  rootGeometry: [],
  readyHandles: [],
  pendingHandles: [],
  bodyCount: 0,
  staticCount: 0,
  hullFallbacks: [],
  phase: null,
  sleepState: null,
  requestedReleaseSpeed: null,
  acceptedReleaseSpeed: null,
  visibilityResetState: null,
  lastBlocker: null,
  showHelpers: false,
  showAllBounds: false,
  runtime: {
    simulation: true,
    heldCollisionProbes: true,
    generatedStatics: true,
    visibilityResets: true,
  },
  timing: {
    frameMs: 0,
    stepMs: 0,
    peakMs: 0,
  },
  helpers: {
    desired: null,
    accepted: null,
    lastSafe: null,
    velocity: [0, 0, 0],
    contacts: [],
    normals: [],
    hulls: [],
  },
  events: [],
};

export function physicsDiagnosticsEnabled(environment = process.env.NODE_ENV) {
  return environment !== "production";
}

export class PhysicsDiagnosticsController {
  private snapshot: PhysicsDiagnosticsSnapshot = INITIAL;
  private listeners = new Set<() => void>();

  readonly getSnapshot = () => this.snapshot;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  update(patch: Partial<PhysicsDiagnosticsSnapshot>) {
    if (!physicsDiagnosticsEnabled()) return;
    if (
      Object.entries(patch).every(([key, value]) =>
        Object.is(
          this.snapshot[key as keyof PhysicsDiagnosticsSnapshot],
          value,
        ),
      )
    )
      return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  publish(event: Omit<PhysicsDiagnosticEvent, "at">) {
    if (!physicsDiagnosticsEnabled()) return;
    this.update({
      events: [...this.snapshot.events, { ...event, at: Date.now() }].slice(
        -24,
      ),
    });
  }

  reset() {
    this.snapshot = INITIAL;
    for (const listener of this.listeners) listener();
  }
}

export const physicsDiagnosticsController = new PhysicsDiagnosticsController();
