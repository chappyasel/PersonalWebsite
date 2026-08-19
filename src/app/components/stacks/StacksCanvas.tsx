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
import { setLoadProgress } from "./loading";
import { cameraTravelDiagnostics } from "./scene/CameraRig";
import { prewarmGrabbablePhysics } from "./scene/Grabbable";
import Scene from "./scene/Scene";
import SceneGlassSampler from "./scene/SceneGlassSampler";
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
import {
  LEGACY_RUNG_BY_PROFILE,
  QUALITY_DECLINE_COOLDOWN_MS,
  QUALITY_PERSIST_STABLE_MS,
  QUALITY_RECOVERY_COOLDOWN_MS,
  QUALITY_SAMPLE_INTERVAL_MS,
  QUALITY_SAMPLE_WINDOW_MS,
  type SceneQualityMetrics,
  type SceneQualityMode,
  type SceneQualityPlan,
  type SceneQualityProfile,
  initialSceneQualityAdaptationState,
  qualityModeFromSearch,
  qualityProfileFromValue,
  reduceSceneQualityAdaptation,
  resolveSceneQualityPlan,
  sceneQualityStorageBucket,
} from "./scene/quality";
import { sceneGlassSnapshotController } from "./scene/sceneGlassSnapshot";
import {
  DEFAULT_SCENE_PERFORMANCE_SETTINGS,
  adaptiveSharpenAmount,
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
import { CAMERA, unitPose } from "./scene/worldLayout";
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

function installDevHooks() {
  // Production measurements opt in explicitly. Keeping the hooks behind a
  // query flag lets Playwright exercise the optimized build without exposing
  // the control surface during ordinary visits.
  if (
    process.env.NODE_ENV === "production" &&
    !new URLSearchParams(window.location.search).has("harness")
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
  const progress = useProgress((s) => s.progress);
  useEffect(() => {
    setLoadProgress(progress / 100);
  }, [progress]);
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
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const unitSamples = useMemo(
    () =>
      Array.from({ length: UNIT_COUNT }, () => [
        camera.position.clone(),
        camera.position.clone(),
        camera.position.clone(),
      ]),
    [camera],
  );
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
      const visibleUnits: number[] = [];
      for (let index = 0; index < UNIT_COUNT; index += 1) {
        const pose = unitPose(index);
        const [center, left, right] = unitSamples[index]!;
        const yaw = pose.rotation[1];
        const edgeX = Math.cos(yaw) * 1.9;
        const edgeZ = -Math.sin(yaw) * 1.9;
        center!.set(pose.position[0], 0.4, pose.position[2]).project(camera);
        left!
          .set(pose.position[0] - edgeX, 0.4, pose.position[2] - edgeZ)
          .project(camera);
        right!
          .set(pose.position[0] + edgeX, 0.4, pose.position[2] + edgeZ)
          .project(camera);
        if (
          [center, left, right].some(
            (sample) =>
              sample!.z >= -1 &&
              sample!.z <= 1 &&
              sample!.x >= -1.05 &&
              sample!.x <= 1.05,
          )
        )
          visibleUnits.push(index);
      }
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
        visibleUnits,
        qualityProfile:
          typeof quality.profile === "string" ? quality.profile : null,
        dpr:
          typeof quality.effectiveDpr === "number"
            ? quality.effectiveDpr
            : null,
        glassMode: scenePerformanceController.getSnapshot().placardGlassMode,
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

/** Two-second rolling window evaluated four times a second. The fastest
 * stable frames identify display cadence, capped at 60 Hz, while p95 and the
 * dropped-frame ratio drive the pure adaptation reducer. */
function AdaptiveQualityProbe({
  onSample,
}: {
  onSample: (metrics: SceneQualityMetrics) => void;
}) {
  const frames = useRef<Array<{ at: number; ms: number }>>([]);
  const lastSampleAt = useRef(0);
  useFrame((_, delta) => {
    const now = performance.now();
    const ms = delta * 1_000;
    if (!document.hidden && Number.isFinite(ms) && ms > 0 && ms < 1_000)
      frames.current.push({ at: now, ms });
    while (
      frames.current.length > 0 &&
      now - frames.current[0]!.at > QUALITY_SAMPLE_WINDOW_MS
    )
      frames.current.shift();
    if (now - lastSampleAt.current < QUALITY_SAMPLE_INTERVAL_MS) return;
    lastSampleAt.current = now;
    const sorted = frames.current
      .map((frame) => frame.ms)
      .sort((a, b) => a - b);
    if (sorted.length < 2) return;
    const at = (portion: number) =>
      sorted[
        Math.min(sorted.length - 1, Math.ceil(sorted.length * portion) - 1)
      ]!;
    const targetFrameMs = Math.max(1_000 / 60, at(0.1));
    onSample({
      targetFrameMs,
      targetHz: Math.min(60, Math.round(1_000 / targetFrameMs)),
      p95: at(0.95),
      droppedFrameRatio:
        sorted.filter((frame) => frame > targetFrameMs * 1.5).length /
        sorted.length,
      sampleCount: sorted.length,
    });
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
  const activeUnit = useStacks((s) => s.activeUnit);
  const isTouch = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
    [],
  );
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
  const qualityControls = useSceneQualityControls();
  const [querySynchronized, setQuerySynchronized] = useState(false);
  const mode = querySynchronized ? qualityControls.mode : queryMode;
  const storageBucket = useMemo(
    () =>
      sceneQualityStorageBucket({
        touch: isTouch,
        cssWidth: viewport.width,
        cssHeight: viewport.height,
        deviceDpr: viewport.deviceDpr,
      }),
    // The learned device class is intentionally fixed for this mount. A
    // resize pauses learning but does not turn the same device into a new one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTouch],
  );
  const restoredProfile = useMemo<SceneQualityProfile | null>(() => {
    if (typeof window === "undefined" || queryMode !== "auto") return null;
    try {
      return qualityProfileFromValue(
        window.sessionStorage.getItem(storageBucket) ?? "",
      );
    } catch {
      return null;
    }
  }, [queryMode, storageBucket]);
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
  const [liveMetrics, setLiveMetrics] = useState<SceneQualityMetrics | null>(
    null,
  );
  const [learnedProfile, setLearnedProfile] =
    useState<SceneQualityProfile | null>(restoredProfile);

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
      let stored: SceneQualityProfile | null = null;
      try {
        stored = qualityProfileFromValue(
          window.sessionStorage.getItem(storageBucket) ?? "",
        );
      } catch {
        // Storage is an optional optimization; Balanced remains deterministic.
      }
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
    try {
      window.sessionStorage.removeItem(storageBucket);
    } catch {
      // Session storage can be unavailable in hardened browsing modes.
    }
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
    scenePerformanceTrace.event({
      at: now,
      type: moving ? "travel-start" : "travel-end",
      detail: {
        progress: progressRef.current,
        activeUnit: useStacks.getState().activeUnit,
      },
    });
    if (
      !moving &&
      scenePerformanceController.getSnapshot().placardGlassMode === "sampled"
    )
      sceneGlassSnapshotController.request("travel-settled");
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
  const plan = useMemo(
    () =>
      resolveSceneQualityPlan({
        mode,
        profile: adaptation.profile,
        cssWidth: viewport.width,
        cssHeight: viewport.height,
        deviceDpr: viewport.deviceDpr,
        touch: isTouch,
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
      isTouch,
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
  const onQualitySample = useCallback(
    (metrics: SceneQualityMetrics) => {
      setLiveMetrics(metrics);
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
      try {
        window.sessionStorage.setItem(storageBucket, adaptation.profile);
        setLearnedProfile(adaptation.profile);
      } catch {
        // Learning is best-effort and never gates rendering.
      }
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
    cloudDetail: plan.environment.cloudDetail === "full",
    transitionReason: adaptation.transitionReason,
    declineBaseline: adaptation.declineBaseline,
    storageBucket,
    learnedProfile,
    fallbackStatus,
    metrics: liveMetrics,
    customOverrides: plan.customOverrides,
    plan,
  };
  useEffect(() => {
    sceneQualityController.publishRuntime({
      plan,
      metrics: liveMetrics,
      storageBucket,
      learnedProfile,
      cooldownRemainingMs: cooldownMs,
      transitionReason: adaptation.transitionReason,
      fallbackStatus,
    });
  }, [
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

  return (
    <div className="stacks-canvas-shell absolute inset-0">
      <LoadReporter />
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
          sceneRef = scene;
          cameraRef = camera;
          setInteractionProjectionContext(camera, gl.domElement);
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
        {performanceSettings.placardGlassMode === "sampled" && (
          <SceneGlassSampler
            variant={`${dark ? "dark" : "light"}-${activeUnit}`}
            paused={adaptation.moving}
          />
        )}
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
          style={{ scrollbarWidth: "none", touchAction: "pan-x" }}
        >
          <ScrollRegionA11y />
          <Scene
            data={data}
            palette={palette}
            dark={dark}
            coverWidth={isTouch ? 256 : 384}
            quality={plan}
            onOpenBook={onOpenBook}
            onOpenUrl={onOpenUrl}
          />
        </ScrollControls>
      </Canvas>
    </div>
  );
}
