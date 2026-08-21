import { QUALITY_PERSIST_STABLE_MS } from "./quality";
import type { SceneQualityAxisState } from "./qualityAxes";

export type SceneQualityPersistenceState = Pick<
  SceneQualityAxisState,
  | "axisChangedAt"
  | "booted"
  | "foregroundReadyAt"
  | "pendingBaseline"
  | "preTravelStep"
  | "settledAt"
  | "travelling"
  | "validation"
>;

export type SceneQualityPersistenceReason =
  | "ready"
  | "stabilizing"
  | "manual"
  | "hidden"
  | "samples-unusable"
  | "composer-error"
  | "not-booted"
  | "foreground-validation"
  | "travelling"
  | "travel-debt"
  | "transition-pending"
  | "unvalidated";

export type SceneQualityPersistenceGates = Readonly<{
  automatic: boolean;
  documentVisible: boolean;
  samplesUsable: boolean;
  composerHealthy: boolean;
  sceneTravelling: boolean;
}>;

export type SceneQualityPersistenceStatus = Readonly<{
  eligible: boolean;
  readyAt: number | null;
  reason: SceneQualityPersistenceReason;
}>;

/** One owner for both persistence scheduling and its eventual HUD status. */
export function sceneQualityPersistenceStatus(
  state: SceneQualityPersistenceState,
  gates: SceneQualityPersistenceGates,
  now: number,
): SceneQualityPersistenceStatus {
  const blocked = (
    reason: Exclude<SceneQualityPersistenceReason, "ready" | "stabilizing">,
  ): SceneQualityPersistenceStatus => ({
    eligible: false,
    readyAt: null,
    reason,
  });

  if (!gates.automatic) return blocked("manual");
  if (!gates.documentVisible) return blocked("hidden");
  if (!gates.samplesUsable) return blocked("samples-unusable");
  if (!gates.composerHealthy) return blocked("composer-error");
  if (!state.booted) return blocked("not-booted");
  if (state.foregroundReadyAt == null) return blocked("foreground-validation");
  if (state.travelling || gates.sceneTravelling) return blocked("travelling");
  if (state.preTravelStep != null) return blocked("travel-debt");
  if (state.pendingBaseline != null) return blocked("transition-pending");

  const stableAt = Math.max(
    state.foregroundReadyAt,
    state.settledAt ?? -Infinity,
    state.axisChangedAt.resolution,
    state.axisChangedAt.effects,
    state.axisChangedAt.content,
  );
  if (state.validation == null || state.validation.at < stableAt)
    return blocked("unvalidated");

  const readyAt =
    Math.max(stableAt, state.validation.at) + QUALITY_PERSIST_STABLE_MS;
  return {
    eligible: now >= readyAt,
    readyAt,
    reason: now >= readyAt ? "ready" : "stabilizing",
  };
}
