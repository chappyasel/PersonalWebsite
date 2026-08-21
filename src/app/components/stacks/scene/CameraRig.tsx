"use client";

// Drives the camera from the drei scroll offset, publishes per-frame progress
// to the transient ref, flips activeUnit only on unit-boundary crosses, and
// registers the scroll element with the store for the DOM bridges.
import {
  GOLF_STOP_POSITION,
  UNIT_COUNT,
  golfFocusedForScenePosition,
  initialScenePositionFromLocation,
} from "../data";
import { browserStorage } from "../mobile/liveness";
import { presentationProfileForViewport } from "../mobile/presentation";
import {
  INERT_HOVER,
  panelCoverageRef,
  progressRef,
  railRightPxRef,
  touchWorldRef,
  useStacks,
} from "../store";
import { useScroll } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";

import {
  cameraDepthDiagnosticsController,
  cameraDepthEffectEnabled,
} from "./cameraDepthDiagnostics";
import {
  cameraTravelState,
  cameraTravelTransition,
  clampCameraZoom,
  interactionFocusYOffset,
  interactionZoomTarget,
  isGolfControlInteraction,
} from "./cameraZoom";
import {
  freeRoamDiagnosticsController,
  readFreeRoamPose,
  writeFreeRoamPose,
} from "./freeRoamDiagnostics";
import {
  cursorForInteraction,
  getSceneInteraction,
} from "./interactionRegistry";
import { SEAT_POSE, isSeated, leaveSeat, setSeatAmount } from "./seated";
import {
  CAMERA_LOOK_X_MAX_LAG,
  STACKS_DESKTOP_MIN_WIDTH,
  aboutStopShift,
  cameraCompositionForViewport,
  cameraDepthOffsetsForViewport,
  cameraForAspect,
  cameraXForScrollOffset,
  captureCameraYFromSearch,
  captureFovFromSearch,
  captureHeadOnFromSearch,
  captureLookYFromSearch,
  golfDollyForViewport,
  golfLookYOffsetForViewport,
  ogCaptureFromSearch,
  scrollOffsetForUnit,
  unitProgressForScrollOffset,
} from "./worldLayout";

/** Field of view while seated. Travel runs a narrow 33 so one shelf unit
 * fills the frame; a horizon needs more room than a bookcase does. */
const SEAT_FOV = 42;
/** Rate constant for the 0→1 seat blend, per SECOND rather than per frame.
 *
 * Per-frame easing is what the rest of this rig uses and it is wrong here.
 * The trip is 5.4 world units, about 5.6 m of room, and a per-frame constant
 * makes its duration a function of the display: measured on a 120 Hz panel the
 * old 0.055 landed the whole walk in roughly 250 ms, so the thing tuned to
 * read as walking read as a teleport on exactly the hardware most likely to
 * see it. 1.75/s reaches 99% in about 2.6 s on any display: slow enough to
 * read as one calm move, short enough not to become a cutscene.
 *
 * A brisk walk would take four seconds. This is faster than a person, and
 * deliberately: it is a transition, not a cutscene. */
const SEAT_RATE = 1.75;
/** Three deliberately overlapping beats: approach, turn, then descend.
 *
 * The old path had already completed 84% of its approach at seatAmount .57,
 * while it was still staring directly at the cushion. It cleared the AABB,
 * but the chair filled most of the frame and visually read as a collision.
 * Holding the approach until .84 (with the squared easing below), beginning
 * the vista turn at .42, and delaying the drop until .72 keeps that closest
 * pass high, distant, and looking over the upholstery. */
const WALK_END = 0.84;
const TURN_START = 0.42;
const TURN_END = 0.72;
const SIT_START = 0.72;
/** How far short of the seat you stand before dropping into it, in z. */
const STAND_BACK = 0.82;
/** Rise during the approach. The new couch is both deeper and taller; keeping
 * the travel camera at shelf height made the last diagonal skim its back. */
const APPROACH_LIFT = 0.65;
/** Walking cadence, rad/s. 11 is ~105 steps per minute, an unhurried indoor
 * walk. The bob rides a gait envelope that is zero at both ends, so the
 * camera never bobs while standing still or while seated. */
const GAIT_RATE = 11;

/** Convert a per-frame interpolation amount authored at 60 Hz into the
 * equivalent exponential rate. At 60 Hz these are pixel-identical to the old
 * alphas; at 30/120/144 Hz they now cover the same distance per second. */
const lambdaAt60Hz = (alpha: number) => -Math.log(1 - alpha) * 60;
const LEAN_LAMBDA = lambdaAt60Hz(0.08);
const BASE_Y_LAMBDA = lambdaAt60Hz(0.05);
const LOOK_X_LAMBDA = lambdaAt60Hz(0.045);
const LOOK_Y_LAMBDA = lambdaAt60Hz(0.05);
const FRAMING_LAMBDA = lambdaAt60Hz(0.12);
const SEAT_POINTER_LAMBDA = 5.5;

const FREE_ROAM_SPEED = 4;
const FREE_ROAM_LOOK_SENSITIVITY = 0.0018;
const FREE_ROAM_LOOK_LAMBDA = 18;
const FREE_ROAM_MAX_PITCH = Math.PI / 2 - 0.01;

