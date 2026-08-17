export type GolfShotOutcome =
  | "hole-bound"
  | "near-miss"
  | "ordinary-green"
  | "rare-miss";

export type GolfBallPhase =
  | "ready"
  | "queued"
  | "addressed"
  | "flight"
  | "bounce"
  | "roll"
  | "cup"
  | "fading-out"
  | "resetting"
  | "fading-in";

export type GolfSurface = "green" | "fringe" | "rough";

export type GolfVec3 = { x: number; y: number; z: number };

export type GolfBallId = "one" | "two" | "three" | "four";

export type GolfBallState = {
  id: GolfBallId;
  phase: GolfBallPhase;
  position: GolfVec3;
  velocity: GolfVec3;
  angularVelocity: GolfVec3;
  start: GolfVec3;
  radius: number;
  opacity: number;
  outcome: GolfShotOutcome | null;
  age: number;
  stillFor: number;
  resetAge: number;
  impacts: number;
  holed: boolean;
};

export type GolfSurfaceSample = {
  height: number;
  normal: GolfVec3;
  surface: GolfSurface;
};

export type GolfPhysicsEvent =
  | { type: "first-impact"; ballId: GolfBallId; position: GolfVec3 }
  | { type: "flagstick"; ballId: GolfBallId; position: GolfVec3 }
  | { type: "ball-contact"; ballId: GolfBallId; position: GolfVec3 }
  | { type: "cup"; ballId: GolfBallId; position: GolfVec3 }
  | { type: "reset"; ballId: GolfBallId; holed: boolean };

export type GolfResetState = {
  fadeOutSeconds: number;
  hiddenSeconds: number;
  fadeInSeconds: number;
  stillSeconds: number;
  escapeSeconds: number;
};
