"use client";

// The WebGL entry point — the only module that pulls @react-three/* into the
// bundle (loaded via dynamic import from StacksHome). Canvas config carries
// the approved prototype look; ScrollControls owns the real scroll container.
import { ScrollControls, useProgress, useScroll } from "@react-three/drei";
import {
  Canvas,
  events as createPointerEvents,
  useFrame,
  useThree,
} from "@react-three/fiber";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type * as THREE from "three";

import { recordModalOriginAtPointer } from "~/lib/originFlight";
import { useTapFirstCapability } from "~/lib/useTapFirstCapability";

import { sceneAudio } from "./audio/sceneAudio";
import { requestBookPrefetch } from "./bookPrefetch";
import { useWorldBootScope } from "./boot/useWorldBoot";
import { assetLoadComplete } from "./boot/worldBootMachine";
import { isWorldRevealed, worldBoot } from "./boot/worldBootSession";
import { type StacksData, UNIT_COUNT } from "./data";
import TouchInteractionLayer from "./input/TouchInteractionLayer";
import { setLoadProgress } from "./loading";
import { modelArtifactRoomShouldFreeze } from "./modal/modelArtifactHandoff";
import { performanceDiagnosticRequested } from "./performanceDiagnosticRequest";
import {
  PERFORMANCE_DIAGNOSTIC_MAX_RUNTIME_CHECKPOINTS,
  PERFORMANCE_DIAGNOSTIC_MAX_RUNTIME_MS,
  PerformanceDiagnosticRuntimeWindow,
  PerformanceDiagnosticVisibleClock,
  performanceDiagnosticPageHideAction,
  performanceDiagnosticProgress,
  performanceDiagnosticSchedule,
} from "./performanceDiagnosticRuntime";
import { cameraTravelDiagnostics } from "./scene/CameraRig";
import { prewarmGrabbablePhysics } from "./scene/Grabbable";
import Scene from "./scene/Scene";
import SceneLayoutEditorGizmo from "./scene/SceneLayoutEditorGizmo";
import {
  devHooksRequested,
  onDevHooksRequested,
  onSceneHooksRequested,
  sceneDevHooksRequestedBySearch,
  sceneDiagnosticsQueryMode,
  sceneInstrumentationRequestedBySearch,
} from "./scene/devHooks";
import type { GolfShotOutcome } from "./scene/golf/golfTypes";
import { setInteractionProjectionContext } from "./scene/interactionProjection";
import { sceneInteractionInventory } from "./scene/interactionRegistry";
import type {
  MeadowDiagnosticsSettings,
  MeadowDiagnosticsUpdate,
} from "./scene/meadowDiagnostics";
import { ScenePerformanceSampler } from "./scene/performanceMetrics";
import {
  performanceProfileController,
  performanceProfileFromSearch,
} from "./scene/performanceProfiles";
import {
  browserPerformanceTraceSession,
  downloadPerformanceTrace,
  observeBrowserPerformanceTrace,
  scenePerformanceTrace,
} from "./scene/performanceTrace";
import { physicsDiagnosticsController } from "./scene/physicsDiagnostics";
import {
  QUALITY_TRAVEL_VALIDATION_MS,
  type RendererCapability,
  SCENE_FRAME_BUDGET_MS,
  type SceneQualityMetrics,
  type SceneQualityMode,
  type SceneQualityPlan,
  type SceneQualityProfile,
  bookCoverWidthForNeed,
  captureResolutionCeilingFromSearch,
  classifySceneFrameConstraint,
  deriveRendererCapability,
  qualityModeFromSearch,
  qualityProfileFromValue,
  resolveSceneQualityPlan,
  sceneQualityStorageBucket,
  startingProfileForDevice,
} from "./scene/quality";
import {
  QUALITY_RESOLUTION_RETRY_MS,
  SCENE_RESOLUTION_MAX_STEP,
  type SceneQualityAxes,
  initialSceneQualityAxisState,
  reduceSceneQualityAxes,
  resolutionStepForScale,
} from "./scene/qualityAxes";
import { sceneQualityEvidence } from "./scene/qualityEvidence";
import {
  type LearnedQuality,
  clearLearnedQuality,
  readLearnedQuality,
  readLearnedSurvivalUntil,
  writeLearnedQuality,
} from "./scene/qualityLearning";
import {
  type SceneQualityLog,
  createSceneQualityLog,
  downloadSceneQualityLog,
} from "./scene/qualityLog";
import { sceneQualityPersistenceStatus } from "./scene/qualityPersistence";
import { createSceneQualitySampler } from "./scene/qualitySampler";
import { SCENE_CANVAS_CONTEXT, sceneBackdropFor } from "./scene/sceneBackdrop";
import {
  sceneColorGradeController,
  sceneColorGradeFor,
  useSceneColorGradeSettings,
} from "./scene/sceneColorGrade";
import "./scene/sceneDiagnosticsRuntime";
import {
  instrumentRendererFrameCost,
  instrumentSceneMatrixCost,
  markSceneFrameInstrumented,
  markSceneFrameStart,
  readSceneFrameCpuMs,
  takeSceneFrameInstrumented,
} from "./scene/sceneFrameCost";
import {
  prewarmSceneGpuPrograms,
  prewarmSceneGpuResources,
  shouldWarmSceneGpuResources,
} from "./scene/sceneGpuPrewarm";
import {
  type SceneLayoutExportRecord,
  sceneLayoutEditorController,
} from "./scene/sceneLayoutEditor";
import SceneLightShapePadding from "./scene/sceneLightShape";
import {
  DEFAULT_SCENE_PERFORMANCE_SETTINGS,
  adaptiveSharpenAmount,
  effectivePlacardGlassMode,
  isSceneTraveling,
  scenePerformanceController,
  scenePerformanceSettingsEqual,
  scenePrewarmDeferred,
  setSceneTraveling,
  useScenePerformanceSettings,
} from "./scene/scenePerformance";
import {
  sceneQualityController,
  useSceneQualityControls,
} from "./scene/sceneQualityController";
import {
  getSeatAmount,
  isSeated,
  leaveSeat,
  requestSeat,
} from "./scene/seated";
import { StaticWorldInvariantProbe } from "./scene/staticWorld";
import { sceneUnitActivityController } from "./scene/unitActivity";
import { CAMERA, STACKS_DESKTOP_MIN_WIDTH } from "./scene/worldLayout";
import { sceneArtifactById } from "./sceneArtifacts";
import { progressRef, useStacks } from "./store";
import { PALETTES } from "./theme";
import VisionRideExperience from "./visionRide/VisionRideExperience";
import { visionRideDiagnosticsController } from "./visionRide/visionRideDiagnostics";
import { visionRideRoomMounted } from "./visionRide/visionRideState";
import { isWebGLContextUsable } from "./webglProbe";
import { scenePointerMoveWithoutCoarseHover } from "~/app/components/stacks/input/scenePointerEvents";

// Mount/unmount ONLY (never enabled={false}: a mounted-disabled composer pins
// the renderer to NoToneMapping = blown frame). Touch uses the same effect
// tiers with a non-MSAA composer target.
const Effects = dynamic(() => import("./scene/Effects"), { ssr: false });

const performanceSampler = new ScenePerformanceSampler();
let qualitySnapshot: Record<string, unknown> = {};
let forceQuality: ((value: SceneQualityMode | number) => void) | null = null;

function scenePointerEvents(coarseTouch: boolean) {
  return (store: Parameters<typeof createPointerEvents>[0]) => {
    const manager = createPointerEvents(store);
    const handlers = manager.handlers;
    if (!handlers) return manager;
    const onPointerMove = handlers.onPointerMove;
    handlers.onPointerMove = scenePointerMoveWithoutCoarseHover(
      coarseTouch,
      onPointerMove,
    );
    return manager;
  };
}

/** Drei's overflow element is natively keyboard-focusable, so leaving it
 * unnamed makes the first Tab stop a full-viewport anonymous div. Name the
 * region without replacing the rail's explicit section controls. */
/**
 * A frozen room (frameloop "never" while a modal or the daylight sheet is
 * up) ignores window resizes, so the canvas stretches its last frame into
 * the new box — which reads as the whole world going blurry the moment the
 * viewport changes. When r3f applies a new size while frozen, paint exactly
 * one frame at it.
 */
function FrozenResizeRepaint({ frozen }: { frozen: boolean }) {
  const size = useThree((s) => s.size);
  const advance = useThree((s) => s.advance);
  const first = useRef(true);
  useEffect(() => {
    if (!frozen) {
      first.current = true;
      return;
    }
    // Skip the freeze-entry run; only size CHANGES while frozen need paint.
    if (first.current) {
      first.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => advance(performance.now()));
    return () => cancelAnimationFrame(frame);
  }, [frozen, size, advance]);
  return null;
}

function ScrollRegionA11y() {
  const { el } = useScroll();
  useEffect(() => {
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Horizontal scene navigation");
    // Chrome treats scrollable containers as keyboard-focusable, and the
    // ride hands focus back here on exit. After any keypress the browser is
    // in keyboard modality, so its default :focus-visible ring drew a blue
    // box around the whole viewport. The region stays focusable for arrow
    // scrolling; it just never paints the ring.
    el.style.outline = "none";
    return () => {
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
      el.style.outline = "";
    };
  }, [el]);
  return null;
}

/** The unmasked renderer string, where the browser exposes it. Blocked in
 * hardened modes and in some privacy configurations, so absence is normal and
 * must cost nothing. */