const smoothstep = (x: number) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};
/** How far the travel offset may drift before the seat is dropped. Anything
 * that moves the room — wheel, rail, deep link, travelTo — wins over sitting;
 * this is the one place that has to notice, so SitChair does not have to
 * subscribe to five different input paths. */
const SEAT_TRAVEL_TOLERANCE = 0.0015;

const UP = new THREE.Vector3(0, 1, 0);

/** Allocation-free travel telemetry for the opt-in performance trace. Kept
 * outside React so observing the camera never creates another render path. */
export const cameraTravelDiagnostics = {
  targetX: 0,
  lookX: 0,
  lookLagX: 0,
};

/** The About stop's rest shift ("move the initial scene", round 2): solved
 * so the projected shelf edge clears the rail's measured widest row. Read
 * from the live window and railRightPxRef each call rather than captured —
 * the scroll-element effect outlives resizes and font swaps. Mobile chrome
 * has no left rail, so below the desktop seam the stop stays on the
 * shelf's centre line. 210px stands in until UnitRail's first measurement
 * lands (its layout effect runs before this frame in practice). */
function currentAboutShift(): number {
  if (typeof window === "undefined") return 0;
  if (captureHeadOnFromSearch(window.location.search)) return 0;
  if (window.innerWidth < STACKS_DESKTOP_MIN_WIDTH) return 0;
  return aboutStopShift(
    window.innerWidth,
    window.innerHeight,
    railRightPxRef.current || 210,
  );
}

