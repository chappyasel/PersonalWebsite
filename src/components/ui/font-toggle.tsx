"use client";

import { TextAaIcon } from "@phosphor-icons/react";

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
import { type FontOption, useFont } from "~/lib/font-provider";

const fontOptions: { value: FontOption; label: string; className: string }[] = [
  { value: "georgia", label: "Georgia", className: "font-georgia" },
  { value: "system", label: "System", className: "font-system" },
  { value: "literata", label: "Literata", className: "font-literata" },
];

export function FontToggle() {
  const { font, setFont, mounted } = useFont();

  if (!mounted) {
    return <div className="h-[34px] w-[46px] rounded-md bg-transparent" />;
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
              className="flex size-10 items-center justify-center rounded-md border-none bg-transparent p-0 text-sm text-muted-foreground shadow-none transition-all hover:bg-secondary/80 hover:text-foreground [&>svg:last-child]:hidden"
              aria-label="Select font"
            >
              <TextAaIcon className="h-4 w-4" weight="bold" />
            </SelectTrigger>
          </TooltipTrigger>
          <SelectContent>
            {fontOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                className={option.className}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <TooltipContent>
          <p>Change font</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
