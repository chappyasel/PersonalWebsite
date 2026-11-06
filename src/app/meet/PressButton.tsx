"use client";

import { motion, useReducedMotion } from "framer-motion";
import { forwardRef, useState } from "react";

import { cn } from "~/lib/utils";

import { Button } from "~/components/ui/button";

import { HdrPlate } from "./HdrPlate";
import { tick } from "./haptics";
import styles from "./meet.module.css";

const Pressable = motion.create(Button);

/** A pressed button's grow and its settle back: unhurried, with a soft
 * bounce rather than a jump. */
const PRESS = { type: "spring" as const, duration: 0.55, bounce: 0.22 };

type Props = Omit<
  React.ComponentProps<typeof Pressable>,
  "whileTap" | "transition" | "onTapStart" | "onTap" | "onTapCancel"
>;

/**
 * /meet's blue button, as the Book button is: pressed, it grows on a
 * spring, ticks the phone's haptics, and its blue goes brighter than white
 * on an HDR screen, as iOS's own buttons light up under a finger.
 */
export const PressButton = forwardRef<HTMLButtonElement, Props>(
  function PressButton({ className, children, ...props }, ref) {
    const reducedMotion = useReducedMotion();
    const [pressed, setPressed] = useState(false);
    return (
      <Pressable
        ref={ref}
        {...props}
        className={cn(styles.primary, "relative", className)}
        data-pressed={pressed || undefined}
        whileTap={reducedMotion ? undefined : { scale: 1.04 }}
        transition={PRESS}
        onTapStart={() => {
          setPressed(true);
          tick();
        }}
        onTap={() => setPressed(false)}
        onTapCancel={() => setPressed(false)}
      >
        <HdrPlate className={styles.pressPlate} />
        <span className="relative">{children as React.ReactNode}</span>
      </Pressable>
    );
  },
);
