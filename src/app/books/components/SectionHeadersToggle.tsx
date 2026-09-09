"use client";

import { RowsIcon, SquaresFourIcon } from "@phosphor-icons/react/dist/ssr";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

type SectionHeadersToggleProps = {
  /** True when the shelf is one seamless grid with no section headers. */
  hidden: boolean;
  onChange: (hidden: boolean) => void;
};

/**
 * Zoom-out companion to the sort control: drops the section headers so every
 * book sits in one grid. Reads best with the color sort, where the headers
 * interrupt the rainbow.
 */
export function SectionHeadersToggle({
  hidden,
  onChange,
}: SectionHeadersToggleProps) {
  const label = hidden ? "Show section headers" : "Hide section headers";
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onChange(!hidden)}
            aria-pressed={hidden}
            aria-label={label}
            className="flex h-9 items-center justify-center rounded-md border border-input bg-background/90 px-3 shadow-sm transition-all duration-200 ease-in-out hover:bg-accent focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {hidden ? (
              <RowsIcon className="h-4 w-4" weight="bold" />
            ) : (
              <SquaresFourIcon className="h-4 w-4" weight="bold" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{hidden ? "Show section headers" : "One seamless grid"}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
