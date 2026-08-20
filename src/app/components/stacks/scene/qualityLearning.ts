import {
  SCENE_CONTENT_TIERS,
  SCENE_EFFECTS_TIERS,
  type SceneContentTier,
  type SceneEffectsTier,
  type SceneQualityProfile,
  qualityProfileFromValue,
} from "./quality";
import {
  SCENE_RESOLUTION_MAX_STEP,
  type SceneQualityAxes,
} from "./qualityAxes";

// Cross-visit quality memory.
//
// WHY THIS MOVED OFF SESSION STORAGE. Learning was written per tab session, so
// a returning visitor re-learned their device from scratch every visit and
// watched the ratchet happen again. The bucket key already combines a format
// version, the renderer capability classification and a coarse pixel bucket,
// so it was always safe to persist more durably; only the store was wrong.
//
// WHY IT STORES AXES RATHER THAN A PROFILE NAME. Automatic mode no longer
// stands at a profile. Recording the name would round a three-axis position
// to the nearest preset and hand back something the controller never chose.
//
// The stored entry is a STARTING POINT, never a floor or a ceiling. The
// controller has to stay free to move in both directions from it, because the
// device that was thermally throttled last visit may not be this visit.

export type LearnedQuality = Readonly<{
  resolutionStep: number;
  effects: SceneEffectsTier;
  content: SceneContentTier;
  /** Kept for the diagnostics overlay and for scripts that still speak in
   * preset names. Not what the controller restores from. */
  profile: SceneQualityProfile | null;
}>;

/**
 * Persistent storage, or null where it is unavailable.
 *
 * Private browsing, disabled cookies and storage quota all surface as a throw
 * from the property access itself, not only from the read. A storage failure
 * must never become a rendering failure, so every path here degrades learning
 * to off rather than propagating.
 */
function store(): Storage | null {
  try {
    const candidate = window.localStorage;
    // Touch it: some browsers expose the object and throw only on use.
    const probe = "stacks-quality:probe";
    candidate.setItem(probe, "1");
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
}

export function learningAvailable() {
  return store() !== null;
}

const isEffectsTier = (value: unknown): value is SceneEffectsTier =>
  typeof value === "string" &&
  (SCENE_EFFECTS_TIERS as readonly string[]).includes(value);

const isContentTier = (value: unknown): value is SceneContentTier =>
  typeof value === "string" &&
  (SCENE_CONTENT_TIERS as readonly string[]).includes(value);

export function readLearnedQuality(bucket: string): LearnedQuality | null {
  const storage = store();
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(bucket);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // An entry written by an older policy as a bare profile name. The bucket
    // key carries the format version, so anything unreadable here is a bug
    // rather than a migration, and the safe answer is to ignore it.
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const record = parsed as Record<string, unknown>;
  if (!isEffectsTier(record.effects) || !isContentTier(record.content))
    return null;
  const step = record.resolutionStep;
  if (typeof step !== "number" || !Number.isFinite(step)) return null;

  return {
    resolutionStep: Math.min(SCENE_RESOLUTION_MAX_STEP, Math.max(0, step)),
    effects: record.effects,
    content: record.content,
    profile:
      typeof record.profile === "string"
        ? qualityProfileFromValue(record.profile)
        : null,
  };
}

export function writeLearnedQuality(
  bucket: string,
  axes: SceneQualityAxes,
  profile: SceneQualityProfile | null,
) {
  const storage = store();
  if (!storage) return;
  try {
    // Overwrite rather than accumulate. The format version, not an expiry
    // date, is what invalidates a stale entry.
    storage.setItem(
      bucket,
      JSON.stringify({
        resolutionStep: axes.resolutionStep,
        effects: axes.effects,
        content: axes.content,
        profile,
      }),
    );
  } catch {
    // Quota or private browsing. Learning is an optimisation, not a feature.
  }
}

export function clearLearnedQuality(bucket: string) {
  const storage = store();
  if (!storage) return;
  try {
    storage.removeItem(bucket);
  } catch {
    // Nothing to do; the entry is already unreachable.
  }
}
