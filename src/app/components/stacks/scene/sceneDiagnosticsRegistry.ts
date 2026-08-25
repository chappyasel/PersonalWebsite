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
  DEFAULT_SCENE_PERFORMANCE_SETTINGS,
  type ScenePerformanceBooleanSetting,
  type ScenePerformanceSettings,
  scenePerformanceController,
} from "./scenePerformance";
import { sceneQualityController } from "./sceneQualityController";

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

const SECTION_DEFINITIONS = Object.freeze([
  { id: "simulate.camera", panel: "simulate", label: "Camera" },
  { id: "simulate.meadow", panel: "simulate", label: "Meadow wind" },
  { id: "simulate.insects", panel: "simulate", label: "Insect behavior" },
  { id: "simulate.physics", panel: "simulate", label: "Physics runtime" },
  { id: "render.quality", panel: "render", label: "Quality mode" },
  { id: "render.resolution", panel: "render", label: "Resolution" },
  {
    id: "render.automatic",
    panel: "render",
    label: "Automatic adaptation",
  },
  {
    id: "render.optional",
    panel: "render",
    label: "Optional rendering",
  },
  { id: "render.optimizations", panel: "render", label: "Optimizations" },
  { id: "render.compositing", panel: "render", label: "Compositing" },
  { id: "render.scheduling", panel: "render", label: "Scheduling" },
  { id: "inspect.scope", panel: "inspect", label: "Inspection scope" },
  { id: "inspect.overlays", panel: "inspect", label: "Scene overlays" },
] satisfies readonly Readonly<{
  id: string;
  panel: SceneDiagnosticsPanel;
  label: string;
}>[]);

const SUBGROUP_LABELS: Readonly<Record<string, string>> = Object.freeze({
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
    }>,
): MutableDescriptor {
  const { key, ...metadata } = descriptor;
  return booleanDescriptor({
    ...metadata,
    performanceSetting: key,
    defaultValue: DEFAULT_SCENE_PERFORMANCE_SETTINGS[key],
    store: scenePerformanceController,
    read: () => scenePerformanceController.getSnapshot()[key],
    update: (value) =>
      sceneDiagnosticsRuntime.updatePerformanceBoolean(key, Boolean(value)),
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

const descriptors: readonly MutableDescriptor[] = Object.freeze([
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
  booleanDescriptor({
    id: "quality.freeze-auto",
    panel: "render",
    group: "render.automatic",
    label: "Freeze Auto adaptation",
    help: "Keep recording metrics but stop automatic axis changes.",
    defaultValue: DEFAULT_QUALITY.frozen,
    experimental: false,
    store: sceneQualityController,
    read: () => sceneQualityController.getSnapshot().frozen,
    update: (value) => sceneQualityController.setFrozen(Boolean(value)),
    disabled: () => sceneQualityController.getSnapshot().mode !== "auto",
  }),
  performanceBoolean({
    id: "render.postprocessing",
    panel: "render",
    group: "render.optional",
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
    group: "render.optional",
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
    group: "render.optional",
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
  performanceBoolean({
    id: "render.meadow",
    panel: "render",
    group: "render.optional",
    label: "Meadow",
    help: "Mount meadow geometry, materials, animation, and interactions.",
    key: "meadow",
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
    group: "render.optional",
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
    group: "render.optional",
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
    group: "render.optional",
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
    group: "render.optional",
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
    group: "render.optional",
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
    group: "render.optimizations",
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
    group: "render.compositing",
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
    group: "render.compositing",
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
        true,
        false,
      ],
      [
        "render.adaptive-sharpen",
        "Sharpen reduced-DPR output",
        "adaptiveSharpen",
        true,
        false,
        "One conditional full-frame sharpening pass.",
      ],
      [
        "render.skip-ambient-occlusion",
        "Skip ambient occlusion",
        "skipAmbientOcclusion",
        true,
        false,
        "Ambient-occlusion render targets, samples, and composition work.",
      ],
      [
        "render.skip-bloom",
        "Skip bloom",
        "skipBloom",
        true,
        false,
        "Bloom mip-chain render targets, samples, and composition work.",
      ],
      [
        "render.skip-depth-of-field",
        "Skip depth of field",
        "skipDepthOfField",
        true,
        false,
        "Depth-of-field render targets, depth samples, and composition work.",
      ],
    ] as const
  ).map(([id, label, key, optimized, unoptimized, enabledCost]) =>
    performanceBoolean({
      id,
      panel: "render",
      group: "render.compositing",
      label,
      help: `Use the live ${label.toLowerCase()} comparison for this mount.`,
      key,
      optimizationPreset: { optimized, unoptimized },
      experimental: false,
      ...(key === "skipDepthOfField" ? { reloadInput: "nodof" } : {}),
      ...(enabledCost
        ? {
            productionCost: {
              activeValues: [key.startsWith("skip") ? false : true],
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
  mutableDescriptor({
    id: "render.dof-strength",
    panel: "render",
    group: "render.compositing",
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
    group: "render.compositing",
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
    disabled: () => scenePerformanceController.getSnapshot().skipDepthOfField,
  }),
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
