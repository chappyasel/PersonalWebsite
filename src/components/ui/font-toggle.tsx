"use client";

import { TextAaIcon } from "@phosphor-icons/react";

import { type FontOption, useFont } from "~/lib/font-provider";
import { cn } from "~/lib/utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "~/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const fontOptions: { value: FontOption; label: string; className: string }[] = [
  { value: "georgia", label: "Georgia", className: "font-georgia" },
  { value: "system", label: "System", className: "font-system" },
  { value: "literata", label: "Literata", className: "font-literata" },
];

export function FontToggle({ className }: { className?: string }) {
  const { font, setFont, mounted } = useFont();

  if (!mounted) {
    return (
      <div className={cn("size-10 rounded-md bg-transparent", className)} />
    );
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <Select
          value={font}
          onValueChange={(value) => setFont(value as FontOption)}
        >
          <TooltipTrigger asChild>
            <SelectTrigger
              className={cn(
                "flex size-10 items-center justify-center rounded-md border-none bg-transparent p-0 text-sm text-muted-foreground shadow-none transition-all hover:bg-secondary/80 hover:text-foreground [&>svg:last-child]:hidden",
                className,
              )}
              aria-label="Select book font"
            >
              <TextAaIcon aria-hidden className="h-4 w-4" weight="bold" />
            </SelectTrigger>
          </TooltipTrigger>
          <SelectContent>
            {fontOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className={option.className}
                indicatorWeight="bold"
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TooltipContent>
          <p>Change book font</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
