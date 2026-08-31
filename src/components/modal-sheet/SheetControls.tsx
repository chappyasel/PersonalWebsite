"use client";

// The corner cluster every presented document wears: expand to the full page,
// and close. One component so the book note modal, the routine and manual
// sheets, and the weightlifting sheets cannot drift apart again — they had
// three copies of the same two buttons, and the discs read differently on
// every host. The material itself is `.sheet-control` in globals.css, which
// carries the light/dark pair and the data-world upgrade.
import { ArrowsOutSimpleIcon, XIcon } from "@phosphor-icons/react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { cn } from "~/lib/utils";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/** `regular` is the document sheet's 40px disc; `compact` is the small card
 * preview's 32px one. */
export type SheetControlSize = "regular" | "compact";

const BASE =
  "sheet-control pointer-events-auto flex items-center justify-center rounded-full border outline-none transition-[background-color,border-color,transform] duration-200 ease-out active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-0 motion-reduce:transition-none motion-reduce:active:scale-100";

function sizing(size: SheetControlSize) {
  return size === "compact" ? "size-8" : "size-10";
}

function iconSize(size: SheetControlSize) {
  return size === "compact" ? 15 : 18;
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The row the two controls sit in. Callers position it. */
export function SheetControlCluster({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-sheet-cluster
      className={cn("flex items-center gap-2", className)}
    >
      {children}
    </div>
  );
}

/**
 * Expand. A hard `<a>`, never a Link: when the animated takeover is not
 * available (a modified click, reduced motion) the fallback has to be the
 * real full-page load out of the intercepted route.
 */
export function SheetExpandControl({
  href,
  onClick,
  size = "regular",
  label = "Open full page",
}: {
  href: string;
  onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  size?: SheetControlSize;
  label?: string;
}) {
  return (
    <Labelled label={label}>
      <a
        href={href}
        onClick={onClick}
        className={cn(BASE, sizing(size))}
        aria-label={label}
      >
        <ArrowsOutSimpleIcon size={iconSize(size)} weight="bold" />
      </a>
    </Labelled>
  );
}

export function SheetCloseControl({
  onClick,
  size = "regular",
  label = "Close",
}: {
  onClick: () => void;
  size?: SheetControlSize;
  label?: string;
}) {
  return (
    <Labelled label={label}>
      <button
        type="button"
        onClick={onClick}
        className={cn(BASE, sizing(size))}
        aria-label={label}
      >
        <XIcon size={iconSize(size)} weight="bold" />
      </button>
    </Labelled>
  );
}
