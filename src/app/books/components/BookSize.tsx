"use client";

import { useQueryState } from "nuqs";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const sizes = ["S", "M", "L"] as const;

export function BookSize() {
  const [sizeParam, setSize] = useQueryState("size");
  const size = sizeParam ?? "M";

  const cycleSize = () => {
    const currentIndex = sizes.indexOf(size as (typeof sizes)[number]);
    const nextIndex = (currentIndex + 1) % sizes.length;
    void setSize(sizes[nextIndex] as string);
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            onClick={cycleSize}
            aria-label={`Book size: ${size}. Click to cycle size.`}
            className="hidden size-10 items-center justify-center rounded-md bg-transparent text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground md:flex"
          >
            {size}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Change book size</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
