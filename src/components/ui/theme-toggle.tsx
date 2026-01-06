"use client";

import { MoonIcon, MoonStarsIcon, SunIcon, SunDimIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-[34px] w-[46px] rounded-md bg-transparent" />
    );
  }

  const cycleTheme = () => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  };

  const getIcon = () => {
    // Explicit theme selections
    if (theme === "dark") {
      return <MoonIcon className="h-4 w-4" weight="bold" />;
    } else if (theme === "light") {
      return <SunIcon className="h-4 w-4" weight="bold" />;
    }

    // System mode - show variant based on actual resolved theme
    if (theme === "system") {
      if (resolvedTheme === "dark") {
        return <MoonStarsIcon className="h-4 w-4" weight="bold" />;
      } else {
        return <SunDimIcon className="h-4 w-4" weight="bold" />;
      }
    }

    // Fallback
    return <SunIcon className="h-4 w-4" weight="bold" />;
  };

  const getLabel = () => {
    if (theme === "dark") return "Dark mode";
    if (theme === "system") return `System theme (${resolvedTheme})`;
    return "Light mode";
  };

  return (
    <button
      onClick={cycleTheme}
      aria-label={`${getLabel()}. Click to cycle theme.`}
      className="rounded-md bg-transparent px-3 py-1.5 text-sm text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground"
    >
      {getIcon()}
    </button>
  );
}
