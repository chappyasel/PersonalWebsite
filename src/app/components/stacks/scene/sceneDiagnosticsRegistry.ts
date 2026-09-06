import {
  type VisionRideFinishPreview,
  type VisionRideScenePreview,
  visionRideDiagnosticsController,
} from "../visionRide/visionRideDiagnostics";

import { universalSearchVisualEffects } from "~/lib/universal-search/visualEffects";

import { artifactPreviewVisualEffects } from "./artifactPreviewVisualEffects";
import { cameraDepthDiagnosticsController } from "./cameraDepthDiagnostics";
import { coordinationGlobeDiagnosticsController } from "./coordinationGlobeDiagnostics";
import { freeRoamDiagnosticsController } from "./freeRoamDiagnostics";
import { insectDiagnosticsController } from "./insectPerchDiagnostic";
import { lighthouseBeaconDiagnosticsController } from "./lighthouseBeaconDiagnostics";
import { meadowDiagnosticsController } from "./meadowDiagnostics";
import { MEADOW_WIND } from "./meadowMotion";
import { modelArtifactDiagnosticsController } from "./modelArtifactDiagnostics";
import { PERFORMANCE_PROFILE_PRESENTATION } from "./performanceProfilePresentation";
import {
  PERFORMANCE_PROFILE_IDS,
  PERFORMANCE_PROFILE_PARAM,
  type PerformanceProfileId,
  performanceProfileController,
} from "./performanceProfiles";
import {
  DEFAULT_PHOTOGRAPH_TREATMENT,
  PHOTOGRAPH_TREATMENT_LIMITS,
  photographTreatmentController,
} from "./photographTreatment";
import { physicsDiagnosticsController } from "./physicsDiagnostics";
import {
  DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MAX,
  DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MIN,
  DEPTH_OF_FIELD_RESOLUTION_SCALE_MAX,
  DEPTH_OF_FIELD_RESOLUTION_SCALE_MIN,
} from "./quality";
import { SCENE_RESOLUTION_MAX_STEP } from "./qualityAxes";
import { sceneDiagnosticsRuntime } from "./sceneDiagnosticsRuntime";
import {
  HUE_BANDS,
  HUE_BAND_IDENTITY,
  type HueBand,
  type HueBandAdjust,
  SCENE_GRADE_PROFILES,
  SCENE_GRADE_PROFILE_DEFAULT,
  type SceneDevelopSliderKey,
  type SceneGradeProfileId,
  activeGradeTheme,
  sceneGradeProfileController,
  sceneGradeProfileValues,
} from "./sceneGradeProfiles";
import {
  DEFAULT_SCENE_PERFORMANCE_SETTINGS,
  type ScenePerformanceBooleanSetting,
  type ScenePerformanceSettings,
  scenePerformanceController,
} from "./scenePerformance";
import {
  type DepthOfFieldModel,
  OPTICAL_DEPTH_OF_FIELD_DEFAULTS,
  OPTICAL_DEPTH_OF_FIELD_LIMITS,
  type OpticalDepthOfFieldTuning,
  sceneQualityController,
} from "./sceneQualityController";
import {
  SCREENSHOT_DOLLY_MAX,
  SCREENSHOT_DOLLY_MIN,
  SCREENSHOT_DOLLY_STEP,
  SCREENSHOT_FOV_MAX,
  SCREENSHOT_FOV_MIN,
  SCREENSHOT_GRASS_LIFT_MAX,
  SCREENSHOT_GRASS_MAX,
  SCREENSHOT_GRASS_STEP,
  SCREENSHOT_MODE_DEFAULT,
  screenshotModeController,
} from "./screenshotMode";
import { visionProDisplayDiagnosticsController } from "./visionProDisplayDiagnostics";

export type SceneDiagnosticsPanel = "render" | "simulate" | "inspect";
export type DiagnosticControlValue = boolean | number | string | null;

export type DiagnosticAllowedValues =
  | Readonly<{
      kind: "set";
      values: readonly Readonly<{
        value: DiagnosticControlValue;
        label: string;
        optionGroup?: string;
      }>[];
    }>
  | Readonly<{
      kind: "range";
      min: number;
      max: number;
      /** UI increment only; programmatic updates accept any in-range value. */
      step: number;
      unit?: string;
      decimals: number;
      automatic?: Readonly<{
        value: null;
        label: string;
      }>;
    }>;

export type DiagnosticProductionCost = Readonly<{
  activeValues: readonly DiagnosticControlValue[];
  enabled: string;
  offPath: Readonly<{
    renderTargetAllocations: number;
    textureSamples: number;
    perFrameWork: boolean;
  }>;
}>;

export type DiagnosticControlDescriptor = Readonly<{
  id: string;
  panel: SceneDiagnosticsPanel;
  group: string;
  subgroup?: string;
  label: string;
  help: string;
  inputId?: string;
  ariaKeyShortcuts?: string;
  valueKind: "boolean" | "enum" | "range";
  allowedValues: DiagnosticAllowedValues;
  defaultValue: DiagnosticControlValue;
  experimental: boolean;
  experimentalValues?: readonly DiagnosticControlValue[];
  behavior: Readonly<{
    read: "live" | "effective";
    update: "session-only" | "read-only";
    reset: "reload";
  }>;
  performanceSetting?: keyof ScenePerformanceSettings;
  reloadInput?: string;
  productionCost?: DiagnosticProductionCost;
  optimizationPreset?: Readonly<{
    optimized: DiagnosticControlValue;
    unoptimized: DiagnosticControlValue;
  }>;
}>;

export type DiagnosticControlState = Readonly<{
  value: DiagnosticControlValue;
  disabled: boolean;
}>;

export type DiagnosticRegistrySnapshot = Readonly<
  Record<string, DiagnosticControlState>
>;

export type DiagnosticControlGroup = Readonly<{
  id: string;
  panel: SceneDiagnosticsPanel;
  label: string;
  controls: readonly DiagnosticControlDescriptor[];
}>;

type Listener = () => void;
export type DiagnosticRegistryStore = Readonly<{
  subscribe: (listener: Listener) => () => void;
}>;
export type DiagnosticRegistryEntry = DiagnosticControlDescriptor &
  Readonly<{
    store: DiagnosticRegistryStore;
    read: () => DiagnosticControlValue;
    update?: (value: DiagnosticControlValue) => void;
    disabled?: () => boolean;
  }>;

type MutableDescriptor = DiagnosticRegistryEntry;

const BOOLEAN_VALUES = Object.freeze({
  kind: "set" as const,
  values: Object.freeze([
    Object.freeze({ value: false, label: "Off" }),
    Object.freeze({ value: true, label: "On" }),
  ]),
});

// In the order the Scene console shows them: the things a debugging session
// reaches for first come first.
const SECTION_DEFINITIONS = Object.freeze([
  { id: "simulate.camera", panel: "simulate", label: "Camera" },
  { id: "simulate.physics", panel: "simulate", label: "Physics runtime" },
  { id: "simulate.meadow", panel: "simulate", label: "Meadow wind" },
  { id: "simulate.insects", panel: "simulate", label: "Insect behavior" },
  {
    id: "simulate.vision",
    panel: "simulate",
    label: "Vision Pro and Vision Ride",
  },
  { id: "render.quality", panel: "render", label: "Quality mode" },
  { id: "render.resolution", panel: "render", label: "Resolution" },
  {
    id: "render.lens",
    panel: "render",
    label: "Lens and depth of field",
  },
  { id: "render.grade", panel: "render", label: "Color grade" },
  {
    id: "render.photographs",
    panel: "render",
    label: "Photograph treatment",
  },
  {
    id: "render.passes",
    panel: "render",
    label: "Post-processing passes",
  },
  {
    id: "render.scene-effects",
    panel: "render",
    label: "Scene effects and materials",
  },
  { id: "render.optimizations", panel: "render", label: "Optimizations" },
  { id: "render.scheduling", panel: "render", label: "Scheduling" },
  { id: "render.screenshot", panel: "render", label: "Screenshot" },
  { id: "render.profile", panel: "render", label: "Test profile" },
  { id: "inspect.scope", panel: "inspect", label: "Inspection scope" },
  { id: "inspect.overlays", panel: "inspect", label: "Scene overlays" },
] satisfies readonly Readonly<{
  id: string;
  panel: SceneDiagnosticsPanel;
  label: string;
}>[]);

const SUBGROUP_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "grade.mixer": "Color mixer",
  "lens.optical": "Optical depth of field",
  "overlay.perches": "Perches and butterflies",
  "overlay.moths": "Moths",
  "overlay.physics": "Physics",
  "physics.motion": "Motion",
  "physics.collision": "Collision",
});

const DEFAULT_CAMERA = cameraDepthDiagnosticsController.getSnapshot();
const DEFAULT_COORDINATION =
  coordinationGlobeDiagnosticsController.getSnapshot();