function readUnmaskedRenderer(
  context: WebGLRenderingContext | WebGL2RenderingContext,
) {
  try {
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    if (!debug) return null;
    const value: unknown = context.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Set once the shader precompile has returned, successfully or not. */
let shaderPrecompileComplete = false;

let glRef: THREE.WebGLRenderer | null = null;
let sceneRef: THREE.Scene | null = null;
let cameraRef: THREE.Camera | null = null;
let devOpenBook: ((id: string) => void) | null = null;

declare global {
  interface Window {
    __stacks?: {
      scrollTo: (unit: number, opts?: { instant?: boolean }) => void;
      hover: (id: string | null) => void;
      openBook: (id: string) => void;
      sit: (on?: boolean) => void;
      state: () => Record<string, unknown>;
      node: (name: string) => Record<string, unknown> | null;
      bbox: (name: string) => Record<string, unknown> | null;
      /** World point to CSS pixels on the page, so a headless run can aim
       * a real pointer at a prop. */
      project: (
        x: number,
        y: number,
        z: number,
      ) => { x: number; y: number; depth: number } | null;
      /** Registered by Meadow in dev: live wind/density knobs.
       * No-arg call returns the current values. */
      meadow?: (opts?: MeadowDiagnosticsUpdate) => MeadowDiagnosticsSettings;
      golf?: {
        state: () => Record<string, unknown>;
        forceNext: (outcome: GolfShotOutcome) => void;
        loose: () => Record<string, unknown>[];
        tapLoose: (key: string) => boolean;
      };
      quality: (value?: SceneQualityMode | number) => Record<string, unknown>;
      qualityLog: (action?: "snapshot" | "download") => SceneQualityLog;
      measure: (action?: "start" | "stop" | "reset") => Record<string, unknown>;
      trace: (
        action?: "status" | "start" | "stop" | "reset" | "download",
      ) => unknown;
      layout?: () => SceneLayoutExportRecord[];
    };
  }
}

function installDevHooks() {
  // Production measurements opt in explicitly. Development keeps the cheap
  // imperative hooks available for scene modules; the expensive diagnostic
  // subscribers and sweeps are gated separately in the rendered tree.
  //
  // `hud`, `debug`, and `harness` all read `window.__stacks.state()`. Only the
  // latter two mount the expensive diagnostic probes; `hud` installs these
  // read-only hooks so production measurements do not change the workload.
  if (
    process.env.NODE_ENV === "production" &&
    !sceneDevHooksRequestedBySearch(window.location.search) &&
    !devHooksRequested()
  )
    return;
  window.__stacks = {
    scrollTo(unit, opts) {
      const { jumpTo, travelTo } = useStacks.getState();
      if (opts?.instant) jumpTo?.(unit);
      else travelTo?.(unit);
    },
    hover(id) {
      useStacks.getState().setHovered(id);
    },
    openBook(id) {
      devOpenBook?.(id);
    },
    // Drive the seat without going through a click. Not a convenience: the
    // click path is deliberately a window-level pointerup keyed off the hover
    // slot (r3f's own onClick is gated on a hit list captured at pointerdown,
    // which does not dispatch reliably under ScrollControls), so a harness
    // that wants to measure the WALK has no business also re-testing the
    // click. Separating them is what lets a failure name itself.
    sit(on = true) {
      if (on) requestSeat();
      else leaveSeat();
    },
    // Read one named object's transform out of the scene graph.
    //
    // Exists because pixels cannot answer questions about WHICH object moved.
    // Verifying that the globe's ball turns inside its stand, rather than the
    // whole assembly turning, is impossible from screenshots: the camera
    // carries a permanent idle bob plus pointer parallax, so over a few
    // seconds every region of the frame reports motion — measured 9.07 on the
    // ball, 6.07 on the stand beside it, 5.51 on a postcard and 2.30 on empty
    // sky. All "moving", none conclusive. A transform is conclusive.
    node(name) {
      const scene = glRef ? sceneRef : null;
      if (!scene) return null;
      let hit: THREE.Object3D | null = null;
      scene.traverse((o) => {
        if (!hit && o.name === name) hit = o;
      });
      if (!hit) return null;
      const o: THREE.Object3D = hit;
      return {
        rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
        position: [o.position.x, o.position.y, o.position.z],
        parentRotation: o.parent
          ? [o.parent.rotation.x, o.parent.rotation.y, o.parent.rotation.z]
          : null,
      };
    },
    // World-space AABB of a named subtree. `node()` returns transforms, which
    // cannot answer "how big is the thing and where does it actually sit" —
    // the question every placement and the seat pose turn on. Built from the
    // Vector3/Box3 instances already on the geometry, because `three` is
    // imported type-only here and a runtime import would enter the bundle.
    bbox(name) {
      const scene = glRef ? sceneRef : null;
      if (!scene) return null;
      let root: THREE.Object3D | null = null;
      scene.traverse((o) => {
        if (!root && o.name === name) root = o;
      });
      if (!root) return null;
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      (root as THREE.Object3D).updateWorldMatrix(true, true);
      (root as THREE.Object3D).traverse((o) => {
        const g = (o as THREE.Mesh).geometry;
        if (!g) return;
        if (!g.boundingBox) g.computeBoundingBox();
        const bb = g.boundingBox;
        if (!bb) return;
        // All eight corners, not just min/max: a rotated child's transformed
        // min/max pair is not its bounds, and every prop in the chair slot is
        // yawed.
        for (let i = 0; i < 8; i++) {
          const v = bb.min.clone();
          if (i & 1) v.x = bb.max.x;
          if (i & 2) v.y = bb.max.y;
          if (i & 4) v.z = bb.max.z;
          v.applyMatrix4(o.matrixWorld);
          const c = [v.x, v.y, v.z];
          for (let k = 0; k < 3; k++) {
            if (c[k]! < lo[k]!) lo[k] = c[k]!;
            if (c[k]! > hi[k]!) hi[k] = c[k]!;
          }
        }
      });
      if (!Number.isFinite(lo[0])) return null;
      const r = (v: number) => Number(v.toFixed(4));
      return {
        min: lo.map(r),
        max: hi.map(r),
        size: hi.map((h, i) => r(h - lo[i]!)),
        center: hi.map((h, i) => r((h + lo[i]!) / 2)),
      };
    },
    project(x, y, z) {
      const c = cameraRef;
      const gl = glRef;
      if (!c || !gl) return null;
      c.updateMatrixWorld(true);
      // Cloned off the camera's own position: `three` is type-only here.
      const v = c.position.clone().set(x, y, z).project(c);
      const r = gl.domElement.getBoundingClientRect();
      return {
        x: r.left + ((v.x + 1) / 2) * r.width,
        y: r.top + ((1 - v.y) / 2) * r.height,
        depth: v.z,
      };
    },
    state() {
      const {
        activeUnit,
        modalOpen,
        panelState,
        hovered,
        focusedInteraction,
        dragging,
        travelTo,
        visionRidePhase,
        visionRideReady,
        visionRideModelStatus,
      } = useStacks.getState();
      return {
        offset: progressRef.current,
        activeUnit,
        // Straight from the boot machine. The scene store used to keep its own
        // copy, which nothing but this line read and nothing but the homepage
        // wrote — a second owner that could only ever be wrong.
        mode: worldBoot.getView().mode,
        modalOpen,
        panelState,
        // The seat is a THREE-way handshake (SitChair writes it, CameraRig
        // eases it, SceneEnvironment reads it) that deliberately bypasses
        // React, so without these two the only evidence a click seated you is
        // the frame looking different — and the frame ALSO looks different
        // when the click missed and you merely nudged the pointer parallax.
        // `seated` is the intent; `seatAmount` is what the camera actually
        // did with it. They disagree exactly when the rig drops the seat, so
        // reporting both is what makes that failure legible.
        seated: isSeated(),
        seatAmount: Number(getSeatAmount().toFixed(4)),
        // Where the camera is and which way it faces. `yaw` is the compass
        // bearing of the view direction, so the 180° turn into the seat is one
        // number rather than a quaternion to eyeball, and pointer parallax is
        // checkable by sampling it at two pointer positions — which is the only
        // honest way to test that panning goes the RIGHT way, since a
        // screenshot cannot tell you which direction a view swung.
        camera: (() => {
          const c = cameraRef;
          if (!c) return null;
          // The view direction is the NEGATED third column of the world
          // matrix. Taken from the matrix rather than `getWorldDirection`
          // because `three` is imported type-only in this file — there is no
          // Vector3 constructor here to hand it, and adding a runtime three
          // import to a dev hook would pull it into the bundle.
          const e = c.matrixWorld.elements;
          const dx = -(e[8] ?? 0);
          const dz = -(e[10] ?? 0);
          return {
            pos: [c.position.x, c.position.y, c.position.z].map((v) =>
              Number(v.toFixed(4)),
            ),
            yaw: Number(((Math.atan2(dx, -dz) * 180) / Math.PI).toFixed(2)),
            fov: Number(((c as { fov?: number }).fov ?? 0).toFixed(2)),
          };
        })(),
        // Hover, Touch Focus and carry are scene-internal (they deliberately
        // never re-render React), so the harness has no other way to observe
        // which prop the pointer owns or whether one is in hand.
        hovered,
        focusedInteraction,
        dragging,
        interactions: sceneInteractionInventory().map((interaction) => ({
          id: interaction.id,
          activeUnits: interaction.activeUnits,
          movable: Boolean(interaction.movable),
          activation: interaction.activation?.kind ?? null,
        })),
        controlsReady: Boolean(travelTo),
        dpr: glRef?.getPixelRatio() ?? null,
        framebuffer: glRef
          ? {
              buffer: [glRef.domElement.width, glRef.domElement.height],
              css: [
                glRef.domElement.clientWidth,
                glRef.domElement.clientHeight,
              ],
              deviceDpr: window.devicePixelRatio,
            }
          : null,
        textures: glRef?.info.memory.textures ?? null,
        geometries: glRef?.info.memory.geometries ?? null,
        calls: glRef?.info.render.calls ?? null,
        triangles: glRef?.info.render.triangles ?? null,
        points: glRef?.info.render.points ?? null,
        lines: glRef?.info.render.lines ?? null,
        programs: glRef?.info.programs?.length ?? null,
        quality: { ...qualitySnapshot },
        audio: sceneAudio.snapshot(),
        visionRide: {
          phase: visionRidePhase,
          ready: visionRideReady,
          enabled: visionRideDiagnosticsController.getSnapshot().enabled,
          modelStatus: visionRideModelStatus,
          soundtrackStatus: sceneAudio.snapshot().rideStatus,
        },
        measurement: performanceSampler.summary(),
      };
    },
    quality(value) {
      if (value != null) forceQuality?.(value);
      return { ...qualitySnapshot };
    },
    qualityLog(action = "snapshot") {
      const context = glRef?.getContext() ?? null;
      const generatedAt = new Date().toISOString();
      const memory = (navigator as { deviceMemory?: number }).deviceMemory;
      const log = createSceneQualityLog({
        generatedAt,
        elapsedMs: Number(performance.now().toFixed(1)),
        visibility: document.visibilityState,
        queryFlags: [
          ...new Set(new URLSearchParams(window.location.search).keys()),
        ],
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          deviceDpr: window.devicePixelRatio,
        },
        device: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          hardwareConcurrency: Number.isFinite(navigator.hardwareConcurrency)
            ? navigator.hardwareConcurrency
            : null,
          deviceMemoryGb:
            typeof memory === "number" && Number.isFinite(memory)
              ? memory
              : null,
        },
        renderer: {
          maxTextureSize: glRef?.capabilities.maxTextureSize ?? null,
          maxSamples:
            glRef && glRef.capabilities.isWebGL2 && context
              ? Number(
                  (context as WebGL2RenderingContext).getParameter(
                    (context as WebGL2RenderingContext).MAX_SAMPLES,
                  ),
                )
              : null,
          unmaskedRenderer: context ? readUnmaskedRenderer(context) : null,
        },
        evidence: sceneQualityEvidence.snapshot(),
        quality: { ...qualitySnapshot },
      });
      if (action === "download") downloadSceneQualityLog(log);
      return log;
    },
    measure(action) {
      if (action === "start") performanceSampler.start();
      if (action === "stop") performanceSampler.stop();
      if (action === "reset") performanceSampler.reset();
      return performanceSampler.summary();
    },
    trace(action = "status") {
      if (action === "start") {
        const context = glRef?.getContext();
        scenePerformanceTrace.start({
          session: browserPerformanceTraceSession({
            queryFlags: [
              ...new Set(new URLSearchParams(window.location.search).keys()),
            ],
            testProfile: performanceProfileController.getSnapshot(),
            theme: document.documentElement.classList.contains("dark")
              ? "dark"
              : "light",
            buildMode: process.env.NODE_ENV,
            quality: { ...qualitySnapshot },
            performanceSettings: scenePerformanceController.getSnapshot(),
            renderer: glRef
              ? {
                  maxTextureSize: glRef.capabilities.maxTextureSize,
                  maxSamples:
                    typeof WebGL2RenderingContext !== "undefined" &&
                    context instanceof WebGL2RenderingContext
                      ? Number(
                          context.getParameter(context.MAX_SAMPLES) as unknown,
                        )
                      : 0,
                }
              : null,
          }),
        });
        performanceSampler.start();
        return scenePerformanceTrace.getStatus();
      }
      if (action === "stop") {
        performanceSampler.stop();
        return scenePerformanceTrace.stop();
      }
      if (action === "reset") {
        performanceSampler.reset();
        scenePerformanceTrace.reset();
        return scenePerformanceTrace.getStatus();
      }
      if (action === "download") {
        const report = scenePerformanceTrace.report();
        downloadPerformanceTrace(report);
        return report;
      }
      return scenePerformanceTrace.getStatus();
    },
  };
  if (process.env.NODE_ENV === "development") {
    window.__stacks.layout = () => sceneLayoutEditorController.export();
  }
}

