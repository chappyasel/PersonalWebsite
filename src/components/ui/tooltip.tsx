"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { useTapFirstCapability } from "~/lib/useTapFirstCapability";
import { cn } from "~/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

type TooltipContextValue = {
  allowTapFirst: boolean;
  enabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
};

const TouchTooltipContext = React.createContext<TooltipContextValue | null>(
  null,
);

type TooltipProps = React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Root
> & {
  /** Reserve this for content whose interaction is deliberately tap-based,
   * such as dense data inspection. Hover/focus hints stay absent tap-first. */
  allowTapFirst?: boolean;
};

function Tooltip({
  allowTapFirst = false,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  ...props
}: TooltipProps) {
  const tapFirst = useTapFirstCapability();
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const requestedOpen = controlledOpen ?? internalOpen;
  const enabled = !tapFirst || allowTapFirst;
  const open = enabled && requestedOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!enabled && next) return;
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, enabled, onOpenChange],
  );
  React.useEffect(() => {
    if (enabled || !requestedOpen) return;
    if (controlledOpen === undefined) setInternalOpen(false);
    onOpenChange?.(false);
  }, [controlledOpen, enabled, onOpenChange, requestedOpen]);
  const context = React.useMemo(
    () => ({ allowTapFirst, enabled, open, setOpen }),
    [allowTapFirst, enabled, open, setOpen],
  );
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
        if (
          !event.defaultPrevented &&
          event.pointerType === "touch" &&
          touchTooltip?.allowTapFirst
        )
          touchTooltip?.setOpen(!touchTooltip.open);
      }}
    />
  );
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

// Material (flat card vs. world glass, including the glass blur) lives on
// .field-notes-glass-tooltip in globals.css, switched by html[data-world].
export const tooltipSurfaceClassName =
  "field-notes-glass-tooltip rounded-md border px-3 py-1.5 font-serif text-xs";

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const tooltip = React.useContext(TouchTooltipContext);
  if (tooltip && !tooltip.enabled) return null;
  return (
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
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
