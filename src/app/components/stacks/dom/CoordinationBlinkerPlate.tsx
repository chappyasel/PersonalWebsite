"use client";

import { blinkerPlate } from "../scene/coordinationBlinkerPlate";
import type { CrossingTheme } from "../scene/coordinationCrossing";
import { useEffect, useRef } from "react";

import { HdrFill, useHdrBlinker } from "./HdrFill";

/** One HDR plate over the WebGL blinker, written by the frame loop. The glow
 * stays in the shader: only the solid block is video. */
export function CoordinationBlinkerPlate({ theme }: { theme: CrossingTheme }) {
  const hdr = useHdrBlinker();
  const plate = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = plate.current;
    return element ? blinkerPlate.attach(element) : undefined;
  }, [hdr]);

  return hdr ? (
    <div ref={plate} className="coordination-hdr-plate" aria-hidden>
      <HdrFill theme={theme} />
    </div>
  ) : null;
}
