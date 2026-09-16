import {
  ArrowDownIcon,
  ArrowElbowDownLeftIcon,
  ArrowFatUpIcon,
  ArrowLeftIcon,
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CommandIcon,
  ControlIcon,
  OptionIcon,
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
  Command: CommandIcon,
  "⌘": CommandIcon,
  Control: ControlIcon,
  Ctrl: ControlIcon,
  Shift: ArrowFatUpIcon,
  Option: OptionIcon,
  "⌥": OptionIcon,
};

const modifierLabels: Record<string, string> = {
  "⌘": "Command",
  "⌥": "Option",
  "Cmd/Ctrl": "Command or Control",
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
  const commandOrControl = children === "Cmd/Ctrl";
  const iconLabel =
    typeof children === "string"
      ? (modifierLabels[children] ?? children)
      : undefined;
  return (
    <kbd
      className={cn(
        "inline-flex h-[1.05rem] shrink-0 -translate-y-px items-center justify-center rounded-[3px] border p-0 font-serif text-[8px] font-bold leading-none",
        // Keep shortcut hints flat and subdued on both pages and room glass.
        "border-border bg-secondary/80 text-muted-foreground shadow-[0_1px_0_rgb(0_0_0_/_0.06)] dark:border-neutral-600/80 dark:bg-neutral-800 dark:text-neutral-200 dark:shadow-[0_1px_0_rgb(0_0_0_/_0.4)]",
        "[html[data-world]_&]:border-stone-400/65 [html[data-world]_&]:bg-stone-100 [html[data-world]_&]:text-stone-800 [html[data-world]_&]:shadow-[0_1px_0_rgb(0_0_0_/_0.1)]",
        "[html.dark[data-world]_&]:border-neutral-600/80 [html.dark[data-world]_&]:bg-neutral-800 [html.dark[data-world]_&]:text-neutral-200 [html.dark[data-world]_&]:shadow-[0_1px_0_rgb(0_0_0_/_0.3)]",
        width === "key" && !commandOrControl
          ? "w-[1.05rem]"
          : "w-auto min-w-[1.05rem] px-1",
        className,
      )}
      aria-label={Icon || commandOrControl ? iconLabel : undefined}
      {...props}
    >
      {commandOrControl ? (
        <span aria-hidden="true" className="inline-flex items-center gap-0.5">
          <CommandIcon className="size-2.5" weight="bold" />
          <span>/</span>
          <ControlIcon className="size-2.5" weight="bold" />
        </span>
      ) : Icon ? (
        <Icon aria-hidden="true" className="size-2.5" weight="bold" />
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