const DEFAULT_FREE_ROAM = freeRoamDiagnosticsController.getSnapshot();
const DEFAULT_INSECTS = insectDiagnosticsController.getSnapshot();
const DEFAULT_LIGHTHOUSE = lighthouseBeaconDiagnosticsController.getSnapshot();
const DEFAULT_MEADOW = meadowDiagnosticsController.getSnapshot();
const DEFAULT_PHYSICS = physicsDiagnosticsController.getSnapshot();
const DEFAULT_QUALITY = sceneQualityController.getSnapshot();
const resolvedMeadowStore: DiagnosticRegistryStore = {
  subscribe: (listener) => {
    const stopPerformance = scenePerformanceController.subscribe(listener);
    const stopQuality = sceneQualityController.subscribeRuntime(listener);
    return () => {
      stopPerformance();
      stopQuality();
    };
  },
};

const readResolvedMeadow = () => {
  const settings = scenePerformanceController.getSnapshot();
  if (scenePerformanceController.isOverridden("meadow")) return settings.meadow;
  return (
    sceneQualityController.getRuntimeSnapshot()?.plan.environment.meadow ??
    settings.meadow
  );
};

function booleanDescriptor(
  descriptor: Omit<
    MutableDescriptor,
    "valueKind" | "allowedValues" | "behavior"
  > &
    Readonly<{
      behavior?: MutableDescriptor["behavior"];
    }>,
): MutableDescriptor {
  return Object.freeze({
    ...descriptor,
    valueKind: "boolean",
    allowedValues: BOOLEAN_VALUES,
    behavior:
      descriptor.behavior ??
      ({
        read: "live",
        update: "session-only",
        reset: "reload",
      } as const),
  });
}

function mutableDescriptor(descriptor: MutableDescriptor): MutableDescriptor {
  return Object.freeze(descriptor);
}

function performanceBoolean(
  descriptor: Omit<
    MutableDescriptor,
    | "valueKind"
    | "allowedValues"
    | "behavior"
    | "store"
    | "read"
    | "update"
    | "defaultValue"
  > &
    Readonly<{
      key: ScenePerformanceBooleanSetting;
      inverted?: boolean;
    }>,
): MutableDescriptor {
  const { key, inverted = false, ...metadata } = descriptor;
  return booleanDescriptor({
    ...metadata,
    performanceSetting: key,
    defaultValue: inverted
      ? !DEFAULT_SCENE_PERFORMANCE_SETTINGS[key]
      : DEFAULT_SCENE_PERFORMANCE_SETTINGS[key],
    store: scenePerformanceController,
    read: () =>
      inverted
        ? !scenePerformanceController.getSnapshot()[key]
        : scenePerformanceController.getSnapshot()[key],
    update: (value) =>
      sceneDiagnosticsRuntime.updatePerformanceBoolean(
        key,
        inverted ? !Boolean(value) : Boolean(value),
      ),
  });
}

const QUALITY_MODE_VALUES = Object.freeze({
  kind: "set" as const,
  values: Object.freeze([
    { value: "cinematic+", label: "Cinematic+", optionGroup: "Manual only" },
    { value: "cinematic", label: "Cinematic", optionGroup: "Manual only" },
    { value: "auto", label: "Auto", optionGroup: "Adaptive range" },
    { value: "showcase", label: "Showcase", optionGroup: "Adaptive range" },
    { value: "balanced", label: "Balanced", optionGroup: "Adaptive range" },
    { value: "efficient", label: "Efficient", optionGroup: "Adaptive range" },
    { value: "safety", label: "Safety", optionGroup: "Adaptive range" },
  ]),
});

const RESOLUTION_STEP_VALUES = Object.freeze({
  kind: "set" as const,
  values: Object.freeze([
    { value: null, label: "Auto" },
    ...Array.from({ length: SCENE_RESOLUTION_MAX_STEP + 1 }, (_, step) => ({
      value: step,
      label: `step ${step}${step === 0 ? " · floor" : step === SCENE_RESOLUTION_MAX_STEP ? " · cap" : ""}`,
    })),
  ]),
});

const PERFORMANCE_PROFILE_VALUES = Object.freeze({
  kind: "set" as const,
  values: Object.freeze([
    { value: null, label: "None (production policy)" },
    ...PERFORMANCE_PROFILE_IDS.map((id) => ({
      value: id,
      label: PERFORMANCE_PROFILE_PRESENTATION[id].label,
    })),
  ]),
});

const RESOLUTION_CEILING_VALUES = Object.freeze({
  kind: "set" as const,
  values: Object.freeze([
    { value: null, label: "Auto (pixel budget)" },
    ...[1, 1.5, 2, 2.5, 3, 4].map((value) => ({
      value,
      label: `${value}x`,
    })),
  ]),
});

const GRADE_PROFILE_VALUES = Object.freeze({
  kind: "set" as const,
  values: Object.freeze([
    ...Object.values(SCENE_GRADE_PROFILES).map((profile) => ({
      value: profile.id,
      label: profile.label,
    })),
    { value: "custom", label: "Custom" },
  ]),
});

const HUE_BAND_VALUES = Object.freeze({
  kind: "set" as const,
  values: Object.freeze(
    HUE_BANDS.map((band) => ({
      value: band,
      label: band.charAt(0).toUpperCase() + band.slice(1),
    })),
  ),
});

const UNIT_RANGE = Object.freeze({
  kind: "range" as const,
  min: -1,
  max: 1,
  step: 0.01,
  decimals: 2,
});

/** The develop stage of the active profile for the theme on screen. This is
 * what the sliders show; moving one forks the profile into Custom. */
const activeDevelop = () =>
  sceneGradeProfileValues(sceneGradeProfileController.getSnapshot()).develop[
    activeGradeTheme()
  ];

function developSlider(
  key: SceneDevelopSliderKey,
  label: string,
  help: string,
  allowedValues: Extract<
    DiagnosticAllowedValues,
    { kind: "range" }
  > = UNIT_RANGE,
): MutableDescriptor {
  return mutableDescriptor({
    id: `grade.${key.replace(/[A-Z]/g, (upper) => `-${upper.toLowerCase()}`)}`,
    panel: "render",
    group: "render.grade",
    label,
    help,
    valueKind: "range",
    allowedValues,
    // The shipped light develop is what a fresh load shows; identity is
    // the Flat profile, not the default.
    defaultValue: SCENE_GRADE_PROFILES.shipped.values.develop.light[key],
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneGradeProfileController,
    read: () => activeDevelop()[key],
    update: (value) =>
      sceneGradeProfileController.updateDevelop(activeGradeTheme(), {
        [key]: Number(value),
      }),
  });
}

function mixerSlider(
  key: keyof HueBandAdjust,
  label: string,
  help: string,
): MutableDescriptor {
  return mutableDescriptor({
    id: `grade.band-${key}`,
    panel: "render",
    group: "render.grade",
    subgroup: "grade.mixer",
    label,
    help,
    valueKind: "range",
    allowedValues: UNIT_RANGE,
    defaultValue: HUE_BAND_IDENTITY[key],
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneGradeProfileController,
    read: () =>
      activeDevelop().mixer[sceneGradeProfileController.getSnapshot().band][
        key
      ],
    update: (value) =>
      sceneGradeProfileController.updateMixer(
        activeGradeTheme(),
        sceneGradeProfileController.getSnapshot().band,
        { [key]: Number(value) },
      ),
  });
}

function opticalDepthOfFieldSlider(
  key: keyof OpticalDepthOfFieldTuning,
  id: string,
  label: string,
  help: string,
  options: Readonly<{
    step: number;
    decimals: number;
    unit?: string;
  }>,
): MutableDescriptor {
  const limits = OPTICAL_DEPTH_OF_FIELD_LIMITS[key];
  return mutableDescriptor({
    id,
    panel: "render",
    group: "render.lens",
    subgroup: "lens.optical",
    label,
    help,
    inputId: `stacks-${id}`,
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: limits.min,
      max: limits.max,
      step: options.step,
      decimals: options.decimals,
      ...(options.unit ? { unit: options.unit } : {}),
    },
    defaultValue: OPTICAL_DEPTH_OF_FIELD_DEFAULTS[key],
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneQualityController,
    read: () => sceneQualityController.getSnapshot().opticalDepthOfField[key],
    update: (value) =>
      sceneQualityController.updateOpticalDepthOfField({
        [key]: Number(value),
      }),
    disabled: () =>
      scenePerformanceController.getSnapshot().skipDepthOfField ||
      sceneQualityController.getSnapshot().depthOfFieldModel === "current",
  });
}

