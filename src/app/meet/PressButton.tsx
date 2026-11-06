"use client";

import {
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import Link from "next/link";
import { type PointerEvent, forwardRef } from "react";

import { cn } from "~/lib/utils";

import { Button, buttonVariants } from "~/components/ui/button";

import { tick } from "./haptics";
import styles from "./meet.module.css";

const Pressable = motion.create(Button);
const PressableLink = motion.create(Link);

/** A pressed button's grow and its settle back: unhurried, with a soft
 * bounce rather than a jump. */
const PRESS = { type: "spring" as const, duration: 0.55, bounce: 0.22 };
/** How far a hovered button tips toward the pointer, in degrees. */
const TILT = 4;
const TIP = { stiffness: 260, damping: 22 };

/**
 * The press's motion, shared by the button and the link: a hovered one
 * rises a touch and tips toward the pointer; a pressed one grows on a
 * spring and ticks the phone's haptics.
 */
function usePress<E extends Element>({
  onPointerMove,
  onPointerLeave,
}: {
  onPointerMove?: (e: PointerEvent<E>) => void;
  onPointerLeave?: (e: PointerEvent<E>) => void;
}) {
  const reducedMotion = useReducedMotion();
  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);
  const rotateX: MotionValue<number> = useSpring(tipX, TIP);
  const rotateY: MotionValue<number> = useSpring(tipY, TIP);
  return {
    tilt: { rotateX, rotateY, transformPerspective: 500 },
    onPointerMove: (e: PointerEvent<E>) => {
      onPointerMove?.(e);
      if (reducedMotion || e.pointerType !== "mouse") return;
      const r = e.currentTarget.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      tipX.set(-ny * TILT);
      tipY.set(nx * TILT * 0.5);
    },
    onPointerLeave: (e: PointerEvent<E>) => {
      onPointerLeave?.(e);
      tipX.set(0);
      tipY.set(0);
    },
    whileHover: reducedMotion ? undefined : { scale: 1.025 },
    whileTap: reducedMotion ? undefined : { scale: 1.06 },
    transition: PRESS,
    onTapStart: () => tick(),
  };
}

type Props = Omit<
  React.ComponentProps<typeof Pressable>,
  "whileTap" | "whileHover" | "transition" | "onTapStart"
> & {
  /** Grey, not blue: for a second choice, such as "Book another time". */
  quiet?: boolean;
};

/**
 * /meet's blue button, as the Book button is. Hovered, it rises a touch on
 * a shadow and tips toward the pointer, and its blue brightens with a
 * shimmer across it (CSS). Pressed, it's picked up as a dragged meeting
 * is, grown on a spring over a shadow all round it, and ticks the phone's
 * haptics.
 */
export const PressButton = forwardRef<HTMLButtonElement, Props>(
  function PressButton(
    { className, children, quiet, style, onPointerMove, onPointerLeave, ...props },
    ref,
  ) {
    const { tilt, ...press } = usePress<HTMLButtonElement>({
      onPointerMove,
      onPointerLeave,
    });
    return (
      <Pressable
        ref={ref}
        {...props}
        {...press}
        style={{ ...style, ...tilt }}
        className={cn(
          quiet ? styles.quiet : styles.primary,
          "relative",
          className,
        )}
      >
        <span className="relative">{children as React.ReactNode}</span>
      </Pressable>
    );
  },
);

/**
 * PressButton as a link, for a way on rather than an action: "See open
 * times", "chappyasel.com". A `plain` one is an ordinary <a>, for a page
 * that must load afresh (the calendar asked again) or a mailto.
 */
export function PressLink({
  href,
  plain,
  quiet,
  className,
  children,
}: {
  href: string;
  plain?: boolean;
  quiet?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const { tilt, ...press } = usePress<HTMLAnchorElement>({});
  const Comp = plain ? motion.a : PressableLink;
  return (
    <Comp
      href={href}
      draggable={false}
      {...press}
      style={tilt}
      className={cn(
        buttonVariants(),
        quiet ? styles.quiet : styles.primary,
        "relative",
        className,
      )}
    >
      <span className="relative">{children}</span>
    </Comp>
  );
}
