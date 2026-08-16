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

// One quick, lightly underdamped spring drives every direct interaction:
// desktop hover/lift and touch or mouse press/release. The higher stiffness
// gives it the immediate response of Apple's controls; the modest overshoot
// keeps the return alive without making a reading card feel rubbery.
const hoverSpringValues: SpringOptions = {
  damping: 22,
  stiffness: 360,
  mass: 0.72,
};

const pressedScale = 0.97;

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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || reduceMotion || !e.isPrimary || e.button !== 0) {
      return;
    }
    scale.set(pressedScale);
    lift.set(0);
  };

  const settleAfterPress = () => {
    const stillHovered =
      supportsHover() && containerRef.current?.matches(":hover");
    scale.set(stillHovered ? hoverScale : 1);
    lift.set(stillHovered ? -2 : 0);
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
      onPointerDown={handlePointerDown}
      onPointerUp={settleAfterPress}
      onPointerCancel={settleAfterPress}
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
      >
        {children}
      </motion.div>
    </div>
  );
}
