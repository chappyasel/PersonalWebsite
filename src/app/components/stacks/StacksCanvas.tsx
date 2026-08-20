"use client";

// The WebGL entry point — the only module that pulls @react-three/* into the
// bundle (loaded via dynamic import from StacksHome). Canvas config carries
// the approved prototype look; ScrollControls owns the real scroll container.
import { ScrollControls, useProgress, useScroll } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
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
} from "react";
import type * as THREE from "three";

import { sceneAudio } from "./audio/sceneAudio";
import { type StacksData, UNIT_COUNT } from "./data";
import TouchInteractionLayer from "./input/TouchInteractionLayer";
import { useCoarseTouchCapability } from "./input/useCoarseTouchCapability";
import {
  isWorldRevealed,
  reportAssetLoadState,
  setLoadProgress,
} from "./loading";
import { cameraTravelDiagnostics } from "./scene/CameraRig";
import { sceneBackdropFor } from "./scene/sceneBackdrop";
import { prewarmGrabbablePhysics } from "./scene/Grabbable";
import Scene from "./scene/Scene";
import type { GolfShotOutcome } from "./scene/golf/golfTypes";
import { setInteractionProjectionContext } from "./scene/interactionProjection";
import { sceneInteractionInventory } from "./scene/interactionRegistry";
import type {
  MeadowDiagnosticsSettings,
  MeadowDiagnosticsUpdate,
} from "./scene/meadowDiagnostics";
import { ScenePerformanceSampler } from "./scene/performanceMetrics";
import {
  browserPerformanceTraceSession,
  downloadPerformanceTrace,
  observeBrowserPerformanceTrace,
  scenePerformanceTrace,
} from "./scene/performanceTrace";
import { physicsDiagnosticsController } from "./scene/physicsDiagnostics";
import { devHooksRequested, onDevHooksRequested } from "./scene/devHooks";
import {
  type SceneQualityAxes,
  initialSceneQualityAxisState,
  reduceSceneQualityAxes,
} from "./scene/qualityAxes";
import {
  type LearnedQuality,
  clearLearnedQuality,
  readLearnedQuality,
  writeLearnedQuality,
} from "./scene/qualityLearning";
import {
  instrumentRendererFrameCost,
  instrumentSceneMatrixCost,
  markSceneFrameStart,
  readSceneFrameCpuMs,
  takeSceneFrameInstrumented,
} from "./scene/sceneFrameCost";
import {
  LEGACY_RUNG_BY_PROFILE,
  QUALITY_DECLINE_COOLDOWN_MS,
  QUALITY_PERSIST_STABLE_MS,
  QUALITY_RECOVERY_COOLDOWN_MS,
  QUALITY_SAMPLE_INTERVAL_MS,
  QUALITY_SAMPLE_WINDOW_MS,
  QUALITY_TRAVEL_VALIDATION_MS,
  type RendererCapability,
  type SceneQualityMetrics,
  type SceneQualityMode,
  type SceneQualityPlan,
  type SceneQualityProfile,
  CONTENT_TIER_BY_PROFILE,
  bookCoverWidthForNeed,
  cheaperContentTier,
  classifySceneFrameConstraint,
  deriveRendererCapability,
  initialSceneQualityAdaptationState,
  qualityModeFromSearch,
  qualityProfileFromValue,
  reduceSceneQualityAdaptation,
  rendererLooksWeak,
  resolveSceneQualityPlan,
  sceneQualityStorageBucket,
  startingProfileForDevice,
  summariseSceneFrameWindow,
} from "./scene/quality";
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
import { sceneUnitActivityController } from "./scene/unitActivity";
import { CAMERA, STACKS_DESKTOP_MIN_WIDTH } from "./scene/worldLayout";
import { progressRef, useStacks } from "./store";
import { PALETTES } from "./theme";
import { isWebGLContextUsable } from "./webglProbe";

// Mount/unmount ONLY (never enabled={false}: a mounted-disabled composer pins
// the renderer to NoToneMapping = blown frame). Touch uses the same effect
// tiers with a non-MSAA composer target.
const Effects = dynamic(() => import("./scene/Effects"), { ssr: false });

const performanceSampler = new ScenePerformanceSampler();
let qualitySnapshot: Record<string, unknown> = {};
let forceQuality: ((value: SceneQualityMode | number) => void) | null = null;