export default function CameraRig() {
  const scroll = useScroll();
  const look = useRef(new THREE.Vector3(0, -0.05, -0.2));
  const prevActive = useRef(0);
  const prevGolfFocused = useRef(false);
  // 0→1 while the mobile panel is open: dolly toward the unit, kill the bob.
  const lean = useRef(0);
  // Damped copy of the sheet's screen coverage, driving the frustum offset.
  const framing = useRef(0);
  const focusAmount = useRef(0);
  const focusX = useRef(0);
  const focusY = useRef(0);
  const interactionZoom = useRef(0);
  const visitorZoom = useRef(0);
  const focusBounds = useRef(new THREE.Box3());
  const focusCenter = useRef(new THREE.Vector3());
  const previousScenePosition = useRef(0);
  const wasBlockingTravel = useRef(false);
  const settledFor = useRef(0);
  // Travel height, integrated separately from camera.position.y. The seat
  // blend writes camera.position.y outright, and damping toward a target from
  // an already-blended value feeds back on itself.
  const baseY = useRef(0);
  // Raw 0→1 seat approach, its eased twin, and the offset the seat was taken
  // at (travel away from it stands you up).
  const seat = useRef(0);
  const wasSeated = useRef(false);
  const seatOffset = useRef(0);
  const seatAim = useRef(new THREE.Vector3());
  const seatEye = useRef(new THREE.Vector3());
  const seatPointer = useRef(new THREE.Vector2());
  const initialAboutPending = useRef(true);
  const initialAboutFrames = useRef(0);
  const travelEye = useRef(new THREE.Vector3());
  const travelLook = useRef(new THREE.Vector3());
  const previousCameraDepthEnabled = useRef<boolean | null>(null);
  // Walk-to-the-chair scratch: Bezier control point, the position along it,
  // and the point on the chair you keep your eyes on while approaching.
  const ctrl = useRef(new THREE.Vector3());
  const walkPos = useRef(new THREE.Vector3());
  const chairLook = useRef(new THREE.Vector3());
  const orient = useRef(new THREE.Matrix4());
  const qTravel = useRef(new THREE.Quaternion());
  const qWalk = useRef(new THREE.Quaternion());
  const qApproach = useRef(new THREE.Quaternion());
  const qSeat = useRef(new THREE.Quaternion());
  const qMix = useRef(new THREE.Quaternion());
  const freeRoamEuler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const freeRoamTargetEuler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const freeRoamKeys = useRef(new Set<string>());
  const freeRoamMove = useRef(new THREE.Vector3());
  const freeRoamForward = useRef(new THREE.Vector3());
  const freeRoamRight = useRef(new THREE.Vector3());
  const wasFreeRoaming = useRef(false);
  const freeRoamLastPoseWrite = useRef(0);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const freeRoam = useSyncExternalStore(
    freeRoamDiagnosticsController.subscribe,
    freeRoamDiagnosticsController.getSnapshot,
    freeRoamDiagnosticsController.getSnapshot,
  );
  const freeRoamEnabled = freeRoam.enabled;
  const freeRoamStorage = useMemo(
    () =>
      process.env.NODE_ENV === "development"
        ? browserStorage("localStorage")
        : null,
    [],
  );
  const pose = useMemo(
    () => cameraForAspect(size.width / size.height),
    [size.width, size.height],
  );
  const captureFov = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : captureFovFromSearch(window.location.search),
    [],
  );
  const captureLookY = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : captureLookYFromSearch(window.location.search),
    [],
  );
  const captureCameraY = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : captureCameraYFromSearch(window.location.search),
    [],
  );
  const ogCapture = useMemo(
    () =>
      typeof window === "undefined"
        ? false
        : ogCaptureFromSearch(window.location.search),
    [],
  );
  const reducedMotionQuery = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : window.matchMedia("(prefers-reduced-motion: reduce)"),
    [],
  );

  // Apply distance/fov when the pose changes (mount, resize, orientation).
  useEffect(() => {
    const initialY = captureCameraY ?? camera.position.y;
    baseY.current = initialY;
    camera.position.y = initialY;
    camera.position.z = pose.z;
    if ("fov" in camera) {
      (camera as THREE.PerspectiveCamera).fov = pose.fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
  }, [camera, captureCameraY, pose]);

  useEffect(() => {
    const el = scroll.el;
    el.classList.add("stacks-scroll");
    const state = useStacks.getState();
    state.setScrollEl(el);
    // Instant jump: snap drei's damped offset (its internal target ref and the
    // eased value) plus our look target so deep-links land without a flythrough.
    const scrollTarget = (scroll as unknown as { scroll: { current: number } })
      .scroll;
    const clampedOffset = (unit: number) =>
      Math.min(1, Math.max(0, scrollOffsetForUnit(unit, currentAboutShift())));
    // Start on About's true stop, leaving a real native-scroll lead-in to its
    // left for the complete chair. ScrollControls can mount before its pages
    // have layout, when max === 0; writing scrollLeft then is silently lost
    // and its next frame pulls the camera back to the far-left lead-in. Retry
    // from the camera frame after layout, and let any deep link cancel the
    // pending About sync rather than overwriting explicit navigation.
    // Infer first-load intent from the URL rather than Drei's mutable native
    // sentinel. It deliberately seeds `scrollLeft = 1`, and depending on
    // effect ordering its damped offset may already be a tiny non-zero value
    // when this child mounts. No hash is the canonical About URL; an explicit
    // unit hash belongs to ScrollBridges and must never be overwritten.
    const initialScenePosition = initialScenePositionFromLocation(
      window.location.pathname,
      window.location.hash,
    );
    initialAboutPending.current = initialScenePosition === 0;
    initialAboutFrames.current = 0;
    const markInitialSync = (value: string) => {
      if (process.env.NODE_ENV === "development") {
        el.dataset.stacksInitialSync = value;
      }
    };
    markInitialSync(
      `armed:${initialAboutPending.current}:${window.location.hash}`,
    );
    const cancelInitialSync = (reason = "complete") => {
      markInitialSync(`done:${reason}`);
      initialAboutPending.current = false;
    };
    const cancelFromPointer = (event: Event) =>
      cancelInitialSync(`input:${event.type}`);
    const recordPointerType = (event: PointerEvent) => {
      if (
        event.pointerType === "touch" ||
        event.pointerType === "mouse" ||
        event.pointerType === "pen"
      ) {
        touchWorldRef.interactionPointerType = event.pointerType;
      }
    };
    const cancelFromKeyboard = (event: KeyboardEvent) => {
      if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "PageUp" ||
        event.key === "PageDown" ||
        event.key === "Home" ||
        event.key === "End"
      ) {
        cancelInitialSync(`input:key:${event.key}`);
      }
    };
    el.addEventListener("pointerdown", cancelFromPointer, { passive: true });
    el.addEventListener("wheel", cancelFromPointer, { passive: true });
    el.addEventListener("touchstart", cancelFromPointer, { passive: true });
    window.addEventListener("keydown", cancelFromKeyboard);
    window.addEventListener("pointerdown", recordPointerType, {
      capture: true,
      passive: true,
    });
    window.addEventListener("pointermove", recordPointerType, {
      capture: true,
      passive: true,
    });
    state.setJumpTo((unit: number) => {
      cancelInitialSync(`jump:${unit}`);
      const max = el.scrollWidth - el.clientWidth;
      const offset = clampedOffset(unit);
      el.scrollLeft = offset * max;
      scrollTarget.current = offset;
      scroll.offset = offset;
      progressRef.current = unitProgressForScrollOffset(offset);
      const targetX = cameraXForScrollOffset(offset);
      look.current.set(targetX, -0.08, -0.2);
      const active = Math.min(UNIT_COUNT - 1, Math.max(0, Math.round(unit)));
      const golfFocused = golfFocusedForScenePosition(unit);
      prevActive.current = active;
      prevGolfFocused.current = golfFocused;
      const current = useStacks.getState();
      current.setActiveUnit(active);
      current.setGolfFocused(golfFocused);
    });
    // Damped travel: write the damp target directly (plus scrollLeft so the
    // native element agrees) — never depends on the scroll event.
    state.setTravelTo((unit: number) => {
      cancelInitialSync(`travel:${unit}`);
      const max = el.scrollWidth - el.clientWidth;
      const offset = clampedOffset(unit);
      el.scrollLeft = offset * max;
      scrollTarget.current = offset;
    });
    // Pointer cursor for hoverable scene objects — the scroll el owns events.
    const unsubscribeCursor = useStacks.subscribe((s) => {
      const cursor = cursorForInteraction(s.hovered, s.dragging);
      // Legacy eggs remain pointer claimants while the registry migration is
      // completed; inert scenery keeps the ordinary canvas cursor.
      el.style.cursor =
        cursor ||
        (s.hovered &&
        !s.hovered.startsWith(INERT_HOVER) &&
        (s.hovered.startsWith("egg:") || s.hovered.startsWith("sky:"))
          ? "pointer"
          : "");
    });
    return () => {
      cancelInitialSync("cleanup");
      el.removeEventListener("pointerdown", cancelFromPointer);
      el.removeEventListener("wheel", cancelFromPointer);
      el.removeEventListener("touchstart", cancelFromPointer);
      window.removeEventListener("keydown", cancelFromKeyboard);
      window.removeEventListener("pointerdown", recordPointerType, {
        capture: true,
      });
      window.removeEventListener("pointermove", recordPointerType, {
        capture: true,
      });
      unsubscribeCursor();
      const cleanup = useStacks.getState();
      cleanup.setScrollEl(null);
      cleanup.setJumpTo(null);
      cleanup.setTravelTo(null);
      cleanup.setGolfFocused(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroll.el]);

  useEffect(() => {
    if (!freeRoamEnabled) {
      freeRoamKeys.current.clear();
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock();
      }
      return;
    }

    const canvas = gl.domElement;
    const scrollElement = scroll.el;
    const movementCodes = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyQ",
      "KeyE",
      "ShiftLeft",
      "ShiftRight",
    ]);
    const pointerIsLocked = () => document.pointerLockElement === canvas;
    const persistPose = () => {
      if (!wasFreeRoaming.current) return;
      writeFreeRoamPose(freeRoamStorage, {
        position: [camera.position.x, camera.position.y, camera.position.z],
        rotation: [
          freeRoamEuler.current.x,
          freeRoamEuler.current.y,
          freeRoamEuler.current.z,
        ],
      });
    };
    const clearKeys = () => freeRoamKeys.current.clear();
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || pointerIsLocked()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void canvas.requestPointerLock();
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!pointerIsLocked()) return;
      freeRoamTargetEuler.current.y -=
        event.movementX * FREE_ROAM_LOOK_SENSITIVITY;
      freeRoamTargetEuler.current.x = THREE.MathUtils.clamp(
        freeRoamTargetEuler.current.x -
          event.movementY * FREE_ROAM_LOOK_SENSITIVITY,
        -FREE_ROAM_MAX_PITCH,
        FREE_ROAM_MAX_PITCH,
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!pointerIsLocked() || !movementCodes.has(event.code)) return;
      event.preventDefault();
      freeRoamKeys.current.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!movementCodes.has(event.code)) return;
      freeRoamKeys.current.delete(event.code);
    };
    const onWheel = (event: WheelEvent) => {
      if (!pointerIsLocked()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    scrollElement.addEventListener("pointerdown", onPointerDown, true);
    scrollElement.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false,
    });
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", clearKeys);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    window.addEventListener("pagehide", persistPose);

    return () => {
      scrollElement.removeEventListener("pointerdown", onPointerDown, true);
      scrollElement.removeEventListener("wheel", onWheel, true);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", clearKeys);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      window.removeEventListener("pagehide", persistPose);
      persistPose();
      clearKeys();
      if (pointerIsLocked()) document.exitPointerLock();
    };
  }, [camera, freeRoamEnabled, freeRoamStorage, gl.domElement, scroll.el]);

  useFrame(({ camera, pointer, clock }, delta) => {
    if (freeRoamEnabled) {
      if (!wasFreeRoaming.current) {
        const storedPose = freeRoam.startFromCurrentPose
          ? null
          : readFreeRoamPose(freeRoamStorage);
        if (storedPose) {
          camera.position.fromArray(storedPose.position);
          freeRoamEuler.current.set(...storedPose.rotation, "YXZ");
          camera.rotation.copy(freeRoamEuler.current);
        } else {
          freeRoamEuler.current.setFromQuaternion(camera.quaternion, "YXZ");
        }
        freeRoamTargetEuler.current.copy(freeRoamEuler.current);
        (camera as THREE.PerspectiveCamera).clearViewOffset();
        wasFreeRoaming.current = true;
        freeRoamLastPoseWrite.current = clock.elapsedTime;
      }

      const dt = Math.min(delta, 0.05);
      freeRoamEuler.current.x = THREE.MathUtils.damp(
        freeRoamEuler.current.x,
        freeRoamTargetEuler.current.x,
        FREE_ROAM_LOOK_LAMBDA,
        dt,
      );
      freeRoamEuler.current.y = THREE.MathUtils.damp(
        freeRoamEuler.current.y,
        freeRoamTargetEuler.current.y,
        FREE_ROAM_LOOK_LAMBDA,
        dt,
      );
      camera.rotation.set(
        freeRoamEuler.current.x,
        freeRoamEuler.current.y,
        0,
        "YXZ",
      );
      if (document.pointerLockElement === gl.domElement) {
        const keys = freeRoamKeys.current;
        const forwardAmount =
          Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
        const rightAmount = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
        const verticalAmount =
          Number(keys.has("KeyE")) - Number(keys.has("KeyQ"));
        const speedMultiplier =
          keys.has("ShiftLeft") || keys.has("ShiftRight") ? 1 / 3 : 1;
        freeRoamForward.current
          .set(0, 0, -1)
          .applyQuaternion(camera.quaternion);
        freeRoamRight.current.set(1, 0, 0).applyQuaternion(camera.quaternion);
        freeRoamMove.current
          .set(0, verticalAmount, 0)
          .addScaledVector(freeRoamForward.current, forwardAmount)
          .addScaledVector(freeRoamRight.current, rightAmount);
        if (freeRoamMove.current.lengthSq() > 0) {
          camera.position.addScaledVector(
            freeRoamMove.current.normalize(),
            FREE_ROAM_SPEED * speedMultiplier * dt,
          );
        }
      }
      if (clock.elapsedTime - freeRoamLastPoseWrite.current >= 0.25) {
        freeRoamLastPoseWrite.current = clock.elapsedTime;
        writeFreeRoamPose(freeRoamStorage, {
          position: [camera.position.x, camera.position.y, camera.position.z],
          rotation: [
            freeRoamEuler.current.x,
            freeRoamEuler.current.y,
            freeRoamEuler.current.z,
          ],
        });
      }
      return;
    }
    wasFreeRoaming.current = false;

    // Drei installs its horizontal listener over multiple effects and ignores
    // the first native scroll event. On a narrow/touch viewport its event
    // connection is not observable through the same object identity as on
    // desktop, so waiting on `events.connected === el` deadlocked the initial
    // camera at the left lead-in. Instead, once layout exposes a real range,
    // synchronize the native position, Drei's target, and its damped value
    // for twelve rendered frames. This spans listener installation and the
    // first-run guard without any browser-timer assumptions.
    if (initialAboutPending.current) {
      const urlScenePosition = initialScenePositionFromLocation(
        window.location.pathname,
        window.location.hash,
      );
      if (urlScenePosition > 0) {
        initialAboutPending.current = false;
      } else {
        const el = scroll.el;
        const max = el.scrollWidth - el.clientWidth;
        if (el.isConnected && max > 0) {
          const offset = Math.min(
            1,
            Math.max(0, scrollOffsetForUnit(0, currentAboutShift())),
          );
          el.scrollLeft = offset * max;
          const target = (scroll as unknown as { scroll: { current: number } })
            .scroll;
          target.current = offset;
          scroll.offset = offset;
          progressRef.current = unitProgressForScrollOffset(offset);
          initialAboutFrames.current += 1;
          if (process.env.NODE_ENV === "development") {
            el.dataset.stacksInitialSync = `force:${initialAboutFrames.current}:${Math.round(el.scrollLeft)}:${offset.toFixed(5)}`;
          }
          if (initialAboutFrames.current >= 12) {
            initialAboutPending.current = false;
            if (process.env.NODE_ENV === "development") {
              el.dataset.stacksInitialSync = "done:render-frames";
            }
          }
        }
      }
    }
    // A backgrounded tab hands back one enormous delta on return. All camera
    // damping uses the same cap so resuming cannot snap any one subsystem.
    const dt = delta > 0.05 ? 0.05 : delta;
    const offset = scroll.offset;
    const progress = unitProgressForScrollOffset(offset);
    progressRef.current = progress;
    const targetX = cameraXForScrollOffset(offset);
    const scenePosition = progress * (UNIT_COUNT - 1);
    const composition = cameraCompositionForViewport(
      size.width,
      size.height,
      scenePosition,
    );
    const lookY = captureLookY ?? composition.lookY;
    const cameraY = captureCameraY ?? composition.y;
    const t = clock.elapsedTime;
    const busy = useStacks.getState().panelState !== "closed";
    lean.current = THREE.MathUtils.damp(
      lean.current,
      busy ? 1 : 0,
      LEAN_LAMBDA,
      dt,
    );
    const calm = 1 - lean.current;
    const state = useStacks.getState();
    const travel = cameraTravelState({
      scenePosition,
      previousScenePosition: previousScenePosition.current,
      alternateStop: GOLF_STOP_POSITION,
    });
    const { focusBlockedByTravel } = travel;
    const travelTransition = cameraTravelTransition(
      wasBlockingTravel.current,
      travel,
    );
    if (travelTransition.resetFocus) {
      touchWorldRef.zoomOffset = 0;
      if (state.focusedInteraction) state.setFocusedInteraction(null);
      if (state.hovered) state.setHovered(null);
    }
    wasBlockingTravel.current = travelTransition.blockingTravel;
    const focusSpec = getSceneInteraction(state.focusedInteraction);
    const golfControlFocused = isGolfControlInteraction(
      state.focusedInteraction,
    );
    const focusEnabled = Boolean(
      focusSpec &&
        !golfControlFocused &&
        !state.dragging &&
        !focusBlockedByTravel &&
        !busy &&
        !isSeated(),
    );
    let desiredFocusX = 0;
    let desiredFocusY = 0;
    if (focusEnabled && focusSpec) {
      focusSpec.root.updateWorldMatrix(true, true);
      const authoredBounds = focusSpec.projectedLocalBounds;
      if (authoredBounds) {
        focusCenter.current
          .set(
            (authoredBounds.min[0] + authoredBounds.max[0]) * 0.5,
            (authoredBounds.min[1] + authoredBounds.max[1]) * 0.5,
            (authoredBounds.min[2] + authoredBounds.max[2]) * 0.5,
          )
          .applyMatrix4(focusSpec.root.matrixWorld);
      } else {
        focusBounds.current.setFromObject(focusSpec.root, true);
        if (!focusBounds.current.isEmpty())
          focusBounds.current.getCenter(focusCenter.current);
      }
      if (authoredBounds || !focusBounds.current.isEmpty()) {
        desiredFocusX = THREE.MathUtils.clamp(
          focusCenter.current.x - (targetX + composition.lookXOffset),
          -0.28,
          0.28,
        );
        desiredFocusY = interactionFocusYOffset({
          centerY: focusCenter.current.y,
          baselineLookY: lookY,
          portrait:
            presentationProfileForViewport(size.width, size.height) ===
            "portrait",
        });
      }
    }
    focusAmount.current = THREE.MathUtils.damp(
      focusAmount.current,
      focusEnabled ? 1 : 0,
      8,
      dt,
    );
    focusX.current = THREE.MathUtils.damp(focusX.current, desiredFocusX, 8, dt);
    focusY.current = THREE.MathUtils.damp(focusY.current, desiredFocusY, 8, dt);
    const pillZoom =
      size.width < STACKS_DESKTOP_MIN_WIDTH && state.sheetDismissed ? 0.16 : 0;
    const golfZoom = golfDollyForViewport(size.width, state.golfFocused);
    visitorZoom.current = THREE.MathUtils.damp(
      visitorZoom.current,
      touchWorldRef.zoomOffset + pillZoom + golfZoom,
      8,
      dt,
    );
    const cameraTargetDistance = composition.z - composition.lookZ;
    interactionZoom.current = THREE.MathUtils.damp(
      interactionZoom.current,
      interactionZoomTarget({
        distance: cameraTargetDistance,
        focused: focusEnabled,
        pressed:
          Boolean(state.pressedInteraction) &&
          !isGolfControlInteraction(state.pressedInteraction),
        hovered:
          Boolean(state.hovered) && !isGolfControlInteraction(state.hovered),
        dragging: Boolean(state.dragging),
        traveling: focusBlockedByTravel,
        blocked: busy || isSeated(),
        touchInteraction: touchWorldRef.interactionPointerType === "touch",
      }),
      7,
      dt,
    );

    // The seat. Moving the room always beats sitting in it, so the offset the
    // seat was taken at is the escape hatch for every travel path at once.
    if (isSeated() && !wasSeated.current) seatOffset.current = offset;
    if (
      isSeated() &&
      Math.abs(offset - seatOffset.current) > SEAT_TRAVEL_TOLERANCE
    ) {
      leaveSeat();
    }
    wasSeated.current = isSeated();
    seat.current +=
      ((isSeated() ? 1 : 0) - seat.current) * (1 - Math.exp(-SEAT_RATE * dt));
    if (seat.current < 0.0004) seat.current = 0;
    if (seat.current > 0.9996) seat.current = 1;
    const s = seat.current * seat.current * (3 - 2 * seat.current);
    setSeatAmount(s);

    // Travel pose, integrated whether or not it is the one being rendered —
    // standing up has to land on a live camera, not one frozen where it sat.
    const baselineEyeY =
      captureCameraY === null
        ? cameraY + (pointer.y * 0.08 + Math.sin(t * 0.4) * 0.03) * calm
        : cameraY;
    const baselineLookY =
      lookY +
      golfLookYOffsetForViewport(size.width, state.golfFocused) +
      focusY.current +
      pointer.y * 0.12 * calm;
    const cameraDepthEnabled = cameraDepthEffectEnabled(
      cameraDepthDiagnosticsController.getSnapshot().enabled,
      reducedMotionQuery?.matches ?? false,
      ogCapture,
    );
    const snapCameraDepth =
      previousCameraDepthEnabled.current !== null &&
      previousCameraDepthEnabled.current !== cameraDepthEnabled;
    previousCameraDepthEnabled.current = cameraDepthEnabled;
    baseY.current = snapCameraDepth
      ? baselineEyeY
      : THREE.MathUtils.damp(baseY.current, baselineEyeY, BASE_Y_LAMBDA, dt);
    const cameraZoom = clampCameraZoom(
      0.6 * lean.current + interactionZoom.current + visitorZoom.current,
      cameraTargetDistance,
    );
    const baseZ = composition.z - cameraZoom;
    look.current.x = THREE.MathUtils.damp(
      look.current.x,
      targetX +
        composition.lookXOffset +
        focusX.current +
        pointer.x * 0.45 * calm,
      LOOK_X_LAMBDA,
      dt,
    );
    // The camera POSITION rides the (already-damped) scroll directly while
    // the look target damps again on top, so a fast fling used to open many
    // units of lag between them — the camera yawed ~50° down the row and
    // swept the frustum clean off the original meadow envelope ("I can see
    // behind the grass"). Keep the authored six-unit cap: the camera-side
    // grass apron is now verified against this full tilt, so coverage fixes
    // the corners without flattening the motion.
    look.current.x = THREE.MathUtils.clamp(
      look.current.x,
      targetX - CAMERA_LOOK_X_MAX_LAG,
      targetX + CAMERA_LOOK_X_MAX_LAG,
    );
    look.current.y = snapCameraDepth
      ? baselineLookY
      : THREE.MathUtils.damp(look.current.y, baselineLookY, LOOK_Y_LAMBDA, dt);
    look.current.z = THREE.MathUtils.damp(
      look.current.z,
      composition.lookZ,
      LOOK_Y_LAMBDA,
      dt,
    );

    // Recentre into the EXTRA strip of screen the expanded mobile sheet takes.
    // Peek already equals the projected floor void (PlacardLayer derives it
    // from this exact camera pose), so counting all of peek as occlusion
    // pushed the shelf too high, while counting none planted it too low. The
    // DOM publisher discounts half the natural void: setViewOffset itself
    // shifts by half the published coverage, landing exactly midway between
    // those two measured compositions. Coverage beyond peek remains linear.
    // Aiming the
    // camera down was the old fix and it was wrong twice over: it is a
    // perspective change rather than a framing one, so the shelf keyed and
    // the horizon tilted, and it was a fixed amount while the sheet now has
    // three detents. A frustum offset is the exact answer — same projection,
    // image shifted up by exactly half the covered height.
    const coverage = panelCoverageRef.current;
    framing.current = THREE.MathUtils.damp(
      framing.current,
      coverage,
      FRAMING_LAMBDA,
      dt,
    );
    const persp = camera as THREE.PerspectiveCamera;
    if (framing.current > 0.002) {
      persp.setViewOffset(
        size.width,
        size.height,
        0,
        (size.height * framing.current) / 2,
        size.width,
        size.height,
      );
    } else if (persp.view?.enabled) {
      persp.clearViewOffset();
    }

    // Horizontal framing, focus, Golf, pointer, idle, panel, and carrying
    // corrections establish the baseline first. The authored pose then raises
    // the eye and changes pitch around that finished composition. Keep the
    // baseline look vector separate so toggling the experiment cannot feed its
    // own offset back into the next damped frame.
    const cameraDepth = cameraDepthOffsetsForViewport(
      size.width,
      size.height,
      scenePosition,
      cameraDepthEnabled,
    );
    let authoredEyeY = baseY.current;
    let authoredLookY = look.current.y;
    if (cameraDepth.eyeHeight !== 0 || cameraDepth.pitchRadians !== 0) {
      authoredEyeY += cameraDepth.eyeHeight;
      const horizontalDistance = Math.hypot(
        look.current.x - targetX,
        look.current.z - baseZ,
      );
      const baselinePitch = Math.atan2(
        look.current.y - baseY.current,
        horizontalDistance,
      );
      const authoredPitch = baselinePitch - cameraDepth.pitchRadians;
      authoredLookY =
        authoredEyeY + Math.tan(authoredPitch) * horizontalDistance;
    }
    travelLook.current.set(look.current.x, authoredLookY, look.current.z);

    let seatBlend = 0;
    if (s === 0) {
      camera.position.set(targetX, authoredEyeY, baseZ);
      camera.lookAt(travelLook.current);
    } else {
      // Seated pose keeps a breath and the pointer parallax: a camera that
      // stops dead reads as a still image rather than a place you are in.
      const [ex, ey, ez] = SEAT_POSE.eye;
      const [tx, ty, tz] = SEAT_POSE.target;
      seatPointer.current.x = THREE.MathUtils.damp(
        seatPointer.current.x,
        pointer.x,
        SEAT_POINTER_LAMBDA,
        dt,
      );
      seatPointer.current.y = THREE.MathUtils.damp(
        seatPointer.current.y,
        pointer.y,
        SEAT_POINTER_LAMBDA,
        dt,
      );
      seatEye.current.set(
        ex,
        ey + Math.sin(t * 0.33) * 0.012 + seatPointer.current.y * 0.04,
        ez,
      );
      // You walk over to the chair, then you turn round and sit in it. Those
      // are two motions, and blending straight from the travel pose to the
      // seated pose collapses them into one: a single lerp slides the camera
      // sideways through the room while it spins, which is why this read as
      // "the room turned around me" rather than "I walked over there".
      //
      // `walk` carries the position, `sit` carries the turn and the drop.
      // Squaring the eased walk holds the camera in the open room through the
      // first half, then closes the remaining distance once the view has begun
      // turning toward the vista. This changes the route, not the global
      // exponential clock, so the calm ~2.6 s transition duration is intact.
      const easedWalk = smoothstep(s / WALK_END);
      const walk = easedWalk * easedWalk;
      const turn = smoothstep((s - TURN_START) / (TURN_END - TURN_START));
      const sit = smoothstep((s - SIT_START) / (1 - SIT_START));
      // The horizontal term is NEGATED, and that is not a taste call.
      //
      // The seat yaws the camera ~180°, which swaps which way screen-right
      // points in world space: standing (looking down -Z) screen-right is +X,
      // seated (looking down +Z) it is -X. Adding `pointer.x` to the aim's x
      // in both poses therefore pans the seated view the wrong way — the world
      // slides right when the pointer goes right, instead of the view turning
      // toward it. Vertical is untouched: a yaw cannot invert up.
      seatAim.current.set(
        tx - seatPointer.current.x * 1.1,
        ty + seatPointer.current.y * 0.45,
        tz,
      );
      travelEye.current.set(targetX, authoredEyeY, baseZ);

      // The walk, as a quadratic Bezier rather than a straight line. The
      // chair stands between the camera and the shelf, so a diagonal glide
      // would cut the corner and pass through where the armrest is. Holding
      // the control point near the travel z spends the first half of the
      // move going forward and the second half going across, which is the
      // path a person actually takes.
      const standZ = ez + STAND_BACK;
      ctrl.current.set(
        targetX + (ex - targetX) * 0.15,
        authoredEyeY + APPROACH_LIFT * 0.5,
        baseZ + (standZ - baseZ) * 0.55,
      );
      const iw = 1 - walk;
      const b0 = iw * iw;
      const b1 = 2 * iw * walk;
      const b2 = walk * walk;
      // Gait envelope: zero at both ends, so the camera never bobs while
      // standing at the shelf or while settled in the chair.
      const gait = walk * (1 - walk) * 4;
      walkPos.current.set(
        b0 * targetX + b1 * ctrl.current.x + b2 * ex,
        b0 * authoredEyeY +
          b1 * ctrl.current.y +
          b2 * (authoredEyeY + APPROACH_LIFT) +
          Math.sin(t * GAIT_RATE) * 0.018 * gait,
        b0 * baseZ + b1 * ctrl.current.z + b2 * standZ,
      );
      walkPos.current.x += Math.sin(t * GAIT_RATE * 0.5) * 0.012 * gait;

      camera.position.set(
        walkPos.current.x + (seatEye.current.x - walkPos.current.x) * sit,
        walkPos.current.y + (seatEye.current.y - walkPos.current.y) * sit,
        walkPos.current.z + (seatEye.current.z - walkPos.current.z) * sit,
      );

      // Orientation is slerped, never lerped through the look POINT: the two
      // aim points sit on opposite sides of the camera, so a positional lerp
      // walks the target straight through the eye and the lookAt degenerates
      // mid-turn.
      //
      // Three poses, not two. Facing the seat's final aim for the whole trip
      // would have you walking backwards; facing the direction of travel
      // snaps the view the instant the walk starts. Looking AT the chair you
      // are heading for is what a person does, and it also means the 180°
      // turn happens while you are stationary, where it belongs.
      // Keep the approach gaze on the upper cushion rather than the seat pan;
      // a low aim exaggerated the impression that the camera entered it.
      chairLook.current.set(ex, ey + 0.72, ez - 0.02);
      orient.current.lookAt(travelEye.current, travelLook.current, UP);
      qTravel.current.setFromRotationMatrix(orient.current);
      orient.current.lookAt(camera.position, chairLook.current, UP);
      qWalk.current.setFromRotationMatrix(orient.current);
      orient.current.lookAt(seatEye.current, seatAim.current, UP);
      qSeat.current.setFromRotationMatrix(orient.current);
      // Start turning toward the vista before descending. At the closest
      // lateral pass the couch therefore lives at the edge of the frame,
      // rather than becoming the frame.
      qApproach.current.slerpQuaternions(qWalk.current, qSeat.current, turn);
      qMix.current.slerpQuaternions(qTravel.current, qApproach.current, walk);
      camera.quaternion.slerpQuaternions(qMix.current, qSeat.current, sit);
      seatBlend = sit;
    }
    // Only touched while the seat is in play; at s = 0 it lands back exactly
    // on the pose's own fov, so a resize still wins. Keyed to the SIT phase,
    // not the whole blend: the frame widening while you are still crossing
    // the room reads as the room growing, and the widening is meant to be
    // the moment you settle and the horizon opens up.
    const travelFov = captureFov ?? composition.fov;
    const fov = travelFov + (SEAT_FOV - travelFov) * seatBlend;
    if (
      "fov" in camera &&
      Math.abs((camera as THREE.PerspectiveCamera).fov - fov) > 0.001
    ) {
      (camera as THREE.PerspectiveCamera).fov = fov;
      (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
    }
    cameraTravelDiagnostics.targetX = targetX;
    cameraTravelDiagnostics.lookX = look.current.x;
    cameraTravelDiagnostics.lookLagX = look.current.x - targetX;

    const movement = Math.abs(scenePosition - previousScenePosition.current);
    previousScenePosition.current = scenePosition;
    if (
      movement < 0.000_02 &&
      Math.abs(scenePosition - Math.round(scenePosition)) < 0.01
    ) {
      settledFor.current += dt;
      if (settledFor.current >= 0.12) {
        const settled = Math.round(scenePosition);
        if (useStacks.getState().settledUnit !== settled)
          useStacks.getState().setSettledUnit(settled);
      }
    } else {
      settledFor.current = 0;
      if (useStacks.getState().settledUnit !== null)
        useStacks.getState().setSettledUnit(null);
    }
    const active = Math.min(
      UNIT_COUNT - 1,
      Math.max(0, Math.round(scenePosition)),
    );
    if (active !== prevActive.current) {
      prevActive.current = active;
      useStacks.getState().setActiveUnit(active);
    }
    const golfFocused = golfFocusedForScenePosition(scenePosition);
    if (golfFocused !== prevGolfFocused.current) {
      prevGolfFocused.current = golfFocused;
      useStacks.getState().setGolfFocused(golfFocused);
    }
  });
  return null;
}
