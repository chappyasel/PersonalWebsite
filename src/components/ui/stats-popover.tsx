"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

type StatsPopoverProps = {
  /** Trigger contents */
  children: React.ReactNode;
  /** Card body rendered inside the popover */
  content: React.ReactNode;
  /** Fully replaces the default dotted-underline trigger styling */
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  contentClassName?: string;
};

/** Exit-animation duration — Radix stays mounted while the card fades out */
const CLOSE_ANIMATION_MS = 150;

/**
 * Wraps a trigger (year section header or toolbar button): opens on hover
 * (mouse) with a grace period, and on tap/click for touch devices via the
 * regular Popover trigger. Every close path (hover-leave, tap outside, Esc,
 * page scroll) routes through requestClose so the card animates out instead
 * of unmounting instantly (mirrors the Select component's closing dance).
 */
export function StatsPopover({
  children,
  content,
  triggerClassName,
  align = "start",
  side = "bottom",
  sideOffset = 8,
  contentClassName,
}: StatsPopoverProps) {
  const [open, setOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Scroll-close only applies to tap/click opens — a hover-opened popover
  // closes via mouse-leave, and closing it mid-read on scroll is jarring
  const openedByHover = useRef(false);

  const cancelHoverClose = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const openNow = (viaHover: boolean) => {
    cancelHoverClose();
    if (closingTimer.current) {
      clearTimeout(closingTimer.current);
      closingTimer.current = null;
    }
    openedByHover.current = viaHover;
    setIsClosing(false);
    setOpen(true);
  };
  const requestClose = () => {
    if (closingTimer.current) return; // already closing
    setIsClosing(true);
    closingTimer.current = setTimeout(() => {
      closingTimer.current = null;
      // isClosing intentionally stays true through unmount — resetting it
      // here makes the card fade back in for a frame while Radix runs its
      // own exit, reading as a double fade. openNow resets it on reopen.
      setOpen(false);
    }, CLOSE_ANIMATION_MS);
  };
  const scheduleClose = () => {
    cancelHoverClose();
    hoverTimer.current = setTimeout(requestClose, 150);
  };

  // Hide on page scroll (animated), but only for tap/click-opened popovers
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;
  useEffect(() => {
    if (!open) return;
    const onScroll = () => {
      if (!openedByHover.current) requestCloseRef.current();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [open]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => (next ? openNow(false) : requestClose())}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={
            triggerClassName ??
            "cursor-pointer decoration-foreground/30 decoration-dotted underline-offset-8 outline-none hover:underline focus-visible:underline"
          }
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") openNow(true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") scheduleClose();
          }}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        // Chrome lives on the inner motion.div so the whole card can fade out
        className={cn(
          "w-[26rem] max-w-[calc(100vw-1.5rem)] border-0 bg-transparent p-0 shadow-none",
          contentClassName,
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") cancelHoverClose();
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleClose();
        }}
      >
        <motion.div
          animate={
            isClosing
              ? { opacity: 0, scale: 0.95, y: -6 }
              : { opacity: 1, scale: 1, y: 0 }
          }
          transition={{
            duration: CLOSE_ANIMATION_MS / 1000,
            ease: [0.4, 0, 0.2, 1],
          }}
          className="rounded-xl border border-foreground/[0.06] bg-popover p-4 text-popover-foreground shadow-[0px_4px_15px_0px_rgba(0,0,0,0.1)]"
        >
          {content}
        </motion.div>
      </PopoverContent>
    </Popover>
  );
}
