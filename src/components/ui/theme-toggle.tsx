"use client";

import { CircleHalfIcon, MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import {
  THEME_LABEL,
  nextTheme,
  normalizeTheme,
} from "~/lib/theme";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

/**
 * Three-state cycle rather than a light/dark flip. A two-state toggle can only
 * ever write an explicit "light" or "dark", which permanently opts the visitor
 * out of following their OS appearance — so scheduled/automatic dark mode (most
 * noticeable on phones at sunset) silently stops working after a single tap.
 * "System" has to stay reachable for that to keep working.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-[34px] w-[46px] rounded-md bg-transparent" />;
  }

  const current = normalizeTheme(theme);
  const next = nextTheme(current);

  const Icon =
    current === "system"
      ? CircleHalfIcon
      : current === "dark"
        ? MoonIcon
        : SunIcon;

  const description =
    current === "system"
      ? `System (currently ${resolvedTheme ?? "light"})`
      : `${THEME_LABEL[current]} mode`;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            onClick={() => setTheme(next)}
            aria-label={`Theme: ${description}. Click to switch to ${THEME_LABEL[next]}.`}
            className="flex size-10 items-center justify-center rounded-md bg-transparent text-sm text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground"
          >
            <Icon className="h-4 w-4" weight="bold" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {description} — switch to {THEME_LABEL[next]} (⌘⌥L)
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
