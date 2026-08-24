import { type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "~/lib/utils";

type KeycapProps = ComponentPropsWithoutRef<"kbd"> & {
  width?: "key" | "fit";
};

export function Keycap({ className, width = "key", ...props }: KeycapProps) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[1.05rem] shrink-0 -translate-y-px items-center justify-center rounded-[3px] border border-stone-500/55 bg-gradient-to-b from-stone-50 via-stone-100 to-stone-300 p-0 font-sans text-[8px] font-bold leading-none text-stone-900 shadow-[0_1.5px_0_#78716c,0_2.5px_3px_rgb(0_0_0_/_0.3),inset_0_1px_0_rgb(255_255_255_/_0.95),inset_0_-1px_0_rgb(120_113_108_/_0.2)]",
        width === "key" ? "w-[1.05rem]" : "w-auto min-w-[1.05rem] px-1",
        className,
      )}
      {...props}
    />
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
