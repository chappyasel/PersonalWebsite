"use client";

// The WebGL entry point — the only module that pulls @react-three/* into the
// bundle (loaded via dynamic import from StacksHome). Canvas config carries
// the approved prototype look; ScrollControls owns the real scroll container.
import {
  PerformanceMonitor,
  ScrollControls,
  useProgress,
  useScroll,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";

import { type StacksData, UNIT_COUNT } from "./data";
import { setLoadProgress } from "./loading";
import Scene from "./scene/Scene";
import {
  getSeatAmount,
  isSeated,
  leaveSeat,
  requestSeat,
} from "./scene/seated";
import { CAMERA } from "./scene/worldLayout";
import { progressRef, useStacks } from "./store";
import { PALETTES } from "./theme";

// Desktop-only composer chain — dynamic so touch devices never download a
// single postfx byte. Mount/unmount ONLY (never enabled={false}: a mounted-
// disabled composer pins the renderer to NoToneMapping = blown frame).
const Effects = dynamic(() => import("./scene/Effects"), { ssr: false });

/** Render at Retina density where the device allows it. Native 3x on a phone
 * costs nine framebuffer pixels per CSS pixel, so 2x is the quality ceiling;
 * it is visually Retina without quadrupling the old 1.5x workload. A
 * sustained decline settles at 1.5x rather than the old 1x floor—the latter
 * was visibly one-third-resolution on an iPhone and made every shelf edge and
 * cover texture look pixelated. */
const RENDER_DPR_RANGE: [number, number] = [1, 2];
const FALLBACK_DPR_RANGE: [number, number] = [1, 1.5];

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
      openBook: (id: string) => void;
      sit: (on?: boolean) => void;
      state: () => Record<string, unknown>;
      node: (name: string) => Record<string, unknown> | null;
      bbox: (name: string) => Record<string, unknown> | null;
      /** Registered by Meadow in dev: live wind/density knobs.
       * No-arg call returns the current values. */
      meadow?: (opts?: {
        wind?: number;
        speed?: number;
        density?: number | null;
      }) => Record<string, number | null>;
    };
  }
}

function installDevHooks() {
  if (process.env.NODE_ENV === "production") return;
  window.__stacks = {
    scrollTo(unit, opts) {
      const { jumpTo, travelTo } = useStacks.getState();
      if (opts?.instant) jumpTo?.(unit);
      else travelTo?.(unit);
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
      const { activeUnit, mode, modalOpen, panelState, hovered, dragging } =
        useStacks.getState();
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
      };
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
  // Travel freezes while the mobile panel or the book modal owns the screen.
  const panelState = useStacks((s) => s.panelState);
  const modalOpen = useStacks((s) => s.modalOpen);
  const isTouch = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches,
    [],
  );

  // One-way degrade ladder: sustained low fps steps dpr → dust → shadows.
  // Never steps back up — flip-flopping reads worse than a stable floor.
  const [degrade, setDegrade] = useState(0);
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
      if (process.env.NODE_ENV !== "production") delete window.__stacks;
    },
    [],
  );

  // Composer path: desktop only, and unmounted at the SAME rung that drops
  // dpr (N8AO × adaptive-dpr is a known-bad pair). ?nopostfx forces the
  // off-path for A/B shots and the ladder's correctness check.
  const postfx =
    !isTouch &&
    degrade === 0 &&
    !(
      typeof window !== "undefined" &&
      window.location.search.includes("nopostfx")
    );
  const setPostfx = useStacks((s) => s.setPostfx);
  useEffect(() => {
    setPostfx(postfx);
  }, [postfx, setPostfx]);

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
    <div className="absolute inset-0">
      <LoadReporter />
      <Canvas
        shadows="soft"
        camera={{ position: [0, CAMERA.y, CAMERA.z], fov: CAMERA.fov }}
        dpr={degrade >= 1 ? FALLBACK_DPR_RANGE : RENDER_DPR_RANGE}
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
        {postfx && <Effects dark={dark} />}
        <PerformanceMonitor
          onDecline={() => setDegrade((d) => Math.min(3, d + 1))}
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
            dustOff={degrade >= 2}
            shadowsOff={degrade >= 3}
            skySimplify={degrade >= 2}
            degrade={degrade}
            onOpenBook={onOpenBook}
            onOpenUrl={onOpenUrl}
          />
        </ScrollControls>
      </Canvas>
    </div>
  );
}
