"use client";

// The WebGL entry point — the only module that pulls @react-three/* into the
// bundle (loaded via dynamic import from StacksHome). Canvas config carries
// the approved prototype look; ScrollControls owns the real scroll container.
import { PerformanceMonitor, ScrollControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type * as THREE from "three";

import { UNIT_COUNT, type StacksData } from "./data";
import Scene from "./scene/Scene";
import { CAMERA } from "./scene/worldLayout";
import { progressRef, useStacks } from "./store";
import { PALETTES } from "./theme";

// Desktop-only composer chain — dynamic so touch devices never download a
// single postfx byte. Mount/unmount ONLY (never enabled={false}: a mounted-
// disabled composer pins the renderer to NoToneMapping = blown frame).
const Effects = dynamic(() => import("./scene/Effects"), { ssr: false });

let glRef: THREE.WebGLRenderer | null = null;
let devOpenBook: ((id: string) => void) | null = null;

declare global {
  interface Window {
    __stacks?: {
      scrollTo: (unit: number, opts?: { instant?: boolean }) => void;
      openBook: (id: string) => void;
      state: () => Record<string, unknown>;
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
    state() {
      const { activeUnit, mode, modalOpen, panelState } = useStacks.getState();
      return {
        offset: progressRef.current,
        activeUnit,
        mode,
        modalOpen,
        panelState,
        dpr: glRef?.getPixelRatio() ?? null,
        textures: glRef?.info.memory.textures ?? null,
        geometries: glRef?.info.memory.geometries ?? null,
        calls: glRef?.info.render.calls ?? null,
      };
    },
  };
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
}: {
  data: StacksData;
  onReady: () => void;
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

  // Composer path: desktop only, and unmounted at the SAME rung that drops
  // dpr (N8AO × adaptive-dpr is a known-bad pair). ?nopostfx forces the
  // off-path for A/B shots and the ladder's correctness check.
  const postfx =
    !isTouch &&
    degrade === 0 &&
    !(typeof window !== "undefined" &&
      window.location.search.includes("nopostfx"));
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
      <Canvas
        shadows="soft"
        camera={{ position: [0, CAMERA.y, CAMERA.z], fov: CAMERA.fov }}
        dpr={degrade >= 1 ? 1 : isTouch ? [1, 1.25] : [1, 1.5]}
        // Desktop runs SMAA in the composer — MSAA underneath is dead
        // weight. Touch keeps MSAA (no composer there, ever).
        gl={{ antialias: isTouch }}
        onCreated={({ gl }) => {
          gl.toneMappingExposure = dark ? 1.25 : 1.12;
          glRef = gl;
          installDevHooks();
          // Signal readiness only after a frame has actually been painted so
          // the flat→world crossfade never reveals a blank canvas.
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
          enabled={panelState === "closed" && !modalOpen}
          style={{ scrollbarWidth: "none", touchAction: "pan-x" }}
        >
          <Scene
            data={data}
            palette={palette}
            dark={dark}
            coverWidth={isTouch ? 256 : 384}
            dustOff={degrade >= 2}
            shadowsOff={degrade >= 3}
            skySimplify={degrade >= 2}
            onOpenBook={onOpenBook}
            onOpenUrl={onOpenUrl}
          />
        </ScrollControls>
      </Canvas>
    </div>
  );
}
