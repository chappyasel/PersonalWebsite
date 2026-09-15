"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { coordinationDitherController } from "./coordinationDitherControl";
import {
  COORDINATION_DITHER_FRAMES,
  coordinationDitherPath,
} from "./coordinationDitherGeometry";

/** Boot renders one path. Only the settled, interactive About shelf opts in. */
export function CoordinationDither({ active = false }: { active?: boolean }) {
  return active ? <LiveDither /> : <StillDither />;
}

function StillDither() {
  return (
    <path
      className="stacks-boot-coordination-dither"
      d={coordinationDitherPath()}
    />
  );
}

function LiveDither() {
  const { effectEnabled } = useSyncExternalStore(
    coordinationDitherController.subscribe,
    coordinationDitherController.getSnapshot,
    coordinationDitherController.getSnapshot,
  );
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setVisible(!document.hidden && !motion.matches);
    update();
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
    };
  }, []);
  if (!effectEnabled || !visible) return <StillDither />;
  return (
    <g data-coordination-dither-animated="">
      {Array.from({ length: COORDINATION_DITHER_FRAMES }, (_, frame) => (
        <path
          key={frame}
          className="stacks-boot-coordination-dither stacks-boot-coordination-dither-frame"
          style={{ animationDelay: `${-frame * 0.2}s` }}
          d={coordinationDitherPath(frame)}
        />
      ))}
    </g>
  );
}
