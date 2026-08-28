"use client";

import { useCallback, useEffect, useRef } from "react";

import type { FireworksEngine } from "./fireworksEngine";

/**
 * The tap target and canvases for the bridge's fireworks; the firing script
 * itself (fireworksEngine.ts — the dome shader's own, ported) loads on the
 * first click. The canvases ride at z -1 inside the sky's stacking context,
 * so every shell bursts BEHIND the bridge, the buildings, and the hills —
 * depth is paint order, the shader block's own opening lesson.
 */
export default function GgbFireworks() {
  const layerRef = useRef<HTMLDivElement>(null);
  const bloomRef = useRef<HTMLCanvasElement>(null);
  const coreRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<FireworksEngine | null>(null);
  const loading = useRef(false);
  const pending = useRef(0);

  const fire = useCallback(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (engine.current) {
      engine.current.fire();
      return;
    }
    pending.current += 1;
    if (loading.current) return;
    loading.current = true;
    void import("./fireworksEngine").then((m) => {
      const layer = layerRef.current;
      const bloom = bloomRef.current;
      const core = coreRef.current;
      if (!layer || !bloom || !core) return;
      engine.current = m.createFireworksEngine(layer, bloom, core);
      // The clicks that landed while the module was in flight all fire.
      const queued = Math.min(pending.current, 4);
      pending.current = 0;
      for (let i = 0; i < queued; i++) engine.current.fire();
    });
  }, []);

  useEffect(() => {
    return () => engine.current?.dispose();
  }, []);

  return (
    <>
      <div ref={layerRef} className="dl-fw-layer" aria-hidden>
        <canvas ref={bloomRef} className="dl-fw-bloom" />
        <canvas ref={coreRef} className="dl-fw-core" />
      </div>
      {/* The sky is aria-hidden decoration, so the tap target stays out of
          the tab order — a hidden handshake, not a control. */}
      <button
        type="button"
        className="dl-ggb-tap"
        aria-label="Fireworks over the Golden Gate"
        tabIndex={-1}
        onClick={fire}
      />
    </>
  );
}