/** Republishes three's DefaultLoadingManager progress to the boot screen,
 * which cannot subscribe to it directly: drei lives in this chunk and the
 * boot screen ships in the initial entry. Renders null and sits outside the
 * Canvas — `useProgress` is a plain store, not a scene hook, and putting it
 * in the tree would re-render the scene on every asset. */
function LoadReporter() {
  const scope = useWorldBootScope();
  useEffect(() => {
    const publish = () => {
      const { active, loaded, total, errors, progress } =
        useProgress.getState();
      setLoadProgress(progress / 100);
      scope.send({
        type: "assetLoad",
        assets: { active, loaded, total, errors: errors.length },
      });
    };
    publish();
    return useProgress.subscribe(publish);
  }, [scope]);
  return null;
}

// Keeps tone-mapping exposure in sync when the theme flips after mount.
function Exposure({ dark }: { dark: boolean }) {
  const gl = useThree((s) => s.gl);
  const baseColorGrade = useSceneColorGradeSettings();
  const { cinematicPlus } = useSceneQualityControls();
  const colorGrade = sceneColorGradeFor(baseColorGrade, cinematicPlus);
  useEffect(() => {
    gl.toneMappingExposure = dark
      ? colorGrade.dark.exposure
      : colorGrade.light.exposure;
  }, [colorGrade, gl, dark]);
  return null;
}

/** Composer failures are contained inside the functioning R3F world. Actual
 * context loss is still handled by Canvas's context-lost listener and hands
 * the page back to the existing flat fallback. */
class EffectsErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ContextSafeEffects({
  dark,
  plan,
  sharpenAmount,
  onComposerError,
}: {
  dark: boolean;
  plan: SceneQualityPlan["effects"];
  sharpenAmount: number;
  onComposerError: () => void;
}) {
  const gl = useThree((state) => state.gl);
  const usable = isWebGLContextUsable(gl.getContext());

  useEffect(() => {
    if (!usable) onComposerError();
  }, [onComposerError, usable]);

  return usable ? (
    <EffectsErrorBoundary onError={onComposerError}>
      <Effects dark={dark} plan={plan} sharpenAmount={sharpenAmount} />
    </EffectsErrorBoundary>
  ) : null;
}

/** Records only while the development harness has an active measurement.
 * Three resets renderer.info after every render call by default, which makes
 * a postprocessed frame report only its final fullscreen pass. Reset once at
 * the start of the R3F frame instead so the HUD/harness see the whole
 * multi-pass frame. */
function PerformanceProbe({ instrumentFrames }: { instrumentFrames: boolean }) {
  const coarseTouchCapability = useTapFirstCapability();
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = previous;
    };
  }, [gl]);
  useFrame((_, delta) => {
    // The full diagnostics harness changes the measured workload and must not
    // teach Auto. The lightweight support report keeps Auto live so it records
    // the same recovery policy a visitor actually experiences.
    if (instrumentFrames) markSceneFrameInstrumented();
    if (scenePerformanceTrace.isActive() && !document.hidden) {
      const state = useStacks.getState();
      const quality = qualitySnapshot as {
        profile?: unknown;
        effectiveDpr?: unknown;
      };
      const activity = sceneUnitActivityController.snapshot();
      const matrix = camera.matrixWorld.elements;
      const viewX = -(matrix[8] ?? 0);
      const viewZ = -(matrix[10] ?? 1);
      scenePerformanceTrace.frame({
        at: performance.now(),
        frameMs: delta * 1_000,
        moving: isSceneTraveling(),
        progress: progressRef.current,
        activeUnit: state.activeUnit,
        renderer: {
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          points: gl.info.render.points,
          lines: gl.info.render.lines,
          textures: gl.info.memory.textures,
          geometries: gl.info.memory.geometries,
          programs: gl.info.programs?.length ?? 0,
        },
        physicsMs: physicsDiagnosticsController.getTimingSnapshot().frameMs,
        cameraYawDeg: Number(
          ((Math.atan2(viewX, -viewZ) * 180) / Math.PI).toFixed(3),
        ),
        cameraLookLagX: Number(cameraTravelDiagnostics.lookLagX.toFixed(4)),
        visibleUnits: activity.visible,
        qualityProfile:
          typeof quality.profile === "string" ? quality.profile : null,
        dpr:
          typeof quality.effectiveDpr === "number"
            ? quality.effectiveDpr
            : null,
        glassMode: effectivePlacardGlassMode(
          scenePerformanceController.getSnapshot().placardGlassMode,
          coarseTouchCapability,
        ),
        unitActivity: activity.states,
        unitWorkExecuted: activity.executed,
        unitWorkSkipped: activity.skipped,
      });
    }
    gl.info.reset();
    performanceSampler.frame(delta);
  }, -1_000);
  return null;
}

function PerformanceTraceObservers() {
  useEffect(() => {
    const disconnectBrowserObservers = observeBrowserPerformanceTrace();
    let previousSettings = scenePerformanceController.getSnapshot();
    const unsubscribeSettings = scenePerformanceController.subscribe(() => {
      const settings = scenePerformanceController.getSnapshot();
      if (scenePerformanceSettingsEqual(settings, previousSettings)) return;
      previousSettings = settings;
      scenePerformanceTrace.event({
        at: performance.now(),
        type: "performance-settings",
        detail: { ...settings },
      });
    });
    return () => {
      disconnectBrowserObservers();
      unsubscribeSettings();
    };
  }, []);
  return null;
}

/** `?perf-report=1` owns a bounded trace and sends its compact form after the
 * visitor has had time to move through the room. The report keeps aggregates,
 * renderer edges, and quality evidence. It never uploads resource names or
 * raw per-frame records. */
