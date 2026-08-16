"use client";

import {
  CheckIcon,
  CircleHalfIcon,
  MoonIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import {
  THEME_LABEL,
  THEME_ORDER,
  type ThemeChoice,
  normalizeTheme,
  oppositeTheme,
} from "~/lib/theme";
import { cn } from "~/lib/utils";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "~/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

const THEME_ICON = {
  system: CircleHalfIcon,
  light: SunIcon,
  dark: MoonIcon,
} satisfies Record<ThemeChoice, typeof SunIcon>;

const LONG_PRESS_MS = 500;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  if (!mounted) {
    return <div className="size-10 rounded-md bg-transparent" />;
  }

  const current = normalizeTheme(theme);
  const visibleTheme = resolvedTheme === "dark" ? "dark" : "light";
  const nextVisibleTheme = oppositeTheme(visibleTheme);
  const VisibleIcon = THEME_ICON[visibleTheme];

  const cancelLongPress = () => {
    if (!longPressTimer.current) return;
    clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };

  const startLongPress = () => {
    cancelLongPress();
    suppressClickUntil.current = 0;
    longPressTimer.current = setTimeout(() => {
      suppressClickUntil.current = Date.now() + 1_000;
      setOptionsOpen(true);
      longPressTimer.current = null;
    }, LONG_PRESS_MS);
  };

  const toggleVisibleTheme = () => {
    if (Date.now() < suppressClickUntil.current) return;
    setTheme(nextVisibleTheme);
  };

  return (
    <TooltipProvider>
      <Popover open={optionsOpen} onOpenChange={setOptionsOpen}>
        <Tooltip delayDuration={200}>
          <PopoverAnchor asChild>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={toggleVisibleTheme}
                onPointerDown={(event) => {
                  if (event.button === 0) startLongPress();
                }}
                onPointerUp={cancelLongPress}
                onPointerCancel={cancelLongPress}
                onPointerLeave={cancelLongPress}
                onContextMenu={(event) => {
                  event.preventDefault();
                  cancelLongPress();
                  suppressClickUntil.current = Date.now() + 1_000;
                  setOptionsOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setOptionsOpen(true);
                  }
                }}
                aria-label={`Switch to ${THEME_LABEL[nextVisibleTheme]} theme. Current preference: ${THEME_LABEL[current]}. Hold for theme options.`}
                aria-haspopup="dialog"
                aria-expanded={optionsOpen}
                className={cn(
                  "flex size-10 items-center justify-center rounded-md bg-transparent text-sm text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  className,
                )}
                data-theme-toggle
              >
                <VisibleIcon className="h-4 w-4" weight="bold" />
              </button>
            </TooltipTrigger>
          </PopoverAnchor>
          <TooltipContent>
            <p className="text-center">
              <span className="block">
                Switch to {THEME_LABEL[nextVisibleTheme]} (⌘⌥L)
              </span>
              <span className="block">Hold for options</span>
            </p>
          </TooltipContent>
        </Tooltip>

        <PopoverContent align="end" className="w-40 p-1">
          <div aria-label="Theme preference" role="radiogroup">
            {THEME_ORDER.map((choice) => {
              const ChoiceIcon = THEME_ICON[choice];
              const selected = choice === current;
              return (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setTheme(choice);
                    setOptionsOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                >
                  <ChoiceIcon className="h-4 w-4" weight="bold" />
                  <span className="flex-1">{THEME_LABEL[choice]}</span>
                  {selected && <CheckIcon className="h-4 w-4" weight="bold" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
