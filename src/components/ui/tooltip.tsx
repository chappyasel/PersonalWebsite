"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { cn } from "~/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

type TooltipContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const TouchTooltipContext = React.createContext<TooltipContextValue | null>(
  null,
);

/** Radix tooltips intentionally target hover/focus. The site also uses them
 * for dense visual data inside a touch-only mobile sheet, so give every root
 * a controlled tap path while retaining Radix's normal desktop behavior. */
function Tooltip({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const context = React.useMemo(() => ({ open, setOpen }), [open, setOpen]);
  return (
    <TouchTooltipContext.Provider value={context}>
      <TooltipPrimitive.Root {...props} open={open} onOpenChange={setOpen} />
    </TouchTooltipContext.Provider>
  );
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ onPointerUp, ...props }, ref) => {
  const touchTooltip = React.useContext(TouchTooltipContext);
  return (
    <TooltipPrimitive.Trigger
      ref={ref}
      {...props}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        if (!event.defaultPrevented && event.pointerType === "touch")
          touchTooltip?.setOpen(!touchTooltip.open);
      }}
    />
  );
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

export const tooltipSurfaceClassName =
  "rounded-md border border-border bg-background/80 px-3 py-1.5 font-serif text-xs text-foreground shadow-md backdrop-blur-md";

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        `z-[100] origin-[--radix-tooltip-content-transform-origin] overflow-hidden ${tooltipSurfaceClassName} animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2`,
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