function AutomaticPerformanceDiagnosticRun() {
  useEffect(() => {
    let disposed = false;
    let stop = () => {
      // The diagnostic chunk has not installed its listeners yet.
    };

    void import("./performanceDiagnostic")
      .then(
        ({
          compactScenePerformanceDiagnostic,
          createPerformanceDiagnosticEvent,
          performanceDiagnosticRunId,
          submitPerformanceDiagnostic,
          worldBootBlockingGate,
        }) => {
          if (disposed) return;
          const initialState = worldBoot.getState();
          const runId = performanceDiagnosticRunId(initialState.epoch);
          const ownsTrace = !scenePerformanceTrace.isActive();
          if (ownsTrace) {
            scenePerformanceTrace.start({
              session: browserPerformanceTraceSession({
                diagnosticRunId: runId,
                queryFlags: [
                  ...new Set(
                    new URLSearchParams(window.location.search).keys(),
                  ),
                ],
                testProfile: performanceProfileController.getSnapshot(),
                theme: document.documentElement.classList.contains("dark")
                  ? "dark"
                  : "light",
                buildMode: process.env.NODE_ENV,
                quality: { ...qualitySnapshot },
                performanceSettings: scenePerformanceController.getSnapshot(),
                autoReport: true,
              }),
            });
            performanceSampler.start();
          }

          let finished = false;
          let checkpointIndex = 0;
          let checkpointTimer = 0;
          let completionTimer = 0;
          let progressTimer = 0;
          let deadline = 0;
          const runtimeWindow = new PerformanceDiagnosticRuntimeWindow();
          const deadlineWindow = new PerformanceDiagnosticVisibleClock(
            PERFORMANCE_DIAGNOSTIC_MAX_RUNTIME_MS,
          );
          const lifecycle: Array<{
            at_ms: number;
            type:
              | "visibility-visible"
              | "visibility-hidden"
              | "pageshow"
              | "pagehide";
            persisted: boolean | null;
          }> = [];

          performanceDiagnosticProgress.reset();
          deadlineWindow.start(performance.now(), !document.hidden);

          const elapsedSinceBoot = (now: number) => {
            const startedAt = worldBoot.getState().startedAt;
            return Math.max(0, Math.round(now - (startedAt ?? now)));
          };
          const recordLifecycle = (
            type: (typeof lifecycle)[number]["type"],
            now: number,
            persisted: boolean | null = null,
          ) => {
            lifecycle.push({
              at_ms: elapsedSinceBoot(now),
              type,
              persisted,
            });
            if (lifecycle.length > 16)
              lifecycle.splice(0, lifecycle.length - 16);
          };
          const clearRuntimeTimers = () => {
            window.clearTimeout(checkpointTimer);
            window.clearTimeout(completionTimer);
            window.clearTimeout(deadline);
            window.clearInterval(progressTimer);
            checkpointTimer = 0;
            completionTimer = 0;
            deadline = 0;
            progressTimer = 0;
          };
          const publishProgress = () => {
            const snapshot = runtimeWindow.snapshot(performance.now());
            performanceDiagnosticProgress.publish({
              started: snapshot.started,
              paused: snapshot.paused,
              observedMs: snapshot.observedMs,
              remainingMs: snapshot.remainingMs,
            });
          };
          const buildEvent = ({
            reportKind,
            reason,
            pagehidePersisted,
            terminal,
            reportCheckpointIndex,
          }: {
            reportKind: "runtime_checkpoint" | "runtime";
            reason:
              | "post_reveal_checkpoint"
              | "post_reveal_window"
              | "boot_failed"
              | "capture_deadline"
              | "pagehide";
            pagehidePersisted: boolean | null;
            terminal: boolean;
            reportCheckpointIndex?: number;
          }) => {
            const now = performance.now();
            const runtime = runtimeWindow.snapshot(now);
            const capture = deadlineWindow.snapshot(now);
            if (terminal && ownsTrace) performanceSampler.stop();
            const trace =
              terminal && ownsTrace
                ? scenePerformanceTrace.stop()
                : scenePerformanceTrace.report();
            const quality = window.__stacks?.qualityLog("snapshot") ?? null;
            const compact = compactScenePerformanceDiagnostic({
              trace,
              quality,
            });
            const report = {
              ...compact,
              runtime_capture: {
                post_reveal_observed_ms: Math.round(runtime.observedMs),
                capture_visible_ms: Math.round(capture.observedMs),
                paused: runtime.paused,
                pagehide_persisted: pagehidePersisted,
                visibility: document.visibilityState,
                focused: document.hasFocus(),
                lifecycle: lifecycle.slice(-16),
              },
            };
            const state = worldBoot.getState();
            return createPerformanceDiagnosticEvent({
              diagnosticRunId: runId,
              reportKind,
              captureReason: reason,
              checkpointIndex: reportCheckpointIndex,
              elapsedMs: elapsedSinceBoot(now),
              bootStatus: state.status,
              bootPath: state.loadPath,
              blockingGate: worldBootBlockingGate(state),
              postRevealObservedMs: runtime.observedMs,
              pagehidePersisted,
              report,
            });
          };

          const publishCheckpoint = (
            reason: "post_reveal_checkpoint" | "pagehide",
            pagehidePersisted: boolean | null,
          ) => {
            if (
              finished ||
              checkpointIndex >= PERFORMANCE_DIAGNOSTIC_MAX_RUNTIME_CHECKPOINTS
            )
              return;
            checkpointIndex += 1;
            const event = buildEvent({
              reportKind: "runtime_checkpoint",
              reason,
              pagehidePersisted,
              terminal: false,
              reportCheckpointIndex: checkpointIndex,
            });
            void submitPerformanceDiagnostic(event);
          };

          const finish = (
            reason:
              | "post_reveal_window"
              | "boot_failed"
              | "capture_deadline"
              | "pagehide",
            pagehidePersisted: boolean | null = null,
          ) => {
            if (finished) return;
            finished = true;
            clearRuntimeTimers();
            const event = buildEvent({
              reportKind: "runtime",
              reason,
              pagehidePersisted,
              terminal: true,
            });
            const runtime = runtimeWindow.snapshot(performance.now());
            performanceDiagnosticProgress.publish({
              started: runtime.started,
              paused: false,
              observedMs: runtime.observedMs,
              remainingMs: null,
            });
            void submitPerformanceDiagnostic(event);
          };

          const armRuntimeTimers = () => {
            clearRuntimeTimers();
            if (finished) return;
            const runtime = runtimeWindow.snapshot(performance.now());
            const capture = deadlineWindow.snapshot(performance.now());
            const schedule = performanceDiagnosticSchedule({
              finished,
              runtime,
              capture,
              checkpointCount: checkpointIndex,
            });
            publishProgress();
            if (schedule.deadlineInMs !== null) {
              deadline = window.setTimeout(
                () => finish("capture_deadline"),
                schedule.deadlineInMs,
              );
            }
            if (schedule.checkpointInMs !== null) {
              checkpointTimer = window.setTimeout(() => {
                runtimeWindow.markCheckpointSent();
                publishCheckpoint("post_reveal_checkpoint", null);
                armRuntimeTimers();
              }, schedule.checkpointInMs);
            }
            if (schedule.completionInMs !== null) {
              completionTimer = window.setTimeout(
                () => finish("post_reveal_window"),
                schedule.completionInMs,
              );
            }
            if (schedule.progressActive)
              progressTimer = window.setInterval(publishProgress, 1_000);
          };

          const observeBoot = () => {
            const state = worldBoot.getState();
            if (state.status === "failed") {
              finish("boot_failed");
              return;
            }
            if (
              !runtimeWindow.snapshot(performance.now()).started &&
              (state.status === "revealing" || state.status === "live")
            ) {
              runtimeWindow.start(performance.now(), !document.hidden);
              armRuntimeTimers();
            }
          };

          observeBoot();
          const unsubscribe = worldBoot.subscribe(observeBoot);
          armRuntimeTimers();
          const onVisibility = () => {
            if (finished) return;
            const now = performance.now();
            const visible = !document.hidden;
            recordLifecycle(
              visible ? "visibility-visible" : "visibility-hidden",
              now,
            );
            runtimeWindow.setVisible(visible, now);
            deadlineWindow.setVisible(visible, now);
            armRuntimeTimers();
          };
          const onPageHide = (event: PageTransitionEvent) => {
            if (finished) return;
            const now = performance.now();
            recordLifecycle("pagehide", now, event.persisted);
            runtimeWindow.setVisible(false, now);
            deadlineWindow.setVisible(false, now);
            clearRuntimeTimers();
            if (
              performanceDiagnosticPageHideAction(event.persisted) ===
              "checkpoint"
            ) {
              const runtime = runtimeWindow.snapshot(now);
              if (runtime.checkpointRemainingMs === 0)
                runtimeWindow.markCheckpointSent();
              publishCheckpoint("pagehide", true);
              publishProgress();
              return;
            }
            finish("pagehide", false);
          };
          const onPageShow = (event: PageTransitionEvent) => {
            if (!event.persisted || finished) return;
            const now = performance.now();
            recordLifecycle("pageshow", now, true);
            runtimeWindow.setVisible(!document.hidden, now);
            deadlineWindow.setVisible(!document.hidden, now);
            armRuntimeTimers();
          };
          document.addEventListener("visibilitychange", onVisibility);
          window.addEventListener("pagehide", onPageHide);
          window.addEventListener("pageshow", onPageShow);
          stop = () => {
            unsubscribe();
            clearRuntimeTimers();
            window.clearTimeout(deadline);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", onPageHide);
            window.removeEventListener("pageshow", onPageShow);
            performanceDiagnosticProgress.reset();
            if (!finished && ownsTrace) {
              performanceSampler.stop();
              scenePerformanceTrace.stop();
            }
          };
        },
      )
      .catch(() => {
        // A support-only reporter may fail without affecting the room.
      });

    return () => {
      disposed = true;
      stop();
    };
  }, []);
  return null;
}

const subscribeToWorldBoot = (listener: () => void) =>
  worldBoot.subscribe(listener);
const readWorldBootEpoch = () => worldBoot.getState().epoch;

function AutomaticPerformanceDiagnosticEpoch() {
  const epoch = useSyncExternalStore(
    subscribeToWorldBoot,
    readWorldBootEpoch,
    readWorldBootEpoch,
  );
  return <AutomaticPerformanceDiagnosticRun key={epoch} />;
}

function AutomaticPerformanceDiagnostic() {
  return performanceDiagnosticRequested(window.location.search) ? (
    <AutomaticPerformanceDiagnosticEpoch />
  ) : null;
}

/** Two-second rolling window evaluated four times a second, graded against an
 * absolute 60 Hz budget. Frame interval and main-thread cost are aggregated
 * the same way over the same window, so the ratio between them can say which
 * resource the window was short of.
 *
 * This subscriber owns the only negative frame priority in the scene, so r3f
 * runs it before any other frame work. That makes the top of this callback the
 * frame's start; the renderer wrapper closes the measurement at submission. */
function AdaptiveQualityProbe({
  onSample,
  onVisibility,
  recordEvidence,
}: {
  onSample: (metrics: SceneQualityMetrics, instrumented: boolean) => void;
  onVisibility: (visible: boolean, now: number) => void;
  recordEvidence: boolean;
}) {
  const sampler = useRef<ReturnType<typeof createSceneQualitySampler> | null>(
    null,
  );
  sampler.current ??= createSceneQualitySampler({
    now: performance.now(),
    visible: !document.hidden,
  });

  useEffect(() => {
    if (recordEvidence) sceneQualityEvidence.reset();
    const recordLifecycle = (
      type: Parameters<typeof sceneQualityEvidence.recordLifecycle>[0]["type"],
      persisted: boolean | null = null,
    ) =>
      sceneQualityEvidence.recordLifecycle({
        at: performance.now(),
        type,
        persisted,
      });
    const visibility = () => {
      const now = performance.now();
      const visible = !document.hidden;
      if (recordEvidence)
        sceneQualityEvidence.recordLifecycle({
          at: now,
          type: visible ? "visibility-visible" : "visibility-hidden",
          persisted: null,
        });
      sampler.current?.setDocumentVisible(visible, now);
      onVisibility(visible, now);
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (recordEvidence) recordLifecycle("pageshow", event.persisted);
      if (!event.persisted) return;
      const now = performance.now();
      sampler.current?.resume(now);
      onVisibility(true, now);
    };
    const pageHide = (event: PageTransitionEvent) => {
      if (recordEvidence) recordLifecycle("pagehide", event.persisted);
    };
    const focus = () => {
      if (recordEvidence) recordLifecycle("window-focus");
    };
    const blur = () => {
      if (recordEvidence) recordLifecycle("window-blur");
    };
    const freeze = () => {
      if (recordEvidence) recordLifecycle("freeze");
    };
    const resume = () => {
      if (recordEvidence) recordLifecycle("resume");
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    document.addEventListener("freeze", freeze);
    document.addEventListener("resume", resume);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("pagehide", pageHide);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
      document.removeEventListener("freeze", freeze);
      document.removeEventListener("resume", resume);
    };
  }, [onVisibility, recordEvidence]);

  useFrame((_, delta) => {
    const now = performance.now();
    // The cost recorded by the renderer wrapper belongs to the frame that was
    // submitted before this callback ran, so it lags by one frame.
    const cpuMs = readSceneFrameCpuMs();
    // Development-only overlays make frames the production build never pays
    // for. Keep those frames visible to the HUD and profiler, but mark the
    // whole overlapping window as untrusted for automatic adaptation.
    const instrumented = takeSceneFrameInstrumented();
    markSceneFrameStart(now);
    const sample = sampler.current!.push({
      now,
      frameMs: delta * 1_000,
      cpuMs,
      instrumented,
      visible: !document.hidden,
    });
    if (sample) onSample(sample.metrics, sample.instrumented);
  }, -999);
  return null;
}

/** Matrix timing exists for diagnostics, not for the quality feedback loop.
 * Install its renderer monkey-patch only after diagnostics are requested. */
function SceneMatrixCostProbe() {
  const scene = useThree((state) => state.scene);
  useEffect(() => instrumentSceneMatrixCost(scene), [scene]);
  return null;
}

/** Owns the world-only audio lifecycle. The capture listeners synchronously
 * create/resume Web Audio inside the visitor's first real gesture; downloads
 * and ambience begin only after that autoplay-safe unlock. */
function SceneAudioBridge() {
  const camera = useThree((state) => state.camera);
  useEffect(() => {
    const unlock = (event: Event) => {
      const soundToggle =
        event.target instanceof Element
          ? event.target.closest("[data-sound-toggle]")
          : null;
      // If the first gesture is the currently-on button, its click is about
      // to mute. Do not initialize or download audio just to turn it off.
      if (soundToggle && !sceneAudio.snapshot().muted) return;
      sceneAudio.unlock();
    };
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    const visibility = () => sceneAudio.visibility(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    sceneAudio.startAmbience();
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
      document.removeEventListener("visibilitychange", visibility);
      sceneAudio.teardown();
    };
  }, []);
  useFrame(() => {
    const e = camera.matrixWorld.elements;
    sceneAudio.updateListener(
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: -(e[8] ?? 0), y: -(e[9] ?? 0), z: -(e[10] ?? 1) },
    );
  });
  return null;
}

