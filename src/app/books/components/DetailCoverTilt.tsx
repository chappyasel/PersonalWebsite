"use client";

import { type MotionValue, useReducedMotion, useSpring } from "framer-motion";
import { type ReactNode, useEffect, useSyncExternalStore } from "react";

import { bookCardVisualEffects } from "~/lib/books/cardVisualEffects";
import {
  bookHoverScale,
  bookHoverSpring,
  bookTiltAmplitude,
} from "~/lib/books/coverMotion";
import { useDesktopReducedMotion } from "~/lib/desktopMotionPreference";
import { useTapFirstCapability } from "~/lib/useTapFirstCapability";

import { BookCoverSurface } from "./BookCoverSurface";

type DetailCoverProps = {
  children: ReactNode;
  borderRadius: MotionValue<string>;
  shadowSize: MotionValue<number>;
  restingShadow: MotionValue<string>;
};

export function DetailCoverTilt(props: DetailCoverProps) {
  const { detailCoverTilt } = useSyncExternalStore(
    bookCardVisualEffects.subscribe,
    bookCardVisualEffects.getSnapshot,
    bookCardVisualEffects.getServerSnapshot,
  );

  return detailCoverTilt ? (
    <AnimatedDetailCover {...props} />
  ) : (
    <BookCoverSurface
      className="h-full"
      style={{ borderRadius: props.borderRadius }}
      restingShadow={props.restingShadow}
    >
      {props.children}
    </BookCoverSurface>
  );
}

function AnimatedDetailCover({
  children,
  borderRadius,
  shadowSize,
  restingShadow,
}: DetailCoverProps) {
  const systemReduceMotion = useReducedMotion();
  const desktopReduceMotion = useDesktopReducedMotion();
  const tapFirst = useTapFirstCapability();
  const disabled =
    Boolean(systemReduceMotion) || desktopReduceMotion || tapFirst;
  const rotateX = useSpring(0, bookHoverSpring);
  const rotateY = useSpring(0, bookHoverSpring);
  const scale = useSpring(1, bookHoverSpring);

  useEffect(() => {
    if (!disabled) return;
    rotateX.jump(0);
    rotateY.jump(0);
    scale.jump(1);
  }, [disabled, rotateX, rotateY, scale]);

  return (
    <div
      className="h-full [perspective:1000px]"
      onMouseEnter={() => {
        if (!disabled) scale.set(bookHoverScale.M);
      }}
      onMouseMove={(event) => {
        if (disabled) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x =
          (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        const y =
          (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
        rotateX.set(-y * bookTiltAmplitude.M);
        rotateY.set(x * bookTiltAmplitude.M);
      }}
      onMouseLeave={() => {
        scale.set(1);
        rotateX.set(0);
        rotateY.set(0);
      }}
    >
      <BookCoverSurface
        className="h-full [transform-style:preserve-3d]"
        style={{ rotateX, rotateY, scale, borderRadius }}
        motion={disabled ? undefined : { rotateX, rotateY, scale }}
        shadowSize={shadowSize}
        restingShadow={restingShadow}
      >
        {children}
      </BookCoverSurface>
    </div>
  );
}
