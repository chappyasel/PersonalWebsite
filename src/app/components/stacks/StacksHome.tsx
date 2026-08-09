"use client";

// Composition root and mode gate for The Stacks. Server render and the first
// client render are always the flat page (no hydration mismatch); an effect
// probes reduced-motion + WebGL and upgrades to the 3D world with a short
// crossfade once the canvas has painted its first frame.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { type StacksData, type StacksSlots } from "./data";
import ChromeLayer from "./dom/ChromeLayer";
import PlacardLayer from "./dom/PlacardLayer";
import UnitRail from "./dom/UnitRail";
import FlatHome from "./FlatHome";
import ScrollBridges from "./input/ScrollBridges";
import StacksBookModal from "./modal/StacksBookModal";
import { useStacks } from "./store";

const StacksCanvas = dynamic(() => import("./StacksCanvas"), { ssr: false });

export default function StacksHome({
  data,
  slots,
}: {
  data: StacksData;
  slots: StacksSlots;
}) {
  const mode = useStacks((s) => s.mode);
  const setMode = useStacks((s) => s.setMode);
  const [worldReady, setWorldReady] = useState(false);
  const [flatGone, setFlatGone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") ?? probe.getContext("webgl");
      if (!gl) return;
    } catch {
      return;
    }
    setMode("world");
  }, [setMode]);

  // If the canvas never reports ready (chunk load failure, context loss on
  // init), fall back to the flat page rather than a dead viewport.
  useEffect(() => {
    if (mode !== "world" || worldReady) return;
    const timeout = setTimeout(() => setMode("flat"), 12000);
    return () => clearTimeout(timeout);
  }, [mode, worldReady, setMode]);

  useEffect(() => {
    if (!worldReady) return;
    const timeout = setTimeout(() => setFlatGone(true), 350);
    return () => clearTimeout(timeout);
  }, [worldReady]);

  return (
    <>
      {mode === "world" && (
        <div
          className={`fixed inset-0 z-10 transition-opacity duration-300 ${
            worldReady ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <StacksCanvas data={data} onReady={() => setWorldReady(true)} />
          <ChromeLayer data={data} />
          <PlacardLayer data={data} slots={slots} />
          <UnitRail />
          <ScrollBridges />
        </div>
      )}
      {(mode === "flat" || !flatGone) && <FlatHome slots={slots} />}
      {/* Books modal — mounted at the root, outside GrainientBackground's
          [contain:paint] and the world's transforms, so fixed positioning
          resolves to the viewport. */}
      <StacksBookModal />
    </>
  );
}
