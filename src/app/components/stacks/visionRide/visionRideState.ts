export type VisionRidePhase =
  | "idle"
  | "donning"
  | "cruising"
  | "doffing"
  | "returning";

export type VisionRideExitMethod = "button" | "escape" | "disabled" | "error";

export type VisionRideAssetStatus = "idle" | "loading" | "ready" | "failed";

export function visionRideActive(phase: VisionRidePhase) {
  return phase !== "idle";
}

/**
 * Whether the Homepage room is mounted at all. It stays up through the
 * donning flight (the headset leaves a visible shelf), is gone for the
 * ride, and is back for the return, whose first frames sit under an opaque
 * curtain so the remount is never seen.
 */
export function visionRideRoomMounted(phase: VisionRidePhase) {
  return phase === "idle" || phase === "donning" || phase === "returning";
}

export function mayBeginVisionRide(input: {
  phase: VisionRidePhase;
  enabled: boolean;
  failed: boolean;
}) {
  return input.phase === "idle" && input.enabled && !input.failed;
}

export function visionRidePhaseAfterExitRequest(
  phase: VisionRidePhase,
): VisionRidePhase {
  if (phase === "idle" || phase === "returning" || phase === "doffing")
    return phase;
  return "doffing";
}
