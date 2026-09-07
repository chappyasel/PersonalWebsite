"use client";

import { CaretRightIcon } from "@phosphor-icons/react";
import { type Transition, motion, useReducedMotion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "~/lib/util";

/**
 * The site's one disclosure vocabulary, lifted from the book notes: a bold
 * caret that turns down, and a height-plus-opacity reveal on an eased 240
 * ms curve. Notion toggles, the routine timeline, and the collapsible routine
 * sections all draw from here, so a dropdown reads the same on every page.
 */

export const DISCLOSURE_TRANSITION: Transition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1],
};

type DisclosureCaretProps = Omit<
  ComponentPropsWithoutRef<typeof CaretRightIcon>,
  "size" | "weight"
> & {
  open: boolean;
  size?: number;
};

/**
 * `className` places the wrapper (ml-auto, justify-self-center, a colour);
 * every other prop lands on the glyph itself, so caller data attributes still
 * reach the visible caret.
 */
export function DisclosureCaret({
  open,
  size = 14,
  className,
  ...iconProps
}: DisclosureCaretProps) {
  return (
    // One line tall, so the glyph centres on the first line of a wrapping
    // title in an items-start row and on the row itself in an items-center one.
    <span
      aria-hidden="true"
      className={cn(
        "flex h-[1lh] shrink-0 items-center text-muted-foreground/80 transition-colors hover:text-foreground",
        className,
      )}
    >
      <CaretRightIcon
        size={size}
        weight="bold"
        {...iconProps}
        className={cn(
          "overflow-visible transition-transform duration-200",
          open && "rotate-90",
        )}
      />
    </span>
  );
}

/**
 * The revealed body. It stays mounted while closed (height 0, inert, hidden
 * from assistive tech) so the server renders the text and the open animation
 * has real content to measure.
 */
export function DisclosurePanel({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      id={id}
      aria-hidden={!open}
      inert={!open}
      initial={false}
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      transition={
        prefersReducedMotion ? { duration: 0 } : DISCLOSURE_TRANSITION
      }
      className={cn("overflow-hidden", className)}
    >
      {children}
    </motion.div>
  );
}
