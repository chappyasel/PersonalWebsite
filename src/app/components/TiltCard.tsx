"use client";

import {
  type SpringOptions,
  motion,
  useMotionValue,
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
  damping: 25,
  stiffness: 120,
  mass: 1,
};

export default function TiltCard({
  children,
  className,
  tiltAmplitude = 4,
  hoverScale = 1.03,
}: TiltCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }, []);

  const rotateX = useSpring(useMotionValue(0), springValues);
  const rotateY = useSpring(useMotionValue(0), springValues);
  const scale = useSpring(1, springValues);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isTouchDevice || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -tiltAmplitude);
    rotateY.set((offsetX / (rect.width / 2)) * tiltAmplitude);
  };

  const handleMouseEnter = () => {
    if (!isTouchDevice) scale.set(hoverScale);
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
        whileTap={isTouchDevice ? { scale: 0.97 } : undefined}
      >
        {children}
      </motion.div>
    </div>
  );
}