/** Drei's overflow element is natively keyboard-focusable, so leaving it
 * unnamed makes the first Tab stop a full-viewport anonymous div. Name the
 * region without replacing the rail's explicit section controls. */
function ScrollRegionA11y() {
  const { el } = useScroll();
  useEffect(() => {
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Horizontal scene navigation");
    return () => {
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
    };
  }, [el]);
  return null;
}

/** The unmasked renderer string, where the browser exposes it. Blocked in
 * hardened modes and in some privacy configurations, so absence is normal and
 * must cost nothing. */
function readUnmaskedRenderer(context: WebGLRenderingContext | WebGL2RenderingContext) {
  try {
    const debug = context.getExtension("WEBGL_debug_renderer_info");
    if (!debug) return null;
    const value: unknown = context.getParameter(
      debug.UNMASKED_RENDERER_WEBGL,
    );
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
      /** Registered by Meadow in dev: live wind/density knobs.
       * No-arg call returns the current values. */
      meadow?: (opts?: MeadowDiagnosticsUpdate) => MeadowDiagnosticsSettings;
      golf?: {
        state: () => Record<string, unknown>;
        forceNext: (outcome: GolfShotOutcome) => void;
      };
      quality: (value?: SceneQualityMode | number) => Record<string, unknown>;
      measure: (action?: "start" | "stop" | "reset") => Record<string, unknown>;
      trace: (
        action?: "status" | "start" | "stop" | "reset" | "download",
      ) => unknown;
    };
  }
}

/** Either flag opts a production visit into the development hooks. */
function hasDevHookFlag(search: URLSearchParams) {
  return search.has("harness") || search.has("debug");
}

