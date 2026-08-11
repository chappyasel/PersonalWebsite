"use client";

import {
  type SpringOptions,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/src/lib/util";

type TiltCardProps = {
  children: React.ReactNode;
  className?: string;
  tiltAmplitude?: number;
  hoverScale?: number;
};

const springValues: SpringOptions = {
  damping: 19,
  stiffness: 92,
  mass: 1.05,
};

export default function TiltCard({
  children,
  className,
  tiltAmplitude = 4,
  hoverScale = 1.02,
}: TiltCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchDevice || reduceMotion || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -tiltAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * tiltAmplitude);
  };

  const handleMouseEnter = () => {
    if (!isTouchDevice && !reduceMotion) scale.set(hoverScale);
  };

  const handleMouseLeave = () => {
    if (isTouchDevice) return;
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div
      ref={containerRef}
      // These inert 3D declarations stay in the reduced-motion first paint as
      // well. useReducedMotion resolves differently on the server and client;
      // branching the authored attributes on it caused every flat-page card
      // to report a hydration mismatch. The event handlers above are the
      // motion gate, so the values remain exactly 0/0/1 when motion is reduced.
      className={cn(!isTouchDevice && "[perspective:800px]", className)}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div
        className={cn(!isTouchDevice && "[transform-style:preserve-3d]")}
        style={
          isTouchDevice
            ? undefined
            : { rotateX, rotateY, scale, willChange: "transform" }
        }
        whileTap={isTouchDevice && !reduceMotion ? { scale: 0.97 } : undefined}
      >
        {children}
      </motion.div>
    </div>
  );
}