const descriptors: readonly MutableDescriptor[] = Object.freeze([
  mutableDescriptor({
    id: "quality.test-profile",
    panel: "render",
    group: "render.profile",
    label: "Profile",
    help: "Put the scene under one named workload profile. Quality mode, scale ceiling, Auto freeze, and the composer switch apply now; prewarm and photo residency apply on reload.",
    valueKind: "enum",
    allowedValues: PERFORMANCE_PROFILE_VALUES,
    defaultValue: null,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    reloadInput: PERFORMANCE_PROFILE_PARAM,
    store: performanceProfileController,
    read: () => performanceProfileController.getSnapshot(),
    update: (value) =>
      sceneDiagnosticsRuntime.applyProfile(
        value as PerformanceProfileId | null,
      ),
  }),
  booleanDescriptor({
    id: "render.vision-pro-display",
    panel: "simulate",
    group: "simulate.vision",
    label: "Latch Vision Pro display",
    help: "Hold the shelf headset's front display fully awake for this page load.",
    defaultValue: false,
    experimental: false,
    store: visionProDisplayDiagnosticsController,
    read: () => visionProDisplayDiagnosticsController.getSnapshot().enabled,
    update: (value) =>
      visionProDisplayDiagnosticsController.setEnabled(Boolean(value)),
    productionCost: {
      activeValues: [true],
      enabled: "One 128 by 64 procedural texture sampled by the display plane.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  mutableDescriptor({
    id: "render.vision-pro-display-variant",
    panel: "simulate",
    group: "simulate.vision",
    label: "Front display look",
    help: "Choose the artwork used by the hover wake and latched display.",
    valueKind: "enum",
    allowedValues: {
      kind: "set",
      values: [
        { value: "retrowave", label: "Retrowave" },
        { value: "3:45", label: "3:45" },
        { value: "redline", label: "Redline" },
        { value: "golf", label: "Golf" },
      ],
    },
    defaultValue: "retrowave",
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: visionProDisplayDiagnosticsController,
    read: () => visionProDisplayDiagnosticsController.getSnapshot().variant,
    update: (value) =>
      visionProDisplayDiagnosticsController.setVariant(
        value as "retrowave" | "3:45" | "redline" | "golf",
      ),
  }),
  booleanDescriptor({
    id: "render.vision-ride",
    panel: "simulate",
    group: "simulate.vision",
    label: "Vision Ride",
    help: "Enable the Apple Vision Pro retrowave ride for this page load.",
    defaultValue: true,
    experimental: false,
    reloadInput: "novisionride",
    store: visionRideDiagnosticsController,
    read: () => visionRideDiagnosticsController.getSnapshot().enabled,
    update: (value) =>
      visionRideDiagnosticsController.setEnabled(Boolean(value)),
    productionCost: {
      activeValues: [true],
      enabled: "Lazy ride world, car, and soundtrack",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  booleanDescriptor({
    id: "render.vision-ride-retro-fx",
    panel: "simulate",
    group: "simulate.vision",
    label: "Vision Ride retro finish",
    help: "Add the ride-only CRT texture, vignette, and stronger neon bloom.",
    defaultValue: true,
    experimental: false,
    store: visionRideDiagnosticsController,
    read: () => visionRideDiagnosticsController.getSnapshot().retroFxEnabled,
    update: (value) =>
      visionRideDiagnosticsController.setRetroFxEnabled(Boolean(value)),
    productionCost: {
      activeValues: [true],
      enabled: "One translucent screen shader and stronger existing bloom",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  booleanDescriptor({
    id: "render.vision-ride-mile-markers",
    panel: "simulate",
    group: "simulate.vision",
    label: "Vision Ride mile markers",
    help: "Pass through one road-wide holographic checkpoint every 30 seconds.",
    defaultValue: true,
    experimental: false,
    store: visionRideDiagnosticsController,
    read: () =>
      visionRideDiagnosticsController.getSnapshot().mileMarkersEnabled,
    update: (value) =>
      visionRideDiagnosticsController.setMileMarkersEnabled(Boolean(value)),
    productionCost: {
      activeValues: [true],
      enabled:
        "One checkpoint frame, one holographic curtain, and one instanced shard field",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  booleanDescriptor({
    id: "render.vision-ride-light-trails",
    panel: "simulate",
    group: "simulate.vision",
    label: "Vision Ride light trails",
    help: "Extrude both Lamborghini-Y lamp silhouettes through camera history with layered bloom.",
    defaultValue: true,
    experimental: false,
    store: visionRideDiagnosticsController,
    read: () =>
      visionRideDiagnosticsController.getSnapshot().lightTrailsEnabled,
    update: (value) =>
      visionRideDiagnosticsController.setLightTrailsEnabled(Boolean(value)),
    productionCost: {
      activeValues: [true],
      enabled:
        "One dynamic extrusion draw plus three 14-instance lamp-glow draws",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  mutableDescriptor({
    id: "render.vision-ride-scene-preview",
    panel: "simulate",
    group: "simulate.vision",
    label: "Vision Ride scene",
    help: "Preview an authored Reality Stack combination without satisfying its discovery or Field Note.",
    valueKind: "enum",
    allowedValues: {
      kind: "set",
      values: [
        { value: "authored", label: "Authored triggers" },
        { value: "canonical", label: "Canonical" },
        { value: "night", label: "3:45" },
        { value: "redline", label: "Redline" },
        { value: "golf", label: "Fairway" },
        { value: "night-redline", label: "3:45 + Redline" },
        { value: "night-golf", label: "3:45 + Fairway" },
        { value: "redline-golf", label: "Redline + Fairway" },
        { value: "full-stack", label: "All scene modifiers" },
      ],
    },
    defaultValue: "authored",
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: visionRideDiagnosticsController,
    read: () => visionRideDiagnosticsController.getSnapshot().scenePreview,
    update: (value) =>
      visionRideDiagnosticsController.setScenePreview(
        value as VisionRideScenePreview,
      ),
  }),
  mutableDescriptor({
    id: "render.vision-ride-finish-preview",
    panel: "simulate",
    group: "simulate.vision",
    label: "Vision Ride finish",
    help: "Preview the clean, 8-bit, or 16-bit finish without satisfying its discovery or Field Note.",
    valueKind: "enum",
    allowedValues: {
      kind: "set",
      values: [
        { value: "authored", label: "Authored trigger" },
        { value: "off", label: "Clean" },
        { value: "levels", label: "8-bit" },
        { value: "palette", label: "16-bit" },
      ],
    },
    defaultValue: "authored",
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: visionRideDiagnosticsController,
    read: () => visionRideDiagnosticsController.getSnapshot().finishPreview,
    update: (value) =>
      visionRideDiagnosticsController.setFinishPreview(
        value as VisionRideFinishPreview,
      ),
  }),
  booleanDescriptor({
    id: "camera.authored-depth",
    panel: "simulate",
    group: "simulate.camera",
    label: "Authored camera depth",
    help: "Apply the authored camera depth treatment for this mount.",
    defaultValue: DEFAULT_CAMERA.enabled,
    experimental: false,
    store: cameraDepthDiagnosticsController,
    read: () => cameraDepthDiagnosticsController.getSnapshot().enabled,
    update: (value) =>
      cameraDepthDiagnosticsController.setEnabled(Boolean(value)),
  }),
  booleanDescriptor({
    id: "camera.free-roam",
    panel: "simulate",
    group: "simulate.camera",
    label: "Free-roam camera",
    help: "Detach the camera from the authored traverse until reload.",
    ariaKeyShortcuts: "R Shift+R",
    defaultValue: DEFAULT_FREE_ROAM.enabled,
    experimental: false,
    store: freeRoamDiagnosticsController,
    read: () => freeRoamDiagnosticsController.getSnapshot().enabled,
    update: (value) => freeRoamDiagnosticsController.setEnabled(Boolean(value)),
  }),
  booleanDescriptor({
    id: "camera.free-roam-fog",
    panel: "simulate",
    group: "simulate.camera",
    label: "Fog in free roam",
    help: "Retain production fog while the free-roam camera is active.",
    defaultValue: DEFAULT_FREE_ROAM.fogEnabled,
    experimental: false,
    store: freeRoamDiagnosticsController,
    read: () => freeRoamDiagnosticsController.getSnapshot().fogEnabled,
    update: (value) =>
      freeRoamDiagnosticsController.setFogEnabled(Boolean(value)),
    disabled: () => !freeRoamDiagnosticsController.getSnapshot().enabled,
  }),
  mutableDescriptor({
    id: "meadow.wind-strength",
    panel: "simulate",
    group: "simulate.meadow",
    label: "Base strength",
    help: "Set the shared meadow wind amplitude.",
    inputId: "stacks-wind-strength",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: 0,
      max: 0.3,
      step: 0.01,
      decimals: 2,
    },
    defaultValue: DEFAULT_MEADOW.wind,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: meadowDiagnosticsController,
    read: () => meadowDiagnosticsController.getSnapshot().wind,
    update: (value) =>
      meadowDiagnosticsController.update({ wind: Number(value) }),
    disabled: () => !meadowDiagnosticsController.getSnapshot().available,
  }),
  mutableDescriptor({
    id: "meadow.live-gust",
    panel: "simulate",
    group: "simulate.meadow",
    label: "Live gust",
    help: "Read the wind value currently reaching the meadow shader.",
    inputId: "stacks-wind-live",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: 0,
      max: MEADOW_WIND.gustCeiling,
      step: 0.001,
      decimals: 3,
    },
    defaultValue: DEFAULT_MEADOW.liveWind,
    experimental: false,
    behavior: { read: "effective", update: "read-only", reset: "reload" },
    store: meadowDiagnosticsController,
    read: () => meadowDiagnosticsController.getSnapshot().liveWind,
    disabled: () => true,
  }),
  mutableDescriptor({
    id: "meadow.animation-speed",
    panel: "simulate",
    group: "simulate.meadow",
    label: "Animation speed",
    help: "Scale the meadow wind clock without changing its amplitude.",
    inputId: "stacks-wind-speed",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: 0,
      max: 2,
      step: 0.01,
      unit: "×",
      decimals: 2,
    },
    defaultValue: DEFAULT_MEADOW.speed,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: meadowDiagnosticsController,
    read: () => meadowDiagnosticsController.getSnapshot().speed,
    update: (value) =>
      meadowDiagnosticsController.update({ speed: Number(value) }),
    disabled: () => !meadowDiagnosticsController.getSnapshot().available,
  }),
  booleanDescriptor({
    id: "meadow.persistent-deformation",
    panel: "simulate",
    group: "simulate.meadow",
    label: "Persistent grass deformation",
    help: "Allocate a lean field and retain physical tracks for this mount.",
    inputId: "stacks-grass-deformation",
    defaultValue: DEFAULT_MEADOW.deformationEnabled,
    experimental: true,
    reloadInput: "grassDeformation=off",
    productionCost: {
      activeValues: [true],
      enabled:
        "Two render targets, deformation texture samples, stamp passes, and recovery draws.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
    store: meadowDiagnosticsController,
    read: () => meadowDiagnosticsController.getSnapshot().deformationEnabled,
    update: (value) =>
      meadowDiagnosticsController.update({
        deformationEnabled: Boolean(value),
      }),
    disabled: () => !meadowDiagnosticsController.getSnapshot().available,
  }),
  booleanDescriptor({
    id: "insects.pause-landings",
    panel: "simulate",
    group: "simulate.insects",
    label: "Pause automatic landings",
    help: "Stop new automatic insect landing attempts until reload.",
    defaultValue: DEFAULT_INSECTS.pauseAutomaticLandings,
    experimental: false,
    store: insectDiagnosticsController,
    read: () =>
      insectDiagnosticsController.getSnapshot().pauseAutomaticLandings,
    update: (value) =>
      insectDiagnosticsController.update({
        pauseAutomaticLandings: Boolean(value),
      }),
  }),
  ...(
    [
      [
        "physics.simulation",
        "physics.motion",
        "Step free-body simulation",
        "simulation",
      ],
      [
        "physics.visibility-resets",
        "physics.motion",
        "Run off-screen resets",
        "visibilityResets",
      ],
      [
        "physics.held-collision-probes",
        "physics.collision",
        "Probe held collisions",
        "heldCollisionProbes",
      ],
      [
        "physics.generated-statics",
        "physics.collision",
        "Use generated scene statics",
        "generatedStatics",
      ],
    ] as const
  ).map(([id, subgroup, label, key]) =>
    booleanDescriptor({
      id,
      panel: "simulate",
      group: "simulate.physics",
      subgroup,
      label,
      help: `Toggle the physics runtime's ${label.toLowerCase()} path.`,
      defaultValue: DEFAULT_PHYSICS.runtime[key],
      experimental: false,
      store: physicsDiagnosticsController,
      read: () => physicsDiagnosticsController.getSnapshot().runtime[key],
      update: (value) => {
        const snapshot = physicsDiagnosticsController.getSnapshot();
        physicsDiagnosticsController.update({
          runtime: { ...snapshot.runtime, [key]: Boolean(value) },
        });
      },
    }),
  ),
  mutableDescriptor({
    id: "quality.mode",
    panel: "render",
    group: "render.quality",
    label: "Mode",
    help: "Choose automatic adaptation or a session-only fixed profile.",
    valueKind: "enum",
    allowedValues: QUALITY_MODE_VALUES,
    defaultValue: DEFAULT_QUALITY.mode,
    experimental: false,
    experimentalValues: ["cinematic+"],
    behavior: { read: "live", update: "session-only", reset: "reload" },
    productionCost: {
      activeValues: ["cinematic+"],
      enabled:
        "Cinematic+ adds a sun, a 2048-square shadow map, and a God Rays pass when selected in light mode.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
    store: sceneQualityController,
    read: () => {
      const snapshot = sceneQualityController.getSnapshot();
      return snapshot.cinematicPlus ? "cinematic+" : snapshot.mode;
    },
    update: (value) =>
      sceneQualityController.setMode(
        value as Parameters<typeof sceneQualityController.setMode>[0],
      ),
  }),
  mutableDescriptor({
    id: "quality.resolution-step",
    panel: "render",
    group: "render.resolution",
    label: "Render scale",
    help: "Pin one resolution rung or return the axis to automatic control.",
    valueKind: "enum",
    allowedValues: RESOLUTION_STEP_VALUES,
    defaultValue: DEFAULT_QUALITY.resolutionStep,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneQualityController,
    read: () => sceneQualityController.getSnapshot().resolutionStep,
    update: (value) =>
      sceneQualityController.setResolutionStep(value as number | null),
  }),
  mutableDescriptor({
    id: "quality.resolution-ceiling",
    panel: "render",
    group: "render.resolution",
    label: "Scale ceiling",
    help: "Replace the automatic pixel budget with a bounded manual ceiling.",
    valueKind: "enum",
    allowedValues: RESOLUTION_CEILING_VALUES,
    defaultValue: DEFAULT_QUALITY.resolutionCeiling,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneQualityController,
    read: () => sceneQualityController.getSnapshot().resolutionCeiling,
    update: (value) =>
      sceneQualityController.setResolutionCeiling(value as number | null),
  }),
  // Screenshot mode. Not a render path of its own, so it carries no
  // production cost entry: off, it allocates nothing and runs no frame work,
  // and on, its cost is whichever quality mode it lands on.
  mutableDescriptor({
    id: "screenshot.enabled",
    panel: "render",
    group: "render.screenshot",
    label: "Framing mode",
    help: "Show About alone and centred with the interface hidden, land on Cinematic+, and swap the large portrait. For social headers.",
    valueKind: "enum",
    allowedValues: {
      kind: "set",
      values: [
        { value: false, label: "Standard" },
        { value: true, label: "Screenshot" },
      ],
    },
    defaultValue: SCREENSHOT_MODE_DEFAULT.enabled,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: screenshotModeController,
    read: () => screenshotModeController.getSnapshot().enabled,
    update: (value) => screenshotModeController.setEnabled(Boolean(value)),
  }),
  mutableDescriptor({
    id: "screenshot.portrait",
    panel: "render",
    group: "render.screenshot",
    label: "Top shelf",
    help: "What stands where the large portrait does. The Macintosh for a header, which already has the profile picture beside it; the portrait for a card that stands alone, like the OG image.",
    valueKind: "enum",
    allowedValues: {
      kind: "set",
      values: [
        { value: false, label: "Macintosh" },
        { value: true, label: "Portrait" },
      ],
    },
    defaultValue: SCREENSHOT_MODE_DEFAULT.portrait,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: screenshotModeController,
    read: () => screenshotModeController.getSnapshot().portrait,
    update: (value) => screenshotModeController.setPortrait(Boolean(value)),
    disabled: () => !screenshotModeController.getSnapshot().enabled,
  }),
  mutableDescriptor({
    id: "screenshot.dolly",
    panel: "render",
    group: "render.screenshot",
    label: "Dolly out",
    help: "Stand the camera this far behind its authored stop, past the visitor zoom floor. [ and ] step it from the keyboard.",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: SCREENSHOT_DOLLY_MIN,
      max: SCREENSHOT_DOLLY_MAX,
      step: SCREENSHOT_DOLLY_STEP,
      unit: " u",
      decimals: 2,
    },
    defaultValue: SCREENSHOT_MODE_DEFAULT.dolly,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: screenshotModeController,
    read: () => screenshotModeController.getSnapshot().dolly,
    update: (value) => screenshotModeController.setDolly(Number(value)),
    disabled: () => !screenshotModeController.getSnapshot().enabled,
  }),
  mutableDescriptor({
    id: "screenshot.fov",
    panel: "render",
    group: "render.screenshot",
    label: "Lens",
    help: "Vertical field of view for the still, or the composition's own lens when left on the resolved policy.",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: SCREENSHOT_FOV_MIN,
      max: SCREENSHOT_FOV_MAX,
      step: 0.5,
      unit: "°",
      decimals: 1,
      automatic: { value: null, label: "Resolved policy" },
    },
    defaultValue: SCREENSHOT_MODE_DEFAULT.fov,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: screenshotModeController,
    read: () => screenshotModeController.getSnapshot().fov,
    update: (value) =>
      screenshotModeController.setFov(value === null ? null : Number(value)),
    disabled: () => !screenshotModeController.getSnapshot().enabled,
  }),
  mutableDescriptor({
    id: "screenshot.grass-lift",
    panel: "render",
    group: "render.screenshot",
    label: "Grass lift",
    help: "How much taller the lawn stands away from the About shelf, as a fraction of its authored height.",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: 0,
      max: SCREENSHOT_GRASS_LIFT_MAX,
      step: SCREENSHOT_GRASS_STEP,
      decimals: 2,
    },
    defaultValue: SCREENSHOT_MODE_DEFAULT.grassLift,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: screenshotModeController,
    read: () => screenshotModeController.getSnapshot().grassLift,
    update: (value) => screenshotModeController.setGrassLift(Number(value)),
    disabled: () => !screenshotModeController.getSnapshot().enabled,
  }),
  mutableDescriptor({
    id: "screenshot.grass-variation",
    panel: "render",
    group: "render.screenshot",
    label: "Grass variation",
    help: "Extra unevenness in tuft height across the whole lawn, as a fraction of the authored height.",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: 0,
      max: SCREENSHOT_GRASS_MAX,
      step: SCREENSHOT_GRASS_STEP,
      decimals: 2,
    },
    defaultValue: SCREENSHOT_MODE_DEFAULT.grassVariation,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: screenshotModeController,
    read: () => screenshotModeController.getSnapshot().grassVariation,
    update: (value) =>
      screenshotModeController.setGrassVariation(Number(value)),
    disabled: () => !screenshotModeController.getSnapshot().enabled,
  }),
  // Grade profiles. The shipped print pays nothing: the develop stage is one
  // uniform branch in the pass the grade already owns, taken only when a
  // profile moves a value off identity.
  mutableDescriptor({
    id: "grade.profile",
    panel: "render",
    group: "render.grade",
    label: "Profile",
    help: "Put a named develop stage after the print grade. Shipped is identity; Lightroom match is fitted to the owner's graded screenshot; Custom is whatever the sliders say.",
    valueKind: "enum",
    allowedValues: GRADE_PROFILE_VALUES,
    defaultValue: SCENE_GRADE_PROFILE_DEFAULT.profile,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneGradeProfileController,
    read: () => sceneGradeProfileController.getSnapshot().profile,
    update: (value) =>
      sceneGradeProfileController.setProfile(value as SceneGradeProfileId),
  }),
  developSlider(
    "exposure",
    "Exposure",
    "Stops of gain in linear display light, after tone mapping. Not the renderer's HDR exposure.",
    { kind: "range", min: -2, max: 2, step: 0.05, decimals: 2, unit: " EV" },
  ),
  developSlider(
    "contrast",
    "Contrast",
    "An S about mid grey when positive, a flattening toward it when negative.",
  ),
  developSlider(
    "highlights",
    "Highlights",
    "Lift or compress the band just below white.",
  ),
  developSlider(
    "shadows",
    "Shadows",
    "Lift or deepen the band just above black.",
  ),
  developSlider(
    "whites",
    "Whites",
    "Push the top of the range, weighted toward the brightest pixels.",
  ),
  developSlider(
    "blacks",
    "Blacks",
    "Crush or lift the bottom of the range, weighted toward the darkest pixels. Negative is what removes a fog lift.",
  ),
  developSlider(
    "temp",
    "Temp",
    "White balance: positive is warmer, at constant luminance.",
  ),
  developSlider("tint", "Tint", "White balance: positive is magenta."),
  developSlider(
    "vibrance",
    "Vibrance",
    "Saturation weighted toward the pixels that have the least of it.",
  ),
  developSlider("saturation", "Saturation", "Chroma about luma, everywhere."),
  developSlider(
    "vignette",
    "Vignette",
    "Post vignette, elliptical with the frame. Negative darkens the corners; the print grade's own vignette stays as it is.",
  ),
  developSlider(
    "vignetteMidpoint",
    "Vignette midpoint",
    "Frame radius where the vignette begins: low reaches most of the frame, high keeps to the corners.",
    { kind: "range", min: 0.2, max: 0.9, step: 0.01, decimals: 2 },
  ),
  mutableDescriptor({
    id: "grade.band",
    panel: "render",
    group: "render.grade",
    subgroup: "grade.mixer",
    label: "Band",
    help: "Which of the eight hue bands the three sliders below edit.",
    valueKind: "enum",
    allowedValues: HUE_BAND_VALUES,
    defaultValue: SCENE_GRADE_PROFILE_DEFAULT.band,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneGradeProfileController,
    read: () => sceneGradeProfileController.getSnapshot().band,
    update: (value) => sceneGradeProfileController.setBand(value as HueBand),
  }),
  mixerSlider(
    "hue",
    "Hue",
    "Rotate the band's hue; 1 is a whole band (60 degrees) toward the next.",
  ),
  mixerSlider(
    "sat",
    "Saturation",
    "Scale the band's saturation; 1 is two and a half times, -1 removes it.",
  ),
  mixerSlider(
    "lum",
    "Luminance",
    "Scale the band's brightness; 1 is half again, -1 halves it.",
  ),
  // Lives with the mode it qualifies: freezing only means anything in Auto.
  booleanDescriptor({
    id: "quality.adapt-auto",
    panel: "render",
    group: "render.quality",
    label: "Adapt Auto quality",
    help: "Let Auto change quality axes from the recorded frame metrics.",
    defaultValue: !DEFAULT_QUALITY.frozen,
    experimental: false,
    store: sceneQualityController,
    read: () => !sceneQualityController.getSnapshot().frozen,
    update: (value) => sceneQualityController.setFrozen(!Boolean(value)),
    disabled: () => sceneQualityController.getSnapshot().mode !== "auto",
  }),
  performanceBoolean({
    id: "render.postprocessing",
    panel: "render",
    group: "render.passes",
    label: "Post-processing composer",
    help: "Mount the shared finishing composer and its render targets.",
    key: "postprocessing",
    experimental: false,
    reloadInput: "nopostfx",
    productionCost: {
      activeValues: [true],
      enabled:
        "A full-frame composer plus the render targets and samples of its active passes.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  performanceBoolean({
    id: "render.side-tilt-shift",
    panel: "render",
    group: "render.lens",
    label: "Side tilt shift",
    help: "Mount the approved side-focus finishing pass.",
    key: "sideTiltShift",
    experimental: false,
    reloadInput: "notiltshift",
    productionCost: {
      activeValues: [true],
      enabled: "One composer texture-sampling pass.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  performanceBoolean({
    id: "render.color-grade",
    panel: "render",
    group: "render.passes",
    label: "Color grade",
    help: "Mount the shared scene color-grade pass.",
    key: "colorGrade",
    experimental: false,
    reloadInput: "nograde",
    productionCost: {
      activeValues: [true],
      enabled: "One composer color transform over the frame.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  booleanDescriptor({
    id: "render.photo-chroma-protection",
    panel: "render",
    group: "render.photographs",
    label: "Protect photographic color",
    help: "Keep display-referred photographs out of the room's saturation rebuild.",
    defaultValue: DEFAULT_PHOTOGRAPH_TREATMENT.chromaProtection,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: photographTreatmentController,
    read: () => photographTreatmentController.getSnapshot().chromaProtection,
    update: (value) =>
      photographTreatmentController.update({
        chromaProtection: Boolean(value),
      }),
    disabled: () => !scenePerformanceController.getSnapshot().colorGrade,
  }),
  mutableDescriptor({
    id: "render.photo-warmth",
    panel: "render",
    group: "render.photographs",
    label: "Warm tint",
    help: "Multiply each image's authored lamp-warmth treatment; zero leaves its source color neutral.",
    inputId: "stacks-photo-warmth",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: PHOTOGRAPH_TREATMENT_LIMITS.warmthMultiplier.min,
      max: PHOTOGRAPH_TREATMENT_LIMITS.warmthMultiplier.max,
      step: 0.05,
      unit: "×",
      decimals: 2,
    },
    defaultValue: DEFAULT_PHOTOGRAPH_TREATMENT.warmthMultiplier,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: photographTreatmentController,
    read: () => photographTreatmentController.getSnapshot().warmthMultiplier,
    update: (value) =>
      photographTreatmentController.update({ warmthMultiplier: Number(value) }),
  }),
  mutableDescriptor({
    id: "render.photo-contrast",
    panel: "render",
    group: "render.photographs",
    label: "Photo-only contrast",
    help: "Flatten or strengthen contrast in photographic textures without changing the room or cover art.",
    inputId: "stacks-photo-contrast",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: PHOTOGRAPH_TREATMENT_LIMITS.contrast.min,
      max: PHOTOGRAPH_TREATMENT_LIMITS.contrast.max,
      step: 0.05,
      decimals: 2,
    },
    defaultValue: DEFAULT_PHOTOGRAPH_TREATMENT.contrast,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: photographTreatmentController,
    read: () => photographTreatmentController.getSnapshot().contrast,
    update: (value) =>
      photographTreatmentController.update({ contrast: Number(value) }),
  }),
  booleanDescriptor({
    id: "render.meadow",
    panel: "render",
    group: "render.scene-effects",
    label: "Meadow",
    help: "Mount meadow geometry, materials, animation, and interactions.",
    performanceSetting: "meadow",
    defaultValue: DEFAULT_SCENE_PERFORMANCE_SETTINGS.meadow,
    store: resolvedMeadowStore,
    read: readResolvedMeadow,
    update: (value) =>
      sceneDiagnosticsRuntime.updatePerformanceBoolean(
        "meadow",
        Boolean(value),
      ),
    experimental: false,
    reloadInput: "nomeadow",
    productionCost: {
      activeValues: [true],
      enabled:
        "Meadow geometry, textures, shader work, culling, and interaction updates.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  performanceBoolean({
    id: "render.high-resolution-photos",
    panel: "render",
    group: "render.scene-effects",
    label: "High-resolution photos",
    help: "Load authored detail textures after role-sized previews.",
    key: "highResolutionPhotos",
    experimental: false,
    reloadInput: "hdPhotos=0",
    productionCost: {
      activeValues: [true],
      enabled:
        "Extra image fetches, decodes, texture allocations, and samples for authored details.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  booleanDescriptor({
    id: "render.lighthouse-beacon",
    panel: "render",
    group: "render.scene-effects",
    label: "Lighthouse beacon",
    help: "Mount the Musings lighthouse beam, bloom source, and camera-facing flash.",
    defaultValue: DEFAULT_LIGHTHOUSE.effectEnabled,
    experimental: false,
    productionCost: {
      activeValues: [true],
      enabled:
        "Beacon geometry, animated materials, a real light, and camera-facing flare work.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
    store: lighthouseBeaconDiagnosticsController,
    read: () =>
      lighthouseBeaconDiagnosticsController.getSnapshot().effectEnabled,
    update: (value) =>
      lighthouseBeaconDiagnosticsController.setEffectEnabled(Boolean(value)),
  }),
  booleanDescriptor({
    id: "render.model-artifact-preview",
    panel: "render",
    group: "render.scene-effects",
    label: "3D artifact preview",
    help: "Mount the interactive model renderer while inspecting a 3D artifact.",
    defaultValue: true,
    experimental: false,
    productionCost: {
      activeValues: [true],
      enabled:
        "One temporary WebGL context, a small environment map, and demand-driven model frames while the inspector is open.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
    store: modelArtifactDiagnosticsController,
    read: () =>
      modelArtifactDiagnosticsController.getSnapshot().rendererEnabled,
    update: (value) =>
      modelArtifactDiagnosticsController.setRendererEnabled(Boolean(value)),
  }),
  booleanDescriptor({
    id: "render.artifact-preview-blur",
    panel: "render",
    group: "render.scene-effects",
    label: "Photo preview blur",
    help: "Sample the room behind an enlarged photo with the Field Notes blur.",
    defaultValue: artifactPreviewVisualEffects.defaultSnapshot.backdropBlur,
    experimental: false,
    productionCost: {
      activeValues: [true],
      enabled: "One full-viewport CSS backdrop blur while a photo is open.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
    store: artifactPreviewVisualEffects,
    read: () => artifactPreviewVisualEffects.getSnapshot().backdropBlur,
    update: (value) =>
      artifactPreviewVisualEffects.setBackdropBlur(Boolean(value)),
  }),
  booleanDescriptor({
    id: "render.universal-search-blur",
    panel: "render",
    group: "render.scene-effects",
    label: "Universal Search blur",
    help: "Sample the page behind Universal Search for its approved live blur.",
    defaultValue: universalSearchVisualEffects.defaultSnapshot.backdropBlur,
    experimental: false,
    productionCost: {
      activeValues: [true],
      enabled: "CSS backdrop sampling behind the palette and its scrim.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
    store: universalSearchVisualEffects,
    read: () => universalSearchVisualEffects.getSnapshot().backdropBlur,
    update: (value) =>
      universalSearchVisualEffects.setBackdropBlur(Boolean(value)),
  }),
  performanceBoolean({
    id: "render.suspend-settled-props",
    panel: "render",
    group: "render.optimizations",
    label: "Suspend settled distant props",
    help: "Skip frame work for distant props proven to be at rest.",
    key: "suspendSettledPropWork",
    optimizationPreset: { optimized: true, unoptimized: false },
    experimental: false,
  }),
  booleanDescriptor({
    id: "render.coordination-singularity",
    panel: "render",
    group: "render.scene-effects",
    label: "Coordination singularity",
    help: "Run the approved globe shockwave across the shared environment.",
    defaultValue: DEFAULT_COORDINATION.effectEnabled,
    experimental: false,
    productionCost: {
      activeValues: [true],
      enabled: "One shared impulse clock plus sky and meadow shader branches.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
    store: coordinationGlobeDiagnosticsController,
    read: () =>
      coordinationGlobeDiagnosticsController.getSnapshot().effectEnabled,
    update: (value) =>
      coordinationGlobeDiagnosticsController.setEffectEnabled(Boolean(value)),
  }),
  performanceBoolean({
    id: "render.pause-prewarm-travel",
    panel: "render",
    group: "render.optimizations",
    label: "Pause prewarming during travel",
    help: "Keep best-effort GPU warm-up work out of camera traversals.",
    key: "pausePrewarmDuringTravel",
    optimizationPreset: { optimized: true, unoptimized: false },
    experimental: false,
  }),
  performanceBoolean({
    id: "render.prewarm-all-visuals",
    panel: "render",
    group: "render.optimizations",
    label: "Preload all shelf visuals",
    help: "Initialize all role-sized shelf resources behind the boot screen.",
    key: "prewarmAllUnitVisuals",
    optimizationPreset: { optimized: true, unoptimized: false },
    experimental: false,
  }),
  performanceBoolean({
    id: "render.stable-light-shape",
    panel: "render",
    group: "render.optimizations",
    label: "Stabilize nearby-light shader count",
    help: "Pad missing nearby light slots with zero-intensity lights.",
    key: "stableNeighborhoodLightShape",
    optimizationPreset: { optimized: true, unoptimized: false },
    experimental: false,
  }),
  performanceBoolean({
    id: "render.nearby-lights",
    panel: "render",
    group: "render.optimizations",
    label: "Limit real lights to nearby shelves",
    help: "Keep real lights on the active shelf and its immediate neighbours.",
    key: "activeNeighborhoodLights",
    optimizationPreset: { optimized: true, unoptimized: false },
    experimental: false,
  }),
  performanceBoolean({
    id: "render.simplified-far-grass",
    panel: "render",
    group: "render.optimizations",
    label: "Simplify far-grass shader",
    help: "Compile the cheaper far-tuft motion shader.",
    key: "simplifiedFarMeadow",
    optimizationPreset: { optimized: true, unoptimized: false },
    experimental: false,
  }),
  mutableDescriptor({
    id: "render.practical-glow",
    panel: "render",
    group: "render.scene-effects",
    label: "Practical glow",
    help: "Choose the practical-light shoulder used for comparison.",
    valueKind: "enum",
    allowedValues: {
      kind: "set",
      values: [
        { value: "halo", label: "Analytic halo" },
        { value: "aperture", label: "Aperture only" },
        { value: "sprite", label: "Legacy sprites" },
      ],
    },
    defaultValue: DEFAULT_SCENE_PERFORMANCE_SETTINGS.practicalGlowMode,
    experimental: false,
    performanceSetting: "practicalGlowMode",
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: scenePerformanceController,
    read: () => scenePerformanceController.getSnapshot().practicalGlowMode,
    update: (value) =>
      scenePerformanceController.update({
        practicalGlowMode:
          value as ScenePerformanceSettings["practicalGlowMode"],
      }),
    optimizationPreset: { optimized: "aperture", unoptimized: "sprite" },
  }),
  mutableDescriptor({
    id: "render.placard-material",
    panel: "render",
    group: "render.scene-effects",
    label: "Placard material",
    help: "Compare the shipped blur with paper and automatic fallback modes.",
    valueKind: "enum",
    allowedValues: {
      kind: "set",
      values: [
        { value: "auto", label: "Auto (paper touch)" },
        { value: "paper", label: "Opaque paper" },
        { value: "native", label: "Native live blur" },
      ],
    },
    defaultValue: DEFAULT_SCENE_PERFORMANCE_SETTINGS.placardGlassMode,
    experimental: false,
    performanceSetting: "placardGlassMode",
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: scenePerformanceController,
    read: () => scenePerformanceController.getSnapshot().placardGlassMode,
    update: (value) =>
      scenePerformanceController.update({
        placardGlassMode: value as ScenePerformanceSettings["placardGlassMode"],
      }),
    optimizationPreset: { optimized: "paper", unoptimized: "native" },
  }),
  ...(
    [
      [
        "render.effective-dpr-rungs",
        "Use effective DPR rungs",
        "effectiveDprLadder",
        "render.optimizations",
        true,
        false,
      ],
      [
        "render.adaptive-sharpen",
        "Sharpen reduced-DPR output",
        "adaptiveSharpen",
        "render.passes",
        true,
        false,
        "One conditional full-frame sharpening pass.",
      ],
    ] as const
  ).map(([id, label, key, group, optimized, unoptimized, enabledCost]) =>
    performanceBoolean({
      id,
      panel: "render",
      group,
      label,
      help: `Use the live ${label.toLowerCase()} comparison for this mount.`,
      key,
      optimizationPreset: { optimized, unoptimized },
      experimental: false,
      ...(enabledCost
        ? {
            productionCost: {
              activeValues: [true],
              enabled: enabledCost,
              offPath: {
                renderTargetAllocations: 0,
                textureSamples: 0,
                perFrameWork: false,
              },
            },
          }
        : {}),
    }),
  ),
  performanceBoolean({
    id: "render.ambient-occlusion",
    panel: "render",
    group: "render.passes",
    label: "Ambient occlusion",
    help: "Render contact shading around nearby geometry.",
    key: "skipAmbientOcclusion",
    inverted: true,
    optimizationPreset: { optimized: false, unoptimized: true },
    experimental: false,
    productionCost: {
      activeValues: [true],
      enabled:
        "Ambient-occlusion render targets, samples, and composition work.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  performanceBoolean({
    id: "render.bloom",
    panel: "render",
    group: "render.passes",
    label: "Bloom",
    help: "Render the HDR glow mip chain for practical lights.",
    key: "skipBloom",
    inverted: true,
    optimizationPreset: { optimized: false, unoptimized: true },
    experimental: false,
    productionCost: {
      activeValues: [true],
      enabled: "Bloom mip-chain render targets, samples, and composition work.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  performanceBoolean({
    id: "render.depth-of-field",
    panel: "render",
    group: "render.lens",
    label: "Depth of field",
    help: "Render the active depth-of-field model around the shelf focal plane.",
    key: "skipDepthOfField",
    inverted: true,
    optimizationPreset: { optimized: false, unoptimized: true },
    experimental: false,
    reloadInput: "nodof",
    productionCost: {
      activeValues: [true],
      enabled:
        "Depth-of-field render targets, depth samples, and composition work.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  mutableDescriptor({
    id: "render.dof-model",
    panel: "render",
    group: "render.lens",
    label: "DoF model",
    help: "Use the production 32-tap thin-lens gather, compare 16- and 64-tap variants, or restore the previous multi-pass blur.",
    valueKind: "enum",
    allowedValues: {
      kind: "set",
      values: [
        { value: "current", label: "Previous multi-pass" },
        {
          value: "optical-prototype-16",
          label: "Optical 16-tap (performance)",
        },
        { value: "optical-prototype", label: "Optical 32-tap (default)" },
        { value: "optical-prototype-64", label: "Optical 64-tap" },
      ],
    },
    defaultValue: DEFAULT_QUALITY.depthOfFieldModel,
    experimental: false,
    experimentalValues: ["optical-prototype-16", "optical-prototype-64"],
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneQualityController,
    read: () => sceneQualityController.getSnapshot().depthOfFieldModel,
    update: (value) =>
      sceneQualityController.setDepthOfFieldModel(value as DepthOfFieldModel),
    disabled: () => scenePerformanceController.getSnapshot().skipDepthOfField,
    productionCost: {
      activeValues: [
        "optical-prototype-16",
        "optical-prototype",
        "optical-prototype-64",
      ],
      enabled:
        "One full-resolution 16-, 32-, or 64-tap color-and-depth aperture gather.",
      offPath: {
        renderTargetAllocations: 0,
        textureSamples: 0,
        perFrameWork: false,
      },
    },
  }),
  mutableDescriptor({
    id: "render.dof-strength",
    panel: "render",
    group: "render.lens",
    label: "DoF strength",
    help: "Multiply the resolved depth-of-field bokeh strength.",
    inputId: "stacks-dof-strength",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MIN,
      max: DEPTH_OF_FIELD_BOKEH_MULTIPLIER_MAX,
      step: 0.05,
      unit: "×",
      decimals: 2,
      automatic: { value: null, label: "Resolved policy" },
    },
    defaultValue: DEFAULT_QUALITY.depthOfFieldBokehMultiplier,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneQualityController,
    read: () =>
      sceneQualityController.getSnapshot().depthOfFieldBokehMultiplier,
    update: (value) =>
      sceneQualityController.setDepthOfFieldBokehMultiplier(value as number),
    disabled: () => scenePerformanceController.getSnapshot().skipDepthOfField,
  }),
  mutableDescriptor({
    id: "render.dof-buffer-quality",
    panel: "render",
    group: "render.lens",
    label: "DoF buffer quality",
    help: "Replace the depth-of-field effect-buffer resolution scale.",
    inputId: "stacks-dof-quality",
    valueKind: "range",
    allowedValues: {
      kind: "range",
      min: DEPTH_OF_FIELD_RESOLUTION_SCALE_MIN,
      max: DEPTH_OF_FIELD_RESOLUTION_SCALE_MAX,
      step: 0.05,
      unit: "×",
      decimals: 2,
      automatic: { value: null, label: "Resolved policy" },
    },
    defaultValue: DEFAULT_QUALITY.depthOfFieldResolutionScale,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: sceneQualityController,
    read: () =>
      sceneQualityController.getSnapshot().depthOfFieldResolutionScale,
    update: (value) =>
      sceneQualityController.setDepthOfFieldResolutionScale(value as number),
    disabled: () =>
      scenePerformanceController.getSnapshot().skipDepthOfField ||
      sceneQualityController.getSnapshot().depthOfFieldModel !== "current",
  }),
  opticalDepthOfFieldSlider(
    "focusDistanceOffset",
    "render.dof-focus-offset",
    "Focus offset",
    "Move the optical focal plane toward or away from the camera without moving the shelf target.",
    { step: 0.05, decimals: 2, unit: " m" },
  ),
  opticalDepthOfFieldSlider(
    "focusClearRadius",
    "render.dof-clear-radius",
    "In-focus radius",
    "Keep this much depth on either side of the focal plane completely sharp.",
    { step: 0.05, decimals: 2, unit: " m" },
  ),
  opticalDepthOfFieldSlider(
    "focusFalloffMultiplier",
    "render.dof-focus-falloff",
    "Focus transition",
    "Scale the authored distance over which blur grows outside the sharp band.",
    { step: 0.05, decimals: 2, unit: "×" },
  ),
  opticalDepthOfFieldSlider(
    "fStop",
    "render.dof-f-stop",
    "F-stop",
    "Set the simulated aperture. Lower values create larger circles of confusion.",
    { step: 0.1, decimals: 1 },
  ),
  opticalDepthOfFieldSlider(
    "maxBlurRadius",
    "render.dof-max-radius",
    "Blur ceiling",
    "Cap the aperture footprint in CSS pixels so extreme lens values remain bounded.",
    { step: 1, decimals: 0, unit: " px" },
  ),
  opticalDepthOfFieldSlider(
    "edgeSoftness",
    "render.dof-edge-softness",
    "Edge rejection softness",
    "Soften the depth-aware sample cutoff. Low values protect silhouettes; high values blend transitions.",
    { step: 0.1, decimals: 1, unit: " px" },
  ),
  opticalDepthOfFieldSlider(
    "highlightThreshold",
    "render.dof-highlight-threshold",
    "Highlight threshold",
    "Choose the linear-light level where bright aperture discs begin receiving emphasis.",
    { step: 0.05, decimals: 2 },
  ),
  opticalDepthOfFieldSlider(
    "highlightGain",
    "render.dof-highlight-gain",
    "Highlight gain",
    "Increase the brightness retained by out-of-focus highlights without lifting the whole background.",
    { step: 0.05, decimals: 2, unit: "×" },
  ),
  ...(
    [
      [
        "render.virtualize-units",
        "Virtualize distant unit work",
        "virtualizeUnitWork",
      ],
      [
        "render.remember-travel-declines",
        "Remember slow travel frames",
        "rememberTravelDeclines",
      ],
      [
        "render.balance-meadow-tiles",
        "Balance dense meadow tiles",
        "populationBalancedMeadowTiles",
      ],
      [
        "render.suspend-hover-work",
        "Suspend settled hover work",
        "suspendSettledHoverWork",
      ],
    ] as const
  ).map(([id, label, key]) =>
    performanceBoolean({
      id,
      panel: "render",
      group: "render.scheduling",
      label,
      help: `Use the live ${label.toLowerCase()} optimization for this mount.`,
      key,
      optimizationPreset: { optimized: true, unoptimized: false },
      experimental: false,
    }),
  ),
  mutableDescriptor({
    id: "inspect.scope",
    panel: "inspect",
    group: "inspect.scope",
    label: "Scope",
    help: "Limit inspection telemetry to the active shelf or include all shelves.",
    valueKind: "enum",
    allowedValues: {
      kind: "set",
      values: [
        { value: "active", label: "Active shelf" },
        { value: "all", label: "All shelves" },
      ],
    },
    defaultValue: DEFAULT_INSECTS.filter,
    experimental: false,
    behavior: { read: "live", update: "session-only", reset: "reload" },
    store: insectDiagnosticsController,
    read: () => insectDiagnosticsController.getSnapshot().filter,
    update: (value) =>
      insectDiagnosticsController.update({ filter: value as "active" | "all" }),
  }),
  ...(
    [
      [
        "overlay.perch-envelopes",
        "overlay.perches",
        "Markers and wing envelopes",
        "showEnvelopes",
      ],
      [
        "overlay.perch-routes",
        "overlay.perches",
        "Approach and departure routes",
        "showRoutes",
      ],
      [
        "overlay.flight-volumes",
        "overlay.perches",
        "Flight volumes",
        "showFlightVolumes",
      ],
      [
        "overlay.butterfly-trails",
        "overlay.perches",
        "Flight trails · 30 s",
        "showFlightTrails",
      ],
      ["overlay.lamp-cones", "overlay.moths", "Lamp cones", "showLampCones"],
      [
        "overlay.moth-trails",
        "overlay.moths",
        "Flight trails · 30 s",
        "showMothTrails",
      ],
    ] as const
  ).map(([id, subgroup, label, key]) =>
    booleanDescriptor({
      id,
      panel: "inspect",
      group: "inspect.overlays",
      subgroup,
      label,
      help: `Show ${label.toLowerCase()} without changing scene behavior.`,
      defaultValue: DEFAULT_INSECTS[key],
      experimental: false,
      store: insectDiagnosticsController,
      read: () => insectDiagnosticsController.getSnapshot()[key],
      update: (value) =>
        insectDiagnosticsController.update({ [key]: Boolean(value) }),
    }),
  ),
  ...(
    [
      [
        "overlay.physics-helpers",
        "Hulls, poses, vectors, and contacts",
        "showHelpers",
      ],
      ["overlay.physics-bounds", "Prop collider boxes", "showAllBounds"],
    ] as const
  ).map(([id, label, key]) =>
    booleanDescriptor({
      id,
      panel: "inspect",
      group: "inspect.overlays",
      subgroup: "overlay.physics",
      label,
      help: `Show ${label.toLowerCase()} without changing physics behavior.`,
      defaultValue: DEFAULT_PHYSICS[key],
      experimental: false,
      store: physicsDiagnosticsController,
      read: () => physicsDiagnosticsController.getSnapshot()[key],
      update: (value) =>
        physicsDiagnosticsController.update({ [key]: Boolean(value) }),
    }),
  ),
]);

function publicDescriptor(
  descriptor: MutableDescriptor,
): DiagnosticControlDescriptor {
  return Object.freeze({
    id: descriptor.id,
    panel: descriptor.panel,
    group: descriptor.group,
    subgroup: descriptor.subgroup,
    label: descriptor.label,
    help: descriptor.help,
    inputId: descriptor.inputId,
    ariaKeyShortcuts: descriptor.ariaKeyShortcuts,
    valueKind: descriptor.valueKind,
    allowedValues: descriptor.allowedValues,
    defaultValue: descriptor.defaultValue,
    experimental: descriptor.experimental,
    experimentalValues: descriptor.experimentalValues,
    behavior: descriptor.behavior,
    performanceSetting: descriptor.performanceSetting,
    reloadInput: descriptor.reloadInput,
    productionCost: descriptor.productionCost,
    optimizationPreset: descriptor.optimizationPreset,
  });
}

function validValue(
  descriptor: DiagnosticControlDescriptor,
  value: DiagnosticControlValue,
) {
  if (descriptor.allowedValues.kind === "range") {
    if (value === null) return descriptor.allowedValues.automatic != null;
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= descriptor.allowedValues.min &&
      value <= descriptor.allowedValues.max
    );
  }
  return descriptor.allowedValues.values.some((option) =>
    Object.is(option.value, value),
  );
}

export function createSceneDiagnosticsRegistry(
  options: Readonly<{
    entries: readonly DiagnosticRegistryEntry[];
    sectionDefinitions: readonly Readonly<{
      id: string;
      panel: SceneDiagnosticsPanel;
      label: string;
    }>[];
    subgroupLabels?: Readonly<Record<string, string>>;
  }>,
) {
  const entries = Object.freeze([...options.entries]);
  const descriptorById = new Map(
    entries.map((descriptor) => [descriptor.id, descriptor]),
  );
  if (descriptorById.size !== entries.length)
    throw new Error("Scene Diagnostics control IDs must be unique");
  const stores = [...new Set(entries.map((descriptor) => descriptor.store))];
  const listeners = new Set<Listener>();
  let snapshot: DiagnosticRegistrySnapshot | null = null;
  let unsubscribeStores: readonly (() => void)[] | null = null;

  const invalidate = () => {
    snapshot = null;
    for (const listener of listeners) listener();
  };

  const descriptorFor = (id: string) => {
    const descriptor = descriptorById.get(id);
    if (!descriptor)
      throw new Error(`Unknown Scene Diagnostics control: ${id}`);
    return descriptor;
  };

  return Object.freeze({
    descriptors: Object.freeze(entries.map(publicDescriptor)),

    sections(panel: SceneDiagnosticsPanel): readonly DiagnosticControlGroup[] {
      return options.sectionDefinitions
        .filter((section) => section.panel === panel)
        .map((section) => ({
          ...section,
          controls: entries
            .filter((descriptor) => descriptor.group === section.id)
            .map(publicDescriptor),
        }));
    },

    subgroupLabel(id: string) {
      return options.subgroupLabels?.[id] ?? id;
    },

    read(id: string) {
      return descriptorFor(id).read();
    },

    update(id: string, value: DiagnosticControlValue) {
      const descriptor = descriptorFor(id);
      if (!descriptor.update)
        throw new Error(`Scene Diagnostics control is read-only: ${id}`);
      if (!validValue(descriptor, value))
        throw new Error(`Invalid value for Scene Diagnostics control ${id}`);
      descriptor.update(value);
    },

    setGroup(group: string, value: boolean) {
      for (const descriptor of entries)
        if (
          descriptor.group === group &&
          descriptor.valueKind === "boolean" &&
          descriptor.update
        )
          descriptor.update(value);
    },

    groupState(group: string) {
      const values = entries
        .filter(
          (descriptor) =>
            descriptor.group === group && descriptor.valueKind === "boolean",
        )
        .map((descriptor) => Boolean(descriptor.read()));
      const enabled = values.filter(Boolean).length;
      return {
        enabled,
        total: values.length,
        any: enabled > 0,
        all: values.length > 0 && enabled === values.length,
      };
    },

    applyOptimizationPreset(preset: "optimized" | "unoptimized") {
      for (const descriptor of entries)
        if (descriptor.optimizationPreset && descriptor.update)
          descriptor.update(descriptor.optimizationPreset[preset]);
    },

    matchesOptimizationPreset(preset: "optimized" | "unoptimized") {
      const members = entries.filter(
        (descriptor) => descriptor.optimizationPreset,
      );
      return members.every((descriptor) =>
        Object.is(descriptor.read(), descriptor.optimizationPreset?.[preset]),
      );
    },

    subscribe(listener: Listener) {
      if (listeners.size === 0) {
        snapshot = null;
        unsubscribeStores = stores.map((store) => store.subscribe(invalidate));
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        for (const unsubscribe of unsubscribeStores ?? []) unsubscribe();
        unsubscribeStores = null;
        snapshot = null;
      };
    },

    getSnapshot(): DiagnosticRegistrySnapshot {
      snapshot ??= Object.freeze(
        Object.fromEntries(
          entries.map((descriptor) => [
            descriptor.id,
            Object.freeze({
              value: descriptor.read(),
              disabled: descriptor.disabled?.() ?? false,
            }),
          ]),
        ),
      );
      return snapshot;
    },
  });
}

export const sceneDiagnosticsRegistry = createSceneDiagnosticsRegistry({
  entries: descriptors,
  sectionDefinitions: SECTION_DEFINITIONS,
  subgroupLabels: SUBGROUP_LABELS,
});
