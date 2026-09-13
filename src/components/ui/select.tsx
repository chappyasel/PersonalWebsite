"use client";

import { CaretDownIcon, CaretUpIcon, CheckIcon } from "@phosphor-icons/react";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as React from "react";

import { cn } from "~/lib/utils";

import styles from "./select.module.css";

const EXIT_DURATION = 150;
const openSelects = new Map<string, () => void>();
const SelectContext = React.createContext({
  closing: false,
  reopen: (): void => undefined,
  skipRestoreFocus: { current: false },
});

function Select({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  ...props
}: Omit<
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Root>,
  "onOpenChange"
> & {
  onOpenChange?: (open: boolean) => void;
}) {
  const id = React.useId();
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const [present, setPresent] = React.useState(open);
  const skipRestoreFocus = React.useRef(false);
  const closing = !open && present;

  const changeOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  // A sibling trigger can take over without waiting for this menu's exit.
  React.useLayoutEffect(() => {
    if (!open && !present) return;
    openSelects.set(id, () => {
      skipRestoreFocus.current = true;
      changeOpen(false);
    });
    return () => {
      openSelects.delete(id);
    };
  }, [id, open, present, changeOpen]);

  React.useLayoutEffect(() => {
    if (open) {
      for (const [otherId, dismiss] of openSelects) {
        if (otherId !== id) dismiss();
      }
      skipRestoreFocus.current = false;
      setPresent(true);
      return;
    }
    if (!present) return;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const timer = window.setTimeout(
      () => setPresent(false),
      reducedMotion ? 0 : EXIT_DURATION,
    );
    return () => window.clearTimeout(timer);
  }, [id, open, present]);

  return (
    <SelectContext.Provider
      value={{ closing, skipRestoreFocus, reopen: () => changeOpen(true) }}
    >
      <SelectPrimitive.Root
        {...props}
        open={open || present}
        onOpenChange={changeOpen}
      />
    </SelectContext.Provider>
  );
}

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, style, onKeyDown, onPointerDown, ...props }, ref) => {
  const { closing, reopen } = React.useContext(SelectContext);
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      style={{ pointerEvents: "auto", ...style }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          !event.defaultPrevented &&
          closing &&
          ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)
        ) {
          event.preventDefault();
          reopen();
        }
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (!event.defaultPrevented && closing && event.button === 0) {
          event.preventDefault();
          reopen();
        }
      }}
      className={cn(
        "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors duration-200 ease-in-out hover:bg-accent focus:outline-none focus-visible:border-primary/60 focus-visible:bg-accent disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground [&>span]:line-clamp-1",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <CaretDownIcon className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex shrink-0 cursor-default items-center justify-center py-1",
      className,
    )}
    {...props}
  >
    <CaretUpIcon className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex shrink-0 cursor-default items-center justify-center py-1",
      className,
    )}
    {...props}
  >
    <CaretDownIcon className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(
  (
    {
      className,
      children,
      position = "popper",
      side = "bottom",
      sideOffset = 4,
      collisionPadding = 8,
      onCloseAutoFocus,
      ...props
    },
    ref,
  ) => {
    const { closing, skipRestoreFocus } = React.useContext(SelectContext);
    return (
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          ref={ref}
          position={position}
          side={side}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          data-state={closing ? "closed" : "open"}
          inert={closing || undefined}
          aria-hidden={closing || undefined}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (skipRestoreFocus.current) event.preventDefault();
          }}
          className={cn(
            "relative z-50 max-h-[min(24rem,var(--radix-select-content-available-height,24rem))] min-w-[8rem] origin-[var(--radix-select-content-transform-origin)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
            "duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 motion-reduce:animate-none",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.Viewport
            className={cn(
              "min-h-0 overscroll-contain p-1",
              styles.viewport,
              position === "popper" &&
                "w-full min-w-[var(--radix-select-trigger-width)]",
            )}
          >
            {children}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    );
  },
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("px-2 py-1.5 text-sm font-semibold", className)}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