function installDevHooks() {
  // Production measurements opt in explicitly. Keeping the hooks behind a
  // query flag lets Playwright exercise the optimized build without exposing
  // the control surface during ordinary visits.
  //
  // `debug` is here as well as `harness` because the compact HUD and the
  // diagnostics drawer both read `window.__stacks.state()`, and their own
  // entry point is `?debug=1` (or the D key). Gating the hooks on `harness`
  // alone rendered the whole HUD as em-dashes and a permanent "Waiting" on
  // any production visit that opened it: the panel was live, its data source
  // was never installed.
  if (
    process.env.NODE_ENV === "production" &&
    !hasDevHookFlag(new URLSearchParams(window.location.search)) &&
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
    state() {
      const {
        activeUnit,
        mode,
        modalOpen,
        panelState,
        hovered,
        dragging,
        travelTo,
      } = useStacks.getState();
      return {
        offset: progressRef.current,
        activeUnit,
        mode,
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
        // Hover and carry are scene-internal (they deliberately never
        // re-render React), so the harness has no other way to observe
        // which prop the pointer owns or whether one is in hand.
        hovered,
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
        measurement: performanceSampler.summary(),
      };
    },
    quality(value) {
      if (value != null) forceQuality?.(value);
      return { ...qualitySnapshot };
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
}

/** Republishes three's DefaultLoadingManager progress to the boot screen,
 * which cannot subscribe to it directly: drei lives in this chunk and the
 * boot screen ships in the initial entry. Renders null and sits outside the
 * Canvas — `useProgress` is a plain store, not a scene hook, and putting it
 * in the tree would re-render the scene on every asset. */
function LoadReporter() {
  useEffect(() => {
    const publish = () => {
      const { active, loaded, total, errors, progress } =
        useProgress.getState();
      setLoadProgress(progress / 100);
      reportAssetLoadState(
        { active, loaded, total, errors: errors.length },
        performance.now(),
      );
    };
    publish();
    return useProgress.subscribe(publish);
  }, []);
  return null;
}

// Keeps tone-mapping exposure in sync when the theme flips after mount.
function Exposure({ dark }: { dark: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = dark ? 1.25 : 1.12;
  }, [gl, dark]);
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
function PerformanceProbe() {
  const coarseTouchCapability = useCoarseTouchCapability();
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
    if (scenePerformanceTrace.isActive() && !document.hidden) {
      const state = useStacks.getState();
      const physics = physicsDiagnosticsController.getSnapshot();
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
        physicsMs: physics.timing.frameMs,
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
}: {
  onSample: (metrics: SceneQualityMetrics) => void;
}) {
  const frames = useRef<Array<{ at: number; ms: number; cpuMs: number }>>([]);
  const lastSampleAt = useRef(0);
  const scene = useThree((state) => state.scene);

  // Time the world-matrix traversal where the renderer already runs it, which
  // is after every frame callback has moved whatever it moves.
  useEffect(() => instrumentSceneMatrixCost(scene), [scene]);

  useFrame((_, delta) => {
    const now = performance.now();
    // The cost recorded by the renderer wrapper belongs to the frame that was
    // submitted before this callback ran, so it lags by one frame.
    const cpuMs = readSceneFrameCpuMs();
    // Development-only overlays make frames the production build never pays
    // for. Counting them taught the controller to degrade a scene that was
    // never slow.
    const instrumented = takeSceneFrameInstrumented();
    markSceneFrameStart(now);
    const ms = delta * 1_000;
    if (
      !instrumented &&
      !document.hidden &&
      Number.isFinite(ms) &&
      ms > 0 &&
      ms < 1_000
    )
      frames.current.push({ at: now, ms, cpuMs });
    while (
      frames.current.length > 0 &&
      now - frames.current[0]!.at > QUALITY_SAMPLE_WINDOW_MS
    )
      frames.current.shift();
    if (now - lastSampleAt.current < QUALITY_SAMPLE_INTERVAL_MS) return;
    lastSampleAt.current = now;
    const metrics = summariseSceneFrameWindow(frames.current);
    if (metrics) onSample(metrics);
  }, -999);
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
function MovementProbe({ onChange }: { onChange: (moving: boolean) => void }) {
  const previous = useRef(progressRef.current);
  const moving = useRef(false);
  const lastMovedAt = useRef(-Infinity);
  useFrame(() => {
    const now = performance.now();
    const progress = progressRef.current;
    if (Math.abs(progress - previous.current) > 0.000_002) {
      lastMovedAt.current = now;
      if (!moving.current) {
        moving.current = true;
        setSceneTraveling(true);
        onChange(true);
      }
    } else if (moving.current && now - lastMovedAt.current >= 650) {
      moving.current = false;
      setSceneTraveling(false);
      onChange(false);
    }
    previous.current = progress;
  });
  useEffect(() => () => setSceneTraveling(false), []);
  return null;
}

/** Idle-compile the scene after each real theme/quality variant is mounted. */
function ShaderPrewarm({ variant }: { variant: string }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let cancelled = false;
    let timeout = 0;
    let idle = 0;
    const schedule = () => {
      if (cancelled) return;
      if (scenePrewarmDeferred()) {
        timeout = window.setTimeout(schedule, 250);
        return;
      }
      if (idleApi.requestIdleCallback) {
        idle = idleApi.requestIdleCallback(compile, { timeout: 1800 });
      } else {
        timeout = window.setTimeout(compile, 500);
      }
    };
    const compile = () => {
      if (cancelled) return;
      // An idle callback may have been queued before travel began. Re-check at
      // execution time so compilation cannot land in the middle of a jump.
      if (scenePrewarmDeferred()) {
        timeout = window.setTimeout(schedule, 250);
        return;
      }
      try {
        // Three's compileAsync polling can dereference an absent program on
        // some WebGL drivers, throwing outside the returned promise. Running
        // the ordinary compiler during idle keeps prewarming best-effort and
        // contains every failure in this call stack.
        gl.compile(scene, camera);
      } catch {
        // Compilation remains an optimization. A driver that rejects the
        // prewarm path must never prevent the already-renderable world.
      }
      // Either way the precompile is over, and frames after it are
      // representative in a way frames during it are not. A driver that threw
      // still stops the clock: waiting forever on it would mean never grading
      // the device at all.
      shaderPrecompileComplete = true;
    };
    const idleApi = window as unknown as {
      requestIdleCallback?: Window["requestIdleCallback"];
      cancelIdleCallback?: Window["cancelIdleCallback"];
    };
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (idle && idleApi.cancelIdleCallback) idleApi.cancelIdleCallback(idle);
    };
  }, [camera, gl, scene, variant]);
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
  // Travel freezes while the mobile panel or the book modal owns the screen.
  const panelState = useStacks((s) => s.panelState);
  const modalOpen = useStacks((s) => s.modalOpen);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const [rendererCapability, setRendererCapability] =
    useState<RendererCapability>("unknown");
  const rendererEvidence = useRef<{
    webglVersion: 1 | 2;
    maxTextureSize: number;
    maxSamples: number;
    physicalPixels: number;
    logicalCores: number | null;
    deviceMemoryGb: number | null;
    unmaskedRenderer: string | null;
  } | null>(null);
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
  const coarseTouch = useCoarseTouchCapability();
  // The HUD can be opened at any time, including long after the canvas was
  // created. Re-run the installer when that happens so the panel never
  // renders against hooks that do not exist.
  useEffect(() => {
    const stop = onDevHooksRequested(() => installDevHooks());
    return () => {
      stop();
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
    // The learned device class is intentionally fixed for this mount. A
    // resize pauses learning but does not turn the same device into a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rendererCapability],
  );
  // Restored as a STARTING POINT, never as a floor or a ceiling: the device
  // that was thermally throttled last visit may not be this visit.
  const restoredLearning = useMemo<LearnedQuality | null>(() => {
    if (typeof window === "undefined" || queryMode !== "auto") return null;
    return readLearnedQuality(storageBucket);
  }, [queryMode, storageBucket]);
  const restoredProfile = restoredLearning?.profile ?? null;
  const initialProfile =
    queryMode === "auto" ? (restoredProfile ?? "balanced") : queryMode;
  const [adaptation, dispatchQuality] = useReducer(
    reduceSceneQualityAdaptation,
    undefined,
    () =>
      initialSceneQualityAdaptationState(
        initialProfile,
        typeof performance === "undefined" ? 0 : performance.now(),
        restoredProfile ? "restored" : "startup",
      ),
  );
  const adaptationRef = useRef(adaptation);
  adaptationRef.current = adaptation;
  // The three axes run alongside the profile ladder on the same evidence.
  // The ladder still resolves the plan every consumer reads; the axes decide
  // where on the three dials the scene should stand.
  const [axisState, dispatchAxes] = useReducer(
    reduceSceneQualityAxes,
    undefined,
    () => {
      // A phone must not begin at Balanced and spend its opening half-minute
      // walking down the ladder in front of the visitor. Nothing is learned
      // yet, so the starting guess is all we have.
      const base = initialSceneQualityAxisState(
        queryMode === "auto"
          ? (restoredProfile ??
            startingProfileForDevice({
              // Renderer evidence is not available this early — it is read in
              // `onCreated` — so the opening guess rests on the viewport and
              // the pointer, which ARE known. Measurement corrects it within
              // seconds either way.
              weakRenderer: rendererEvidence.current
                ? rendererLooksWeak(rendererEvidence.current)
                : false,
              touch: coarseTouch,
              narrowViewport: viewport.width < STACKS_DESKTOP_MIN_WIDTH,
            }))
          : initialProfile,
        typeof performance === "undefined" ? 0 : performance.now(),
        queryMode === "auto" ? null : queryMode,
      );
      if (!restoredLearning) return base;
      return {
        ...base,
        axes: {
          resolutionStep: restoredLearning.resolutionStep,
          effects: restoredLearning.effects,
          content: restoredLearning.content,
        },
      };
    },
  );
  const axesRef = useRef<SceneQualityAxes>(axisState.axes);
  axesRef.current = axisState.axes;
  const [liveMetrics, setLiveMetrics] = useState<SceneQualityMetrics | null>(
    null,
  );
  const [learnedProfile, setLearnedProfile] =
    useState<SceneQualityProfile | null>(restoredProfile);

  const previousCapabilityBucket = useRef(storageBucket);
  useEffect(() => {
    if (previousCapabilityBucket.current === storageBucket) return;
    previousCapabilityBucket.current = storageBucket;
    if (mode !== "auto" || rendererCapability === "unknown") return;
    const stored = readLearnedQuality(storageBucket)?.profile ?? null;
    if (!stored) return;
    setLearnedProfile(stored);
    dispatchQuality({
      type: "profile",
      now: performance.now(),
      profile: stored,
      reason: "restored",
    });
  }, [mode, rendererCapability, storageBucket]);

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
      dispatchQuality({ type: "ignore", now: performance.now() });
    };
    window.addEventListener("resize", measure, { passive: true });
    return () => window.removeEventListener("resize", measure);
  }, []);

  const previousMode = useRef<SceneQualityMode>(mode);
  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    let profile: SceneQualityProfile;
    if (mode === "auto") {
      // Storage is an optional optimization; Balanced remains deterministic.
      const stored = readLearnedQuality(storageBucket)?.profile ?? null;
      profile = stored ?? "balanced";
      setLearnedProfile(stored);
    } else {
      profile = mode;
    }
    dispatchQuality({
      type: "profile",
      now: performance.now(),
      profile,
      reason: "manual",
    });
  }, [mode, storageBucket]);

  useEffect(() => {
    dispatchQuality({ type: "freeze", frozen: qualityControls.frozen });
  }, [qualityControls.frozen]);

  const resetRequest = useRef(qualityControls.resetRequest);
  useEffect(() => {
    if (resetRequest.current === qualityControls.resetRequest) return;
    resetRequest.current = qualityControls.resetRequest;
    clearLearnedQuality(storageBucket);
    setLearnedProfile(null);
    if (mode === "auto")
      dispatchQuality({
        type: "profile",
        now: performance.now(),
        profile: "balanced",
        reason: "manual",
      });
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

  const previousDurable = useRef(LEGACY_RUNG_BY_PROFILE[adaptation.profile]);
  useEffect(() => {
    const durable = LEGACY_RUNG_BY_PROFILE[adaptation.profile];
    if (durable === previousDurable.current) return;
    const at = performance.now();
    performanceSampler.transition({
      at,
      from: previousDurable.current,
      to: durable,
      reason: adaptation.transitionReason,
    });
    scenePerformanceTrace.event({
      at,
      type: "quality-transition",
      detail: {
        from: previousDurable.current,
        to: durable,
        profile: adaptation.profile,
        reason: adaptation.transitionReason,
        metrics: adaptation.metrics,
        declineBaseline: adaptation.declineBaseline,
      },
    });
    previousDurable.current = durable;
  }, [
    adaptation.declineBaseline,
    adaptation.metrics,
    adaptation.profile,
    adaptation.transitionReason,
  ]);

  const onMovementChange = useCallback((moving: boolean) => {
    const now = performance.now();
    dispatchQuality({ type: "movement", moving, now });
    // Pre-emptive: the visitor initiated this, so the headroom is taken
    // before a frame is missed rather than after.
    dispatchAxes({ type: moving ? "travel-start" : "travel-end", now });
    scenePerformanceTrace.event({
      at: now,
      type: moving ? "travel-start" : "travel-end",
      detail: {
        progress: progressRef.current,
        activeUnit: useStacks.getState().activeUnit,
      },
    });
  }, []);

  useEffect(() => {
    scenePerformanceTrace.event({
      at: performance.now(),
      type: "theme-change",
      detail: { theme: dark ? "dark" : "light" },
    });
    dispatchQuality({ type: "ignore", now: performance.now() });
  }, [dark]);
  useEffect(() => {
    const onVisibility = () => {
      scenePerformanceTrace.event({
        at: performance.now(),
        type: "visibility-change",
        detail: { hidden: document.hidden },
      });
      if (!document.hidden)
        dispatchQuality({ type: "ignore", now: performance.now() });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const noPostfx = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.location.search.includes("nopostfx"),
    [],
  );
  // A continuously adapting resolution makes an exact device-pixel-ratio
  // assertion inherently racy. The harness flag already marks the runs that
  // make those assertions, so it is also what holds the axis still.
  const harnessPinnedResolution = useMemo(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("harness"),
    [],
  );
  const plan = useMemo(
    () =>
      resolveSceneQualityPlan({
        mode,
        profile: adaptation.profile,
        // Automatic mode drives content from the axis; a forced preset lets
        // the plan resolve the preset's own tier.
        // Believe whichever of the two systems is more worried. The profile
        // ladder still resolves effects and the resolution cap, so a ladder
        // sitting at Safety while geometry stayed full meant the scene was
        // ignoring its own conclusion.
        contentTier:
          mode === "auto"
            ? cheaperContentTier(
                axisState.axes.content,
                CONTENT_TIER_BY_PROFILE[adaptation.profile],
              )
            : undefined,
        // The effects axis. Same shape as content: automatic mode drives it
        // from the axis, a forced preset lets the plan resolve the preset's
        // own tier. It caps the profile's block rather than replacing it.
        effectsTier: mode === "auto" ? axisState.axes.effects : undefined,
        // Pinned under the harness so end-to-end tests that assert an exact
        // device pixel ratio are not racing a continuously adapting value.
        // Pinning is the correct fix there; loosening the assertion is not.
        // An explicit manual pin outranks the harness pin: the harness flag
        // exists to stop the AXIS drifting under an assertion, not to ignore
        // a step someone deliberately selected.
        resolutionStep:
          qualityControls.resolutionStep ??
          (harnessPinnedResolution ? null : axisState.axes.resolutionStep),
        cssWidth: viewport.width,
        cssHeight: viewport.height,
        deviceDpr: viewport.deviceDpr,
        narrowViewport: viewport.width < STACKS_DESKTOP_MIN_WIDTH,
        touch:
          rendererCapability === "unknown" ||
          rendererCapability === "constrained",
        directRender: adaptation.directRender || noPostfx,
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
          simplifiedFarMeadow: scenePerformanceController.isOverridden(
            "simplifiedFarMeadow",
          )
            ? performanceSettings.simplifiedFarMeadow
            : undefined,
        },
        hasCustomOverrides:
          scenePerformanceController.hasOverrides() ||
          !scenePerformanceSettingsEqual(
            performanceSettings,
            DEFAULT_SCENE_PERFORMANCE_SETTINGS,
          ),
      }),
    [
      adaptation.directRender,
      adaptation.profile,
      axisState.axes.content,
      axisState.axes.effects,
      axisState.axes.resolutionStep,
      qualityControls.resolutionStep,
      harnessPinnedResolution,
      rendererCapability,
      mode,
      noPostfx,
      performanceSettings,
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
    dispatchQuality({ type: "ignore", now: performance.now() });
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
  const onQualitySample = useCallback(
    (metrics: SceneQualityMetrics) => {
      setLiveMetrics(metrics);
      if (!booted.current) {
        const now = performance.now();
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
      if (rendererEvidence.current)
        setRendererCapability(
          deriveRendererCapability({
            ...rendererEvidence.current,
            observed: metrics,
          }),
        );
      dispatchAxes({
        type: "sample",
        now: performance.now(),
        metrics,
        visible: !document.hidden,
      });
      if (mode !== "auto") return;
      dispatchQuality({
        type: "sample",
        now: performance.now(),
        metrics,
        visible: !document.hidden,
      });
    },
    [mode],
  );
  const onComposerError = useCallback(() => {
    const now = performance.now();
    scenePerformanceTrace.event({ at: now, type: "effects-error" });
    dispatchQuality({ type: "effects-error", now });
  }, []);

  useEffect(() => {
    if (
      mode !== "auto" ||
      adaptation.moving ||
      adaptation.directRender ||
      document.hidden
    )
      return;
    const remaining = Math.max(
      0,
      adaptation.stableSince + QUALITY_PERSIST_STABLE_MS - performance.now(),
    );
    const timeout = window.setTimeout(() => {
      if (
        document.hidden ||
        adaptationRef.current.profile !== adaptation.profile ||
        adaptationRef.current.moving ||
        adaptationRef.current.directRender
      )
        return;
      // Learning is best-effort and never gates rendering. The axis triple is
      // what the controller restores from; the profile name rides along for
      // the overlay and for scripts that still speak in preset names.
      writeLearnedQuality(
        storageBucket,
        axesRef.current,
        adaptation.profile,
      );
      setLearnedProfile(adaptation.profile);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [
    adaptation.directRender,
    adaptation.moving,
    adaptation.profile,
    adaptation.stableSince,
    mode,
    storageBucket,
  ]);

  const cooldownMs = useMemo(() => {
    // Recompute the displayed countdown on each 250 ms metrics publication.
    void liveMetrics;
    return Math.max(
      0,
      adaptation.lastTransitionAt +
        (adaptation.transitionReason === "recovery"
          ? QUALITY_RECOVERY_COOLDOWN_MS
          : QUALITY_DECLINE_COOLDOWN_MS) -
        performance.now(),
    );
  }, [adaptation.lastTransitionAt, adaptation.transitionReason, liveMetrics]);
  const fallbackStatus = adaptation.directRender
    ? adaptation.transitionReason === "effects-error"
      ? "direct-effects-error"
      : "direct-safety"
    : "composer";
  // Which resource the last window was short of. Published rather than only
  // acted on, so the overlay can show why the scene made its decision.
  const liveConstraint = liveMetrics
    ? classifySceneFrameConstraint(liveMetrics)
    : null;
  qualitySnapshot = {
    mode,
    profile: plan.profile,
    durable: plan.legacyRung,
    moving: adaptation.moving,
    frozen: adaptation.frozen,
    forced: mode !== "auto",
    effectiveDpr: plan.dpr,
    physicalPixels: plan.physicalPixels,
    postprocessing: postfxQuality,
    sharpen: sharpenAmount,
    meadowRung: plan.environment.meadowRung,
    contentTier: plan.environment.contentTier,
    cloudDetail: plan.environment.cloudDetail === "full",
    transitionReason: adaptation.transitionReason,
    declineBaseline: adaptation.declineBaseline,
    storageBucket,
    learnedProfile,
    fallbackStatus,
    metrics: liveMetrics,
    constraint: liveConstraint,
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
      transitionReason: adaptation.transitionReason,
      fallbackStatus,
    });
  }, [
    liveConstraint,
    axisState.axes,
    mode,
    adaptation.transitionReason,
    cooldownMs,
    fallbackStatus,
    learnedProfile,
    liveMetrics,
    plan,
    storageBucket,
  ]);

  const onOpenBook = useCallback(
    (id: string) => {
      const book = data.shelfBooks.find((b) => b.id === id);
      if (book) useStacks.getState().setPendingBook(book);
    },
    [data.shelfBooks],
  );
  const onOpenUrl = useCallback((url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

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
      <Canvas
        shadows="soft"
        camera={{ position: [0, CAMERA.y, CAMERA.z], fov: CAMERA.fov }}
        dpr={dpr}
        // Keep hardware MSAA as the renderer's guaranteed edge-quality floor.
        // Desktop normally adds SMAA in the composer, but the performance
        // ladder deliberately unmounts that composer after a sustained
        // decline. Creating the context without MSAA made that fallback path
        // lose ALL antialiasing and exposed stair-stepped shelf silhouettes.
        gl={{ antialias: true }}
        onCreated={({ gl, scene, camera }) => {
          gl.toneMappingExposure = dark ? 1.25 : 1.12;
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
          rendererEvidence.current = {
            webglVersion: webgl2 ? 2 : 1,
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
          setRendererCapability(
            deriveRendererCapability(rendererEvidence.current),
          );
          installDevHooks();
          if (onLost) {
            gl.domElement.addEventListener("webglcontextlost", () => onLost(), {
              once: true,
            });
          }
          // Signal readiness only after a frame has actually been painted so
          // the boot→world crossfade never reveals a blank canvas.
          requestAnimationFrame(() => requestAnimationFrame(onReady));
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
        <PerformanceProbe />
        <PerformanceTraceObservers />
        <AdaptiveQualityProbe onSample={onQualitySample} />
        <SceneAudioBridge />
        <PhysicsPrewarm />
        <MovementProbe onChange={onMovementChange} />
        <ShaderPrewarm
          variant={`${dark ? "dark" : "light"}-${plan.profile}-${postfxQuality}`}
        />
        <ScrollControls
          horizontal
          pages={UNIT_COUNT}
          damping={0.2}
          maxSpeed={1.2}
          // Carrying a prop freezes travel too, but NOT through this flag.
          // drei only short-circuits its own handler here, so the element
          // keeps scrolling natively anyway; Grabbable sets overflowX hidden
          // instead, which means no scroll event fires at all. Routing it
          // through `enabled` as well would cost a full re-render of the
          // scene on every grab — and because ModelProp's memo depends on
          // caller-inline `tints`/`atlasOverride` literals, each of those
          // re-renders clones a fresh material per tinted mesh and strands
          // the old one on the GPU.
          enabled={panelState === "closed" && !modalOpen}
          style={{ scrollbarWidth: "none", touchAction: "pan-x pinch-zoom" }}
        >
          <ScrollRegionA11y />
          <Scene
            data={data}
            palette={palette}
            dark={dark}
            coverWidth={bookCoverWidthForNeed(
              Math.min(viewport.width * 0.5, viewport.height * 0.35),
              plan.profile,
            )}
            quality={plan}
            onOpenBook={onOpenBook}
            onOpenUrl={onOpenUrl}
          />
        </ScrollControls>
      </Canvas>
    </div>
  );
}