/**
 * ScrollControls also moves for rail/deep-link navigation, so DOM wheel and
 * touch listeners cannot identify every expensive camera traverse. The
 * canonical progress ref catches all paths and emits React state only at the
 * beginning/end of movement, never per frame.
 */
type TravelFrames = Readonly<{ total: number; late: number }>;

function MovementProbe({
  onChange,
}: {
  onChange: (moving: boolean, frames?: TravelFrames) => void;
}) {
  const previous = useRef(progressRef.current);
  const moving = useRef(false);
  const lastMovedAt = useRef(-Infinity);
  const frames = useRef({ total: 0, late: 0 });
  useFrame((_, delta) => {
    const now = performance.now();
    const progress = progressRef.current;
    if (Math.abs(progress - previous.current) > 0.000_002) {
      lastMovedAt.current = now;
      if (!moving.current) {
        moving.current = true;
        frames.current = { total: 0, late: 0 };
        setSceneTraveling(true);
        onChange(true);
      }
      frames.current.total += 1;
      if (delta * 1_000 > SCENE_FRAME_BUDGET_MS * 1.5) frames.current.late += 1;
    } else if (moving.current && now - lastMovedAt.current >= 650) {
      moving.current = false;
      setSceneTraveling(false);
      onChange(false, { ...frames.current });
    }
    previous.current = progress;
  });
  useEffect(() => () => setSceneTraveling(false), []);
  return null;
}

/** Finish each mounted scene variant's one-time GPU work before interaction. */
function ShaderPrewarm({
  variant,
  resourceVariant,
}: {
  variant: string;
  resourceVariant: string;
}) {
  const { gl, scene, camera } = useThree();
  const warmedResourceVariant = useRef<string | null>(null);
  useEffect(() => {
    shaderPrecompileComplete = false;
    let cancelled = false;
    let timeout = 0;
    let firstFrame = 0;
    let secondFrame = 0;
    const cancelScheduled = () => {
      window.clearTimeout(timeout);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      timeout = 0;
      firstFrame = 0;
      secondFrame = 0;
    };
    const assetsReady = () => {
      const { active, loaded, total, errors } = useProgress.getState();
      return assetLoadComplete({
        active,
        loaded,
        total,
        errors: errors.length,
      });
    };
    const schedule = () => {
      if (cancelled) return;
      cancelScheduled();
      if (!assetsReady()) return;
      if (scenePrewarmDeferred()) {
        timeout = window.setTimeout(schedule, 250);
        return;
      }
      // LoadingManager resolves before React necessarily commits the Suspense
      // children that consumed the asset. Two frames keep the compile on the
      // completed graph while remaining inside the boot gate's 250 ms quiet
      // period. A new loading batch cancels this through the store listener.
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (cancelled) return;
          if (!assetsReady()) {
            schedule();
            return;
          }
          if (scenePrewarmDeferred()) {
            timeout = window.setTimeout(schedule, 250);
            return;
          }
          // The synchronous offscreen draw is intentional instrumentation:
          // it is hidden by the boot screen and must never teach Auto that a
          // normal frame costs the same amount.
          markSceneFrameInstrumented();
          try {
            if (
              shouldWarmSceneGpuResources(
                warmedResourceVariant.current,
                resourceVariant,
              )
            ) {
              prewarmSceneGpuResources({
                renderer: gl,
                scene,
                camera,
                withUnitRootsVisible: (run) =>
                  sceneUnitActivityController.withAllRootsVisible(run),
              });
              warmedResourceVariant.current = resourceVariant;
            } else {
              // Theme, effects, and light-mode changes need every mounted
              // program shape, not another synchronous upload of resources
              // that are already resident.
              prewarmSceneGpuPrograms({
                renderer: gl,
                scene,
                camera,
                withUnitRootsVisible: (run) =>
                  sceneUnitActivityController.withAllRootsVisible(run),
              });
            }
          } catch {
            // Warming is an optimization. A driver that rejects the 1x1 path
            // must not prevent the already-renderable world from starting.
          }
          shaderPrecompileComplete = true;
        });
      });
    };
    const unsubscribe = useProgress.subscribe(schedule);
    schedule();
    return () => {
      cancelled = true;
      unsubscribe();
      cancelScheduled();
      shaderPrecompileComplete = false;
    };
  }, [camera, gl, resourceVariant, scene, variant]);
  return null;
}

/** Fine-pointer/full-quality desktops pay the solver startup after the first
 * painted frame, never during the first grab. The import remains lazy. */
function PhysicsPrewarm() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches)
      return;
    let idle = 0;
    let timeout = 0;
    const schedule = () => {
      if (scenePrewarmDeferred()) {
        timeout = window.setTimeout(schedule, 250);
        return;
      }
      const api = window as Window & {
        requestIdleCallback?: Window["requestIdleCallback"];
      };
      if (api.requestIdleCallback)
        idle = api.requestIdleCallback(
          () => {
            if (scenePrewarmDeferred()) {
              timeout = window.setTimeout(schedule, 250);
              return;
            }
            prewarmGrabbablePhysics();
          },
          { timeout: 1800 },
        );
      else
        timeout = window.setTimeout(() => {
          if (scenePrewarmDeferred()) schedule();
          else prewarmGrabbablePhysics();
        }, 450);
    };
    const frame = requestAnimationFrame(schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      if (idle) window.cancelIdleCallback?.(idle);
    };
  }, []);
  return null;
}

