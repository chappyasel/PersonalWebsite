"use client";

import {
  type SpringOptions,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useRef } from "react";

import { tiltCardHoverEnabled } from "./tiltCardMotion";
import { cn } from "@/src/lib/util";

type TiltCardProps = {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  tiltAmplitude?: number;
  hoverScale?: number;
};

const springValues: SpringOptions = {
  damping: 19,
  stiffness: 92,
  mass: 1.05,
};

// Scale should answer quickly enough to confirm clickability, then settle
// with one restrained overshoot. Keeping it separate from the slower tilt
// spring avoids making the card feel floaty under the pointer.
const hoverSpringValues: SpringOptions = {
  damping: 16,
  stiffness: 220,
  mass: 0.75,
};

export default function TiltCard({
  children,
  className,
  interactive = false,
  tiltAmplitude = 4,
  hoverScale = 1.02,
}: TiltCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, hoverSpringValues);
  const lift = useSpring(0, hoverSpringValues);

  const supportsHover = () =>
    tiltCardHoverEnabled(
      Boolean(reduceMotion),
      typeof window !== "undefined" &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    );

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || !supportsHover() || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -tiltAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * tiltAmplitude);
  };

  const handleMouseEnter = () => {
    if (!interactive || !supportsHover()) return;
    scale.set(hoverScale);
    lift.set(-2);
  };

  const handleMouseLeave = () => {
    scale.set(1);
    lift.set(0);
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div
      ref={containerRef}
      data-tilt-card=""
      data-tilt-card-interactive={interactive ? "" : undefined}
      // These inert 3D declarations stay in the reduced-motion first paint as
      // well. useReducedMotion resolves differently on the server and client;
      // branching the authored attributes on it caused every flat-page card
      // to report a hydration mismatch. The event handlers above are the
      // motion gate, so the values remain exactly 0/0/1 when motion is reduced.
      className={cn(
        "[perspective:800px]",
        interactive && "cursor-pointer",
        className,
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchEnd={handleMouseLeave}
    >
      <motion.div
        data-tilt-motion=""
        className="[transform-style:preserve-3d]"
        style={{
          y: lift,
          rotateX,
          rotateY,
          scale,
          willChange: "transform",
        }}
        whileTap={interactive && !reduceMotion ? { scale: 0.97 } : undefined}
      >
        {children}
      </motion.div>
    </div>
  );
}
