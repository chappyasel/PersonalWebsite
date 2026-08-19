type PerchOverlayState = Readonly<{
  showEnvelopes: boolean;
  showRoutes: boolean;
  showFlightVolumes: boolean;
  showFlightTrails: boolean;
  showLampCones: boolean;
  showMothTrails: boolean;
}>;

type PhysicsOverlayState = Readonly<{
  showHelpers: boolean;
  showAllBounds: boolean;
}>;

const PERCH_OVERLAY_KEYS = [
  "showEnvelopes",
  "showRoutes",
  "showFlightVolumes",
  "showFlightTrails",
  "showLampCones",
  "showMothTrails",
] as const;

const PHYSICS_OVERLAY_KEYS = ["showHelpers", "showAllBounds"] as const;

/** A renderer-independent summary for the shared development toolbar. */
export function sceneDebugOverlayState(
  perches: PerchOverlayState,
  physics: PhysicsOverlayState,
) {
  const values = [
    ...PERCH_OVERLAY_KEYS.map((key) => perches[key]),
    ...PHYSICS_OVERLAY_KEYS.map((key) => physics[key]),
  ];
  const enabled = values.filter(Boolean).length;
  return {
    enabled,
    total: values.length,
    any: enabled > 0,
    all: enabled === values.length,
  };
}

/** Only visual overlays belong to the quick toggle. Runtime behavior remains
 * untouched so hiding diagnostics cannot silently change the scene. */
export function sceneDebugOverlayPatches(enabled: boolean): {
  perches: PerchOverlayState;
  physics: PhysicsOverlayState;
} {
  return {
    perches: {
      showEnvelopes: enabled,
      showRoutes: enabled,
      showFlightVolumes: enabled,
      showFlightTrails: enabled,
      showLampCones: enabled,
      showMothTrails: enabled,
    },
    physics: {
      showHelpers: enabled,
      showAllBounds: enabled,
    },
  };
}