export default function StacksCanvas({
  data,
  onReady,
  onLost,
}: {
  data: StacksData;
  onReady: () => void;
  /** The context went away after a successful start (driver reset, GPU
   * process crash, too many live contexts). A dead viewport is worse than
   * the document, so this hands the page back. */
  onLost?: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const palette = PALETTES[dark ? "dark" : "light"];
  const performanceSettings = useScenePerformanceSettings();
  // Book and model inspection freeze the room. Photo inspection leaves it
  // alive behind the same translucent treatment as Field Notes.
  const panelState = useStacks((s) => s.panelState);
  const modalOpen = useStacks((s) => s.modalOpen);
  const visionRidePhase = useStacks((s) => s.visionRidePhase);
  const roomMounted = visionRideRoomMounted(visionRidePhase);
  const artifactHandoff = useStacks((s) => s.modelArtifactHandoff);
  const modelArtifactPhase = artifactHandoff?.phase ?? null;
  const inspectedArtifact = sceneArtifactById(
    artifactHandoff?.artifactId ?? null,
  );
  const freezeRoom =
    modalOpen &&
    inspectedArtifact?.kind !== "image" &&
    (modelArtifactPhase === null ||
      modelArtifactRoomShouldFreeze(modelArtifactPhase));
  const canvasShellRef = useRef<HTMLDivElement>(null);
  // Two things `onCreated` leaves running after it returns: the pair of queued
  // frames that report the first paint, and the context-loss listener. Both
  // report to the boot machine, and a route change disposes the renderer
  // without unwinding either — so they are unwound here instead.
  const retireReadyFrames = useRef<(() => void) | null>(null);
  const retireContextLoss = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      retireReadyFrames.current?.();
      retireReadyFrames.current = null;
      retireContextLoss.current?.();
      retireContextLoss.current = null;
    },
    [],
  );
  const [rendererCapability, setRendererCapability] =
    useState<RendererCapability>("unknown");
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1 : window.innerWidth,
    height: typeof window === "undefined" ? 1 : window.innerHeight,
    deviceDpr: typeof window === "undefined" ? 1 : window.devicePixelRatio,
  }));
  const queryMode = useMemo(
    () =>
      typeof window === "undefined"
        ? "auto"
        : qualityModeFromSearch(window.location.search),
    [],
  );
  // Read here as well as in the probe: the opening axis state needs it before
  // any frame has been sampled, and a coarse pointer on a narrow viewport is
  // the most reliable pre-frame signal that this is a phone.
  const coarseTouch = useTapFirstCapability();
  const [diagnosticsRequested, setDiagnosticsRequested] = useState(() => {
    if (devHooksRequested()) return true;
    if (typeof window === "undefined") return false;
    return sceneInstrumentationRequestedBySearch(window.location.search);
  });
  const [supportReportMode] = useState(
    () =>
      typeof window !== "undefined" &&
      sceneDiagnosticsQueryMode(window.location.search) === "report",
  );
  const qualityEvidenceRequested =
    process.env.NODE_ENV !== "production" ||
    diagnosticsRequested ||
    (typeof window !== "undefined" &&
      sceneDevHooksRequestedBySearch(window.location.search));
  // The HUD can be opened at any time, including long after the canvas was
  // created. Install its hooks and diagnostics only after that opt-in.
  useEffect(() => {
    const stopHooks = onSceneHooksRequested(() => {
      installDevHooks();
    });
    const stopDiagnostics = onDevHooksRequested(() => {
      setDiagnosticsRequested(true);
    });
    return () => {
      stopHooks();
      stopDiagnostics();
    };
  }, []);
  const qualityControls = useSceneQualityControls();
  const [querySynchronized, setQuerySynchronized] = useState(false);
  const mode = querySynchronized ? qualityControls.mode : queryMode;
  const storageBucket = useMemo(
    () =>
      sceneQualityStorageBucket({
        capability: rendererCapability,
        cssWidth: viewport.width,
        cssHeight: viewport.height,
        deviceDpr: viewport.deviceDpr,
      }),
    // Once WebGL evidence arrives, the learned device class stays fixed for
    // this mount. Live frame windows adapt the axes; they must not switch the
    // persistence bucket and restore a different adaptive state underneath it.
    // A resize likewise does not turn this into a new device.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rendererCapability],
  );
  // A named test profile neither restores nor saves learned quality. The run
  // must start from the device estimate to be comparable, and it must not
  // teach the owner's next ordinary visit what a deliberately hobbled one saw.
  const learningSuspended = useMemo(
    () =>
      typeof window !== "undefined" &&
      performanceProfileFromSearch(window.location.search) !== null,
    [],
  );
  // Restored as a STARTING POINT, never as a floor or a ceiling: the device
  // that was thermally throttled last visit may not be this visit.
  const restoredLearning = useMemo<LearnedQuality | null>(() => {
    if (
      typeof window === "undefined" ||
      queryMode !== "auto" ||
      learningSuspended
    )
      return null;
    return readLearnedQuality(storageBucket);
  }, [learningSuspended, queryMode, storageBucket]);
  const openingSurvivalUntil = useMemo(() => {
    if (
      typeof window === "undefined" ||
      queryMode !== "auto" ||
      learningSuspended
    )
      return null;
    return readLearnedSurvivalUntil(storageBucket);
  }, [learningSuspended, queryMode, storageBucket]);
  const restoredProfile = restoredLearning?.profile ?? null;
  const survivalLeaseUntilRef = useRef<number | null>(
    restoredLearning?.survival
      ? restoredLearning.survivalUntil
      : openingSurvivalUntil,
  );
  const logicalCores =
    typeof navigator === "undefined" ? null : navigator.hardwareConcurrency;
  const deviceMemory =
    typeof navigator === "undefined"
      ? null
      : ((navigator as { deviceMemory?: number }).deviceMemory ?? null);
  const initialAxisProfile = startingProfileForDevice({
    // WebGL evidence arrives after the canvas exists. The navigator signals
    // are available now and may only bias the starting point downward.
    weakRenderer:
      (typeof logicalCores === "number" && logicalCores < 4) ||
      (typeof deviceMemory === "number" && deviceMemory <= 4),
    touch: coarseTouch,
    narrowViewport: viewport.width < STACKS_DESKTOP_MIN_WIDTH,
  });
  // Automatic mode renders under Showcase's ceiling, so a phone cannot start
  // at Efficient merely by selecting Efficient's content/effects point. Map
  // that preset's resolved DPR onto the shared twelve-step axis as well. It is
  // only a starting point; runtime measurements remain free to move it.
  const initialAutoResolutionStep = useMemo(() => {
    const common = {
      mode: "auto" as const,
      cssWidth: viewport.width,
      cssHeight: viewport.height,
      deviceDpr: viewport.deviceDpr,
      narrowViewport: viewport.width < STACKS_DESKTOP_MIN_WIDTH,
      touch: coarseTouch,
    };
    const ceiling = resolveSceneQualityPlan({
      ...common,
      profile: "showcase",
    }).dpr;
    const starting = resolveSceneQualityPlan({
      ...common,
      profile: initialAxisProfile,
    }).dpr;
    return resolutionStepForScale(starting, ceiling);
  }, [coarseTouch, initialAxisProfile, viewport]);
  const [composerFailed, setComposerFailed] = useState(false);
  const [axisState, dispatchAxes] = useReducer(
    reduceSceneQualityAxes,
    undefined,
    () => {
      const startedAt =
        typeof performance === "undefined" ? 0 : performance.now();
      const base = initialSceneQualityAxisState(
        queryMode === "auto" ? initialAxisProfile : queryMode,
        startedAt,
        queryMode === "auto" ? null : queryMode,
        queryMode === "auto"
          ? initialAutoResolutionStep
          : SCENE_RESOLUTION_MAX_STEP,
        typeof document === "undefined" || !document.hidden,
      );
      if (!restoredLearning && openingSurvivalUntil == null) return base;
      const restored = reduceSceneQualityAxes(base, {
        type: "restore",
        now: startedAt,
        axes: {
          resolutionStep:
            restoredLearning?.resolutionStep ?? base.axes.resolutionStep,
          effects: restoredLearning?.effects ?? base.axes.effects,
          content: restoredLearning?.content ?? base.axes.content,
          survival:
            (restoredLearning?.survival ?? false) ||
            openingSurvivalUntil != null,
        },
      });
      return {
        ...restored,
        // A persisted lower rung is a known-good result from an earlier
        // visit. Hold it before retrying; a fresh conservative starting rung
        // has no failed higher step and remains free to climb immediately.
        resolutionRetryAt: startedAt + QUALITY_RESOLUTION_RETRY_MS,
        // Preserve first-mount behavior in this observability-only gate. The
        // later reducer restore also holds effects, but the initializer did
        // not do that before the journal existed.
        effectsRetryAt: base.effectsRetryAt,
      };
    },
  );
  const axesRef = useRef<SceneQualityAxes>(axisState.axes);
  axesRef.current = axisState.axes;
  // Sampling lands four times per second. Metrics are telemetry, not rendered
  // scene state: putting each fresh object through React woke the whole Canvas
  // subtree on the sampler cadence, including every model that subscribes to
  // diagnostics controls. Axis changes still render through the reducer.
  const liveMetricsRef = useRef<SceneQualityMetrics | null>(null);
  const [learnedProfile, setLearnedProfile] =
    useState<SceneQualityProfile | null>(restoredProfile);

  const previousCapabilityBucket = useRef(storageBucket);
  useEffect(() => {
    if (previousCapabilityBucket.current === storageBucket) return;
    previousCapabilityBucket.current = storageBucket;
    if (
      mode !== "auto" ||
      rendererCapability === "unknown" ||
      learningSuspended
    )
      return;
    const stored = readLearnedQuality(storageBucket);
    if (!stored) return;
    if (stored.survival) survivalLeaseUntilRef.current = stored.survivalUntil;
    else if (!axesRef.current.survival) survivalLeaseUntilRef.current = null;
    setLearnedProfile(stored.profile);
    dispatchAxes({
      type: "restore",
      now: performance.now(),
      axes: {
        resolutionStep: stored.resolutionStep,
        effects: stored.effects,
        content: stored.content,
        survival: stored.survival || axesRef.current.survival,
      },
    });
  }, [learningSuspended, mode, rendererCapability, storageBucket]);

  useEffect(() => {
    if (queryMode !== "auto") sceneQualityController.setMode(queryMode);
    setQuerySynchronized(true);
  }, [queryMode]);

  useEffect(() => {
    const measure = () => {
      scenePerformanceTrace.event({
        at: performance.now(),
        type: "resize",
        detail: {
          viewport: [window.innerWidth, window.innerHeight],
          deviceDpr: window.devicePixelRatio,
        },
      });
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        deviceDpr: window.devicePixelRatio,
      });
    };
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

  const previousMode = useRef<SceneQualityMode>(mode);
  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    dispatchAxes({
      type: "force",
      now: performance.now(),
      profile: mode === "auto" ? null : mode,
    });
  }, [mode]);

  const resetRequest = useRef(qualityControls.resetRequest);
  useEffect(() => {
    if (resetRequest.current === qualityControls.resetRequest) return;
    resetRequest.current = qualityControls.resetRequest;
    clearLearnedQuality(storageBucket);
    survivalLeaseUntilRef.current = null;
    setLearnedProfile(null);
  }, [mode, qualityControls.resetRequest, storageBucket]);

  useEffect(() => {
    forceQuality = (value) => {
      if (value === "auto") {
        sceneQualityController.setMode("auto");
        return;
      }
      const profile = qualityProfileFromValue(value);
      if (profile) sceneQualityController.setMode(profile);
    };
    return () => {
      forceQuality = null;
    };
  }, []);

  const previousAxes = useRef(axisState.axes);
  useEffect(() => {
    const previous = previousAxes.current;
    if (
      previous.resolutionStep === axisState.axes.resolutionStep &&
      previous.effects === axisState.axes.effects &&
      previous.content === axisState.axes.content &&
      previous.survival === axisState.axes.survival
    )
      return;
    const at = performance.now();
    scenePerformanceTrace.event({
      at,
      type: "quality-transition",
      detail: {
        from: previous,
        to: axisState.axes,
        change: axisState.lastChange,
        metrics: liveMetricsRef.current,
      },
    });
    previousAxes.current = axisState.axes;
  }, [axisState.axes, axisState.lastChange]);

  const onMovementChange = useCallback(
    (moving: boolean, frames?: TravelFrames) => {
      const now = performance.now();
      // Pre-emptive: the visitor initiated this, so the headroom is taken
      // before a frame is missed rather than after.
      dispatchAxes(
        moving
          ? { type: "travel-start", now }
          : { type: "travel-end", now, frames },
      );
      scenePerformanceTrace.event({
        at: now,
        type: moving ? "travel-start" : "travel-end",
        detail: {
          progress: progressRef.current,
          activeUnit: useStacks.getState().activeUnit,
        },
      });
    },
    [],
  );

  useEffect(() => {
    scenePerformanceTrace.event({
      at: performance.now(),
      type: "theme-change",
      detail: { theme: dark ? "dark" : "light" },
    });
  }, [dark]);
  useEffect(() => {
    const onVisibility = () => {
      scenePerformanceTrace.event({
        at: performance.now(),
        type: "visibility-change",
        detail: { hidden: document.hidden },
      });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A continuously adapting resolution makes an exact device-pixel-ratio
  // assertion inherently racy. The harness flag already marks the runs that
  // make those assertions, so it is also what holds the axis still.
  const harnessPinnedResolution = useMemo(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("harness"),
    [],
  );
  const captureResolutionCeiling = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : captureResolutionCeilingFromSearch(window.location.search),
    [],
  );
  const resolutionCeiling =
    qualityControls.resolutionCeiling ?? captureResolutionCeiling;
  const renderProfile: SceneQualityProfile =
    mode === "auto" ? "showcase" : mode;
  const plan = useMemo(
    () =>
      resolveSceneQualityPlan({
        mode,
        profile: renderProfile,
        // Automatic mode derives the rendered plan directly from these axes.
        // A forced preset resolves its own authored tiers instead.
        contentTier: mode === "auto" ? axisState.axes.content : undefined,
        effectsTier: mode === "auto" ? axisState.axes.effects : undefined,
        survival: mode === "auto" && axisState.axes.survival,
        // Pinned under the harness so end-to-end tests that assert an exact
        // device pixel ratio are not racing a continuously adapting value.
        // Pinning is the correct fix there; loosening the assertion is not.
        // An explicit manual pin outranks the harness pin: the harness flag
        // exists to stop the AXIS drifting under an assertion, not to ignore
        // a step someone deliberately selected.
        resolutionStep:
          qualityControls.resolutionStep ??
          // A manual ceiling means "show me this density". Landing on
          // whatever rung the controller happened to be holding would answer
          // a different question — asking for 3x and getting 2.592 because
          // the ladder sat at step 10 reads as the control not working. An
          // explicitly pinned step still wins, since that is someone asking
          // for a rung rather than for a density.
          (resolutionCeiling != null
            ? SCENE_RESOLUTION_MAX_STEP
            : harnessPinnedResolution
              ? null
              : axisState.axes.resolutionStep),
        // Diagnostics-only, and never set by the controller: it replaces the
        // pixel budget rather than joining it, so a large window can be shown
        // at its display's real density.
        resolutionCeiling,
        cssWidth: viewport.width,
        cssHeight: viewport.height,
        deviceDpr: viewport.deviceDpr,
        narrowViewport: viewport.width < STACKS_DESKTOP_MIN_WIDTH,
        touch: coarseTouch,
        directRender: composerFailed || !performanceSettings.postprocessing,
        overrides: {
          ...performanceSettings,
          skipAmbientOcclusion: scenePerformanceController.isOverridden(
            "skipAmbientOcclusion",
          )
            ? performanceSettings.skipAmbientOcclusion
            : undefined,
          skipDepthOfField: scenePerformanceController.isOverridden(
            "skipDepthOfField",
          )
            ? performanceSettings.skipDepthOfField
            : undefined,
          depthOfFieldBokehMultiplier:
            qualityControls.depthOfFieldBokehMultiplier ?? undefined,
          depthOfFieldResolutionScale:
            qualityControls.depthOfFieldResolutionScale ?? undefined,
          simplifiedFarMeadow: scenePerformanceController.isOverridden(
            "simplifiedFarMeadow",
          )
            ? performanceSettings.simplifiedFarMeadow
            : undefined,
        },
        hasCustomOverrides:
          qualityControls.depthOfFieldBokehMultiplier != null ||
          qualityControls.depthOfFieldResolutionScale != null ||
          scenePerformanceController.hasOverrides() ||
          !scenePerformanceSettingsEqual(
            performanceSettings,
            DEFAULT_SCENE_PERFORMANCE_SETTINGS,
          ),
      }),
    [
      composerFailed,
      coarseTouch,
      axisState.axes.content,
      axisState.axes.effects,
      axisState.axes.resolutionStep,
      axisState.axes.survival,
      qualityControls.resolutionStep,
      qualityControls.depthOfFieldBokehMultiplier,
      qualityControls.depthOfFieldResolutionScale,
      resolutionCeiling,
      harnessPinnedResolution,
      mode,
      performanceSettings,
      renderProfile,
      viewport,
    ],
  );
  const dpr = plan.dpr;
  const effectsVariant = `${plan.effects.composer}:${plan.effects.multisampling}:${plan.effects.bloom}:${plan.effects.bloomLevels}:${plan.effects.bloomResolutionScale}:${plan.effects.bloomIntensity.dark}:${plan.effects.bloomIntensity.light}:${plan.effects.bloomLuminanceThreshold.dark}:${plan.effects.bloomLuminanceThreshold.light}:${plan.effects.ambientOcclusion}:${plan.effects.ambientOcclusionHalfRes}:${plan.effects.ambientOcclusionQuality}:${plan.effects.depthOfField}:${plan.effects.depthOfFieldResolutionScale}:${plan.effects.depthOfFieldBokehScale}:${plan.environment.farGrassShader}`;
  useEffect(() => {
    scenePerformanceTrace.event({
      at: performance.now(),
      type: "effects-variant",
      detail: {
        profile: plan.profile,
        composer: plan.effects.composer,
        bloom: plan.effects.bloom,
        ambientOcclusion: plan.effects.ambientOcclusion,
        depthOfField: plan.effects.depthOfField,
        farGrassShader: plan.environment.farGrassShader,
        dpr: plan.dpr,
        physicalPixels: plan.physicalPixels,
        pixelBudget: plan.pixelBudget,
      },
    });
  }, [effectsVariant, plan]);
  const ownedRenderer = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(
    () => () => {
      // Module-level refs exist only for the development harness. Do not let
      // an unmounted world keep a disposed renderer/scene/camera reachable or
      // leave hooks pointing at the previous route's graph.
      if (glRef !== ownedRenderer.current) return;
      glRef = null;
      sceneRef = null;
      cameraRef = null;
      setInteractionProjectionContext(null, null);
      delete window.__stacks;
    },
    [],
  );

  const postfxQuality =
    plan.effects.composer === "direct" ? "off" : plan.effects.composer;
  const postfx = plan.effects.composer !== "direct";
  const renderScale = dpr / Math.max(1, viewport.deviceDpr);
  const sharpenAmount = adaptiveSharpenAmount(
    {
      ...performanceSettings,
      adaptiveSharpen: plan.effects.adaptiveSharpen,
    },
    renderScale,
    postfxQuality,
  );
  const bloomActive = plan.effects.bloom;
  const setPostfx = useStacks((s) => s.setPostfx);
  const setBloomActive = useStacks((s) => s.setBloomActive);
  useEffect(() => {
    setPostfx(postfx);
  }, [postfx, setPostfx]);
  useEffect(() => {
    setBloomActive(bloomActive);
  }, [bloomActive, setBloomActive]);
  // All three boot preconditions, checked where the samples arrive so the
  // gate cannot drift out of step with them. The settled-window clock only
  // starts once the reveal and the precompile are both done, because a window
  // that straddles either is not evidence about steady state.
  const bootReadySince = useRef<number | null>(null);
  const booted = useRef(false);
  const onQualityVisibility = useCallback((visible: boolean, now: number) => {
    bootReadySince.current = null;
    dispatchAxes({
      type: visible ? "visibility-visible" : "visibility-hidden",
      now,
    });
  }, []);
  const onQualitySample = useCallback(
    (metrics: SceneQualityMetrics, instrumented: boolean) => {
      const now = performance.now();
      const visible = !document.hidden;
      const usable =
        !document.hidden && !qualityControls.frozen && !instrumented;
      liveMetricsRef.current = metrics;
      const constraint = classifySceneFrameConstraint(metrics);
      if (qualityEvidenceRequested)
        sceneQualityEvidence.recordSample({
          at: now,
          instrumented,
          visible,
          focused: document.hasFocus(),
          usable,
          moving: isSceneTraveling(),
          constraint,
          axes: axesRef.current,
          metrics,
          renderer: {
            programs: glRef?.info.programs?.length ?? null,
            textures: glRef?.info.memory.textures ?? null,
            geometries: glRef?.info.memory.geometries ?? null,
          },
        });
      qualitySnapshot = { ...qualitySnapshot, metrics, constraint };
      const runtime = sceneQualityController.getRuntimeSnapshot();
      if (runtime)
        sceneQualityController.publishRuntime({
          ...runtime,
          metrics,
          constraint,
        });
      if (!instrumented && !booted.current) {
        const ready =
          isWorldRevealed() && shaderPrecompileComplete && !isSceneTraveling();
        if (!ready) bootReadySince.current = null;
        else {
          bootReadySince.current ??= now;
          if (now - bootReadySince.current >= QUALITY_TRAVEL_VALIDATION_MS) {
            booted.current = true;
            dispatchAxes({ type: "booted", now });
          }
        }
      }
      dispatchAxes({
        type: "sample",
        now,
        metrics,
        visible: usable,
        allowSurvival:
          !harnessPinnedResolution &&
          qualityControls.resolutionStep == null &&
          resolutionCeiling == null &&
          (!diagnosticsRequested || supportReportMode) &&
          !scenePerformanceController.isOverridden("meadow") &&
          performanceSettings.meadow,
      });
    },
    [
      diagnosticsRequested,
      harnessPinnedResolution,
      performanceSettings.meadow,
      qualityControls.frozen,
      qualityControls.resolutionStep,
      qualityEvidenceRequested,
      resolutionCeiling,
      supportReportMode,
    ],
  );
  const onComposerError = useCallback(() => {
    const now = performance.now();
    scenePerformanceTrace.event({ at: now, type: "effects-error" });
    setComposerFailed(true);
  }, []);

  const persistenceState = useMemo(
    () => ({
      axisChangedAt: axisState.axisChangedAt,
      booted: axisState.booted,
      foregroundReadyAt: axisState.foregroundReadyAt,
      pendingBaseline: axisState.pendingBaseline,
      preTravelStep: axisState.preTravelStep,
      settledAt: axisState.settledAt,
      travelling: axisState.travelling,
      validation: axisState.validation,
    }),
    [
      axisState.axisChangedAt,
      axisState.booted,
      axisState.foregroundReadyAt,
      axisState.pendingBaseline,
      axisState.preTravelStep,
      axisState.settledAt,
      axisState.travelling,
      axisState.validation,
    ],
  );

  useEffect(() => {
    const now = performance.now();
    const gates = {
      automatic: mode === "auto",
      documentVisible: !document.hidden,
      samplesUsable:
        !qualityControls.frozen && !diagnosticsRequested && !learningSuspended,
      composerHealthy: !composerFailed,
      sceneTravelling: isSceneTraveling(),
    };
    const status = sceneQualityPersistenceStatus(persistenceState, gates, now);
    if (status.readyAt == null) return;
    const remaining = Math.max(0, status.readyAt - now);
    const scheduled = axisState.axes;
    const timeout = window.setTimeout(() => {
      const currentStatus = sceneQualityPersistenceStatus(
        persistenceState,
        {
          ...gates,
          documentVisible: !document.hidden,
          sceneTravelling: isSceneTraveling(),
        },
        performance.now(),
      );
      if (
        !currentStatus.eligible ||
        axesRef.current.resolutionStep !== scheduled.resolutionStep ||
        axesRef.current.effects !== scheduled.effects ||
        axesRef.current.content !== scheduled.content ||
        axesRef.current.survival !== scheduled.survival
      )
        return;
      survivalLeaseUntilRef.current = writeLearnedQuality(
        storageBucket,
        scheduled,
        null,
        Date.now(),
        survivalLeaseUntilRef.current,
      );
      setLearnedProfile(null);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [
    composerFailed,
    axisState.axes,
    persistenceState,
    mode,
    diagnosticsRequested,
    learningSuspended,
    qualityControls.frozen,
    storageBucket,
  ]);

  const cooldownMs = 0;
  // An error outranks a choice: a composer that failed and was also switched
  // off is still a failure, and the HUD's DIRECT tag should say why.
  const fallbackStatus = composerFailed
    ? "direct-effects-error"
    : performanceSettings.postprocessing
      ? "composer"
      : "direct-manual";
  const transitionReason =
    axisState.lastChange?.reason ??
    (composerFailed ? "effects-error" : "startup");
  const liveMetrics = liveMetricsRef.current;
  // Which resource the last window was short of. Published rather than only
  // acted on, so the overlay can show why the scene made its decision.
  const liveConstraint = liveMetrics
    ? classifySceneFrameConstraint(liveMetrics)
    : null;
  const persistence = sceneQualityPersistenceStatus(
    persistenceState,
    {
      automatic: mode === "auto",
      documentVisible:
        typeof document === "undefined" ? true : !document.hidden,
      samplesUsable:
        !qualityControls.frozen && !diagnosticsRequested && !learningSuspended,
      composerHealthy: !composerFailed,
      sceneTravelling: isSceneTraveling(),
    },
    typeof performance === "undefined" ? 0 : performance.now(),
  );
  qualitySnapshot = {
    mode,
    profile: plan.profile,
    durable: plan.legacyRung,
    moving: axisState.travelling,
    frozen: qualityControls.frozen,
    forced: mode !== "auto",
    effectiveDpr: plan.dpr,
    physicalPixels: plan.physicalPixels,
    postprocessing: postfxQuality,
    sharpen: sharpenAmount,
    meadowRung: plan.environment.meadowRung,
    contentTier: plan.environment.contentTier,
    cloudDetail: plan.environment.cloudDetail === "full",
    transitionReason,
    declineBaseline: axisState.pendingBaseline,
    booted: axisState.booted,
    bootDeclineGuard: axisState.bootDeclineGuard,
    bootGuardExpiresAt: axisState.bootGuardExpiresAt,
    axisChangedAt: axisState.axisChangedAt,
    resolutionRetryAt: axisState.resolutionRetryAt,
    effectsRetryAt: axisState.effectsRetryAt,
    gpuSince: axisState.gpuSince,
    cpuSince: axisState.cpuSince,
    headroomSince: axisState.headroomSince,
    survivalSince: axisState.survivalSince,
    foregroundReadyAt: axisState.foregroundReadyAt,
    validation: axisState.validation,
    unhelpfulResolutionSteps: axisState.unhelpfulResolutionSteps,
    resolutionDescentAnchor: axisState.resolutionDescentAnchor,
    preTravelStep: axisState.preTravelStep,
    consecutiveOverBudgetTravels: axisState.consecutiveOverBudgetTravels,
    transitions: axisState.transitions.map((transition) => ({
      ...transition,
      metrics: transition.metrics ? { ...transition.metrics } : null,
    })),
    lifecycle: axisState.lifecycle.map((event) => ({
      ...event,
      ...(event.type === "travel-end" ? { frames: { ...event.frames } } : {}),
    })),
    storageBucket,
    learnedProfile,
    fallbackStatus,
    metrics: liveMetrics,
    constraint: liveConstraint,
    persistence,
    axes: axisState.axes,
    customOverrides: plan.customOverrides,
    plan,
  };
  useEffect(() => {
    sceneQualityController.publishRuntime({
      plan,
      metrics: liveMetrics,
      constraint: liveConstraint,
      axes: axisState.axes,
      forcedProfile: mode === "auto" ? null : mode,
      storageBucket,
      learnedProfile,
      cooldownRemainingMs: cooldownMs,
      transitionReason,
      fallbackStatus,
    });
  }, [
    liveConstraint,
    axisState.axes,
    mode,
    cooldownMs,
    fallbackStatus,
    learnedProfile,
    liveMetrics,
    plan,
    storageBucket,
    transitionReason,
  ]);

  const onOpenBook = useCallback(
    (id: string) => {
      const book = data.shelfBooks.find((b) => b.id === id);
      if (book) {
        requestBookPrefetch(id);
        // A cover is a mesh with no DOM box; the modal pops from a small
        // rect at the pointer instead, the sheet's own compromise.
        recordModalOriginAtPointer(90, 130);
        useStacks.getState().setPendingBook(book);
      }
    },
    [data.shelfBooks],
  );
  // A packed spine is a real read that the homepage deliberately does not
  // carry a whole `Book` for — only its title, author and length. The modal
  // resolves it by id, the same fetch a #book- deep link performs.
  const onOpenBookId = useCallback((id: string) => {
    requestBookPrefetch(id);
    recordModalOriginAtPointer(90, 130);
    useStacks.getState().setPendingBookId(id);
  }, []);
  const router = useRouter();
  const onOpenUrl = useCallback(
    (url: string) => {
      // The two document pages open as intercepted sheets over the live
      // world (src/app/@sheet) — the scene stays booted underneath and the
      // back gesture lands right back in it. Everything else keeps the
      // new-tab behavior. The sheet pops from a small rect at the pointer
      // (a door is shader geometry with no DOM box).
      if (url === "/routine" || url === "/manual") {
        recordModalOriginAtPointer();
        router.push(url);
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [router],
  );

  const pointerEvents = useMemo(
    () => scenePointerEvents(coarseTouch),
    [coarseTouch],
  );

  useEffect(() => {
    devOpenBook = onOpenBook;
    return () => {
      devOpenBook = null;
    };
  }, [onOpenBook]);

  useEffect(() => {
    const shell = canvasShellRef.current;
    if (!shell) return;
    // iOS can still begin a selection or image-style callout on a canvas
    // after honoring `user-select: none` during the first tap. Cancel the
    // native events too, before Safari creates a selection range.
    const preventNativeSelection = (event: Event) => event.preventDefault();
    shell.addEventListener("selectstart", preventNativeSelection);
    shell.addEventListener("contextmenu", preventNativeSelection);
    return () => {
      shell.removeEventListener("selectstart", preventNativeSelection);
      shell.removeEventListener("contextmenu", preventNativeSelection);
    };
  }, []);

  return (
    <div
      ref={canvasShellRef}
      className="stacks-canvas-shell absolute inset-0"
      // Sits directly behind the transparent canvas layer so a frame the
      // compositor cannot update shows the scene's own tones instead of the
      // page's near-white paper. See sceneBackdrop.ts for the measurement.
      style={{ background: sceneBackdropFor(dark) }}
    >
      <LoadReporter />
      <TouchInteractionLayer />
      <AutomaticPerformanceDiagnostic />
      <Canvas
        events={pointerEvents}
        shadows="soft"
        // Books freeze immediately. Models freeze after the real shelf object
        // reaches the camera. Photos keep the room alive throughout.
        frameloop={freezeRoom ? "never" : "always"}
        camera={{ position: [0, CAMERA.y, CAMERA.z], fov: CAMERA.fov }}
        dpr={dpr}
        // Authored in sceneBackdrop.ts, alongside the backdrop these
        // attributes have to stay compatible with.
        gl={SCENE_CANVAS_CONTEXT}
        onCreated={({ gl, scene, camera }) => {
          const colorGrade = sceneColorGradeFor(
            sceneColorGradeController.getSnapshot(),
            qualityControls.cinematicPlus,
          );
          gl.toneMappingExposure = dark
            ? colorGrade.dark.exposure
            : colorGrade.light.exposure;
          glRef = gl;
          ownedRenderer.current = gl;
          // Close the frame's main-thread measurement at submission. The
          // composer submits several times per frame; the last call wins.
          instrumentRendererFrameCost(gl);
          sceneRef = scene;
          cameraRef = camera;
          setInteractionProjectionContext(camera, gl.domElement);
          const context = gl.getContext();
          const webgl2 = gl.capabilities.isWebGL2;
          const rendererEvidence = {
            webglVersion: webgl2 ? (2 as const) : (1 as const),
            maxTextureSize: Number(
              context.getParameter(context.MAX_TEXTURE_SIZE) ?? 0,
            ),
            maxSamples: webgl2
              ? Number(
                  (context as WebGL2RenderingContext).getParameter(
                    (context as WebGL2RenderingContext).MAX_SAMPLES,
                  ) ?? 0,
                )
              : 0,
            logicalCores:
              typeof navigator.hardwareConcurrency === "number"
                ? navigator.hardwareConcurrency
                : null,
            // Absent on Safari, which is why it may only sharpen the estimate
            // and never be required by it.
            deviceMemoryGb:
              typeof (navigator as { deviceMemory?: number }).deviceMemory ===
              "number"
                ? (navigator as { deviceMemory?: number }).deviceMemory!
                : null,
            unmaskedRenderer: readUnmaskedRenderer(context),
            physicalPixels:
              viewport.width *
              viewport.height *
              viewport.deviceDpr *
              viewport.deviceDpr,
          };
          setRendererCapability(deriveRendererCapability(rendererEvidence));
          installDevHooks();
          // Both of these outlive the callback, and both speak to the boot
          // machine. A route change tears the canvas down without unwinding
          // them: the queued frames would report a first paint for a canvas
          // that is gone, and the listener would report a lost context for the
          // same. The refs below are unwound by this component's unmount
          // effect, and the boot machine drops anything that slips past it as
          // a stale generation.
          if (onLost) {
            const handleLost = () => onLost();
            gl.domElement.addEventListener("webglcontextlost", handleLost, {
              once: true,
            });
            retireContextLoss.current = () =>
              gl.domElement.removeEventListener("webglcontextlost", handleLost);
          }
          // Signal readiness only after a frame has actually been painted so
          // the boot→world crossfade never reveals a blank canvas.
          const outerFrame = requestAnimationFrame(() => {
            const innerFrame = requestAnimationFrame(onReady);
            retireReadyFrames.current = () => cancelAnimationFrame(innerFrame);
          });
          retireReadyFrames.current = () => cancelAnimationFrame(outerFrame);
        }}
      >
        <Exposure dark={dark} />
        {postfx && (
          <ContextSafeEffects
            dark={dark}
            plan={plan.effects}
            sharpenAmount={sharpenAmount}
            onComposerError={onComposerError}
          />
        )}
        {diagnosticsRequested ? (
          <>
            <PerformanceProbe instrumentFrames={!supportReportMode} />
            <PerformanceTraceObservers />
            {!supportReportMode ? (
              <>
                <SceneMatrixCostProbe />
                <StaticWorldInvariantProbe />
              </>
            ) : null}
          </>
        ) : null}
        <AdaptiveQualityProbe
          onSample={onQualitySample}
          onVisibility={onQualityVisibility}
          recordEvidence={qualityEvidenceRequested}
        />
        <SceneAudioBridge />
        <PhysicsPrewarm />
        <MovementProbe onChange={onMovementChange} />
        <SceneLightShapePadding />
        <FrozenResizeRepaint frozen={freezeRoom} />
        <ShaderPrewarm
          variant={`${dark ? "dark" : "light"}-${plan.profile}-${postfxQuality}-${plan.environment.farGrassShader}-${plan.environment.grassDeformation}-${performanceSettings.activeNeighborhoodLights ? "near-lights" : "all-lights"}-${performanceSettings.activeNeighborhoodLights && performanceSettings.stableNeighborhoodLightShape ? "stable-light-shape" : "variable-light-shape"}`}
          resourceVariant={
            performanceSettings.prewarmAllUnitVisuals
              ? "all-units"
              : "near-units"
          }
        />
        <ScrollControls
          horizontal
          pages={UNIT_COUNT}
          damping={0.2}
          maxSpeed={coarseTouch ? 0.95 : 1.2}
          // Carrying a prop freezes travel too, but NOT through this flag.
          // drei only short-circuits its own handler here, so the element
          // keeps scrolling natively anyway; Grabbable sets overflowX hidden
          // instead, which means no scroll event fires at all. Routing it
          // through `enabled` as well would cost a full re-render of the
          // scene on every grab — and because ModelProp's memo depends on
          // caller-inline `tints`/`atlasOverride` literals, each of those
          // re-renders clones a fresh material per tinted mesh and strands
          // the old one on the GPU.
          enabled={
            panelState === "closed" && !modalOpen && visionRidePhase === "idle"
          }
          style={{ scrollbarWidth: "none", touchAction: "pan-x" }}
        >
          <ScrollRegionA11y />
          {roomMounted ? (
            <Scene
              data={data}
              palette={palette}
              dark={dark}
              coverWidth={bookCoverWidthForNeed(
                Math.min(viewport.width * 0.5, viewport.height * 0.35),
                plan.profile,
              )}
              quality={plan}
              diagnosticsRequested={diagnosticsRequested}
              onOpenBook={onOpenBook}
              onOpenBookId={onOpenBookId}
              onOpenUrl={onOpenUrl}
            />
          ) : null}
        </ScrollControls>
        {visionRidePhase !== "idle" ? (
          <VisionRideExperience
            dark={dark}
            tier={plan.environment.contentTier}
          />
        ) : null}
        {process.env.NODE_ENV === "development" ? (
          <SceneLayoutEditorGizmo />
        ) : null}
      </Canvas>
    </div>
  );
}
