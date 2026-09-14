"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useEffect, useRef } from "react";

import { useDesktopReducedMotion } from "~/lib/desktopMotionPreference";

import { useIntersectionMotion } from "~/components/ui/intersection-motion";

import {
  CARD_MAX_TILT_DEG,
  cardHoverTilt,
  cardInteractionSpring,
  cardPressedScale,
  cardTiltSpring,
  tiltCardHoverEnabled,
} from "./tiltCardMotion";
import { cn } from "@/src/lib/util";

type TiltCardProps = {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  tiltAmplitude?: number;
  hoverScale?: number;
};

export default function TiltCard({
  children,
  className,
  interactive = false,
  tiltAmplitude = CARD_MAX_TILT_DEG,
  hoverScale = 1.025,
}: TiltCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useIntersectionMotion(
    containerRef,
    className?.includes("intersect:") ?? false,
  );
  const systemReduceMotion = useReducedMotion();
  const desktopReduceMotion = useDesktopReducedMotion();
  const reduceMotion = Boolean(systemReduceMotion) || desktopReduceMotion;

  const rotateX = useSpring(useMotionValue(0), cardTiltSpring);
  const rotateY = useSpring(useMotionValue(0), cardTiltSpring);
  const scale = useSpring(1, cardInteractionSpring);

  useEffect(() => {
    if (!reduceMotion) return;
    rotateX.jump(0);
    rotateY.jump(0);
  }, [reduceMotion, rotateX, rotateY]);

  useEffect(() => {
    if (systemReduceMotion) scale.jump(1);
  }, [systemReduceMotion, scale]);

  const supportsHover = () =>
    tiltCardHoverEnabled(
      Boolean(systemReduceMotion),
      typeof window !== "undefined" &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    );

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (
      !interactive ||
      reduceMotion ||
      !supportsHover() ||
      !containerRef.current
    )
      return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    const tilt = cardHoverTilt(
      offsetX,
      offsetY,
      rect.width,
      rect.height,
      tiltAmplitude,
    );
    rotateX.set(tilt.rotateX);
    rotateY.set(tilt.rotateY);
  };

  const handleMouseEnter = () => {
    if (!interactive || !supportsHover()) return;
    scale.set(hoverScale);
  };

  const handleMouseLeave = () => {
    scale.set(1);
    rotateX.set(0);
    rotateY.set(0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || systemReduceMotion || !e.isPrimary || e.button !== 0) {
      return;
    }
    scale.set(cardPressedScale);
  };

  const settleAfterPress = () => {
    if (!interactive || systemReduceMotion) return;
    const stillHovered =
      supportsHover() && containerRef.current?.matches(":hover");
    scale.set(stillHovered ? hoverScale : 1);
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
      // motion gate, so values stay 0/0/1 for the system's reduced-motion
      // preference. The site's gentler mode keeps hover/press scaling.
      className={cn(
        "homepage-card-container",
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
          // Project the whole card as one surface. Sidebar glass deliberately
          // flattens descendants, so parent CSS perspective is unavailable.
          transformPerspective: 800,
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
