import {
  ArrowDownIcon,
  ArrowElbowDownLeftIcon,
  ArrowLeftIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowRightIcon,
  ArrowUpIcon,
} from "@phosphor-icons/react/dist/ssr";
import { type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "~/lib/utils";

type KeycapProps = ComponentPropsWithoutRef<"kbd"> & {
  width?: "key" | "fit";
};

const keyIcons = {
  ArrowLeft: ArrowLeftIcon,
  ArrowRight: ArrowRightIcon,
  ArrowUp: ArrowUpIcon,
  ArrowDown: ArrowDownIcon,
  PageUp: ArrowLineUpIcon,
  PageDown: ArrowLineDownIcon,
  Enter: ArrowElbowDownLeftIcon,
};

export function Keycap({
  className,
  width = "key",
  children,
  ...props
}: KeycapProps) {
  const Icon =
    typeof children === "string" && Object.hasOwn(keyIcons, children)
      ? keyIcons[children as keyof typeof keyIcons]
      : null;
  return (
    <kbd
      className={cn(
        "inline-flex h-[1.05rem] shrink-0 -translate-y-px items-center justify-center rounded-[3px] border p-0 font-sans text-[8px] font-bold leading-none",
        // Flat pages get a flat cap; the 3D world's root marker upgrades it
        // to the physical key that matches the scene's material language.
        "border-border bg-secondary/80 text-muted-foreground shadow-[0_1px_0_rgb(0_0_0_/_0.06)] dark:shadow-[0_1px_0_rgb(0_0_0_/_0.4)]",
        "[html[data-world]_&]:border-stone-500/55 [html[data-world]_&]:bg-gradient-to-b [html[data-world]_&]:from-stone-50 [html[data-world]_&]:via-stone-100 [html[data-world]_&]:to-stone-300 [html[data-world]_&]:text-stone-900 [html[data-world]_&]:shadow-[0_1.5px_0_#78716c,0_2.5px_3px_rgb(0_0_0_/_0.3),inset_0_1px_0_rgb(255_255_255_/_0.95),inset_0_-1px_0_rgb(120_113_108_/_0.2)]",
        width === "key" ? "w-[1.05rem]" : "w-auto min-w-[1.05rem] px-1",
        className,
      )}
      {...props}
    >
      {Icon ? (
        <Icon
          aria-label={typeof children === "string" ? children : undefined}
          className="size-2.5"
          weight="bold"
        />
      ) : (
        children
      )}
    </kbd>
  );
}

export function KeycapSequence({
  keys,
  label,
  className,
}: {
  keys: readonly ReactNode[];
  label: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {keys.map((key, index) => (
        <Keycap key={index} aria-hidden="true">
          {key}
        </Keycap>
      ))}
    </span>
  );
}
