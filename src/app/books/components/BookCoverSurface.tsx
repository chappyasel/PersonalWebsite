"use client";

import {
  type MotionStyle,
  type MotionValue,
  motion,
  useTransform,
} from "framer-motion";
import { type ReactNode, useSyncExternalStore } from "react";

import { bookCardVisualEffects } from "~/lib/books/cardVisualEffects";
import {
  bookCoverShadow,
  restingBookCoverShadow,
} from "~/lib/books/coverShadow";

type CoverSurfaceProps = {
  children: ReactNode;
  className?: string;
  style?: MotionStyle;
  motion?: {
    rotateX: MotionValue<number>;
    rotateY: MotionValue<number>;
    scale: MotionValue<number>;
  };
  shadowSize?: MotionValue<number>;
  restingShadow?: string | MotionValue<string>;
};

// Keep Tailwind's keyboard focus rings alongside the animated shadow.
const ringShadow =
  "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), ";

export function BookCoverSurface(props: CoverSurfaceProps) {
  const { coverLiftShadows } = useSyncExternalStore(
    bookCardVisualEffects.subscribe,
    bookCardVisualEffects.getSnapshot,
    bookCardVisualEffects.getServerSnapshot,
  );
  return coverLiftShadows && props.motion ? (
    <AnimatedCoverSurface {...props} motion={props.motion} />
  ) : (
    <motion.div
      className={props.className}
      style={{
        ...props.style,
        boxShadow:
          props.restingShadow ?? `${ringShadow}${restingBookCoverShadow}`,
      }}
    >
      {props.children}
    </motion.div>
  );
}

function AnimatedCoverSurface({
  motion: values,
  shadowSize,
  children,
  className,
  style,
}: CoverSurfaceProps & { motion: NonNullable<CoverSurfaceProps["motion"]> }) {
  const boxShadow = useTransform(
    () =>
      `${ringShadow}${bookCoverShadow(
        values.rotateX.get(),
        values.rotateY.get(),
        values.scale.get(),
        shadowSize?.get() ?? 1,
      )}`,
  );
  return (
    <motion.div className={className} style={{ ...style, boxShadow }}>
      {children}
    </motion.div>
  );
}
