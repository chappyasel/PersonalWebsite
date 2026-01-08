"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="h-[34px] w-[46px] rounded-md bg-transparent" />;
  }

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={toggleTheme}
      aria-label={`${isDark ? "Dark" : "Light"} mode. Click to toggle.`}
      className="flex size-10 items-center justify-center rounded-md bg-transparent text-sm text-muted-foreground transition-all hover:bg-secondary/80 hover:text-foreground"
    >
      {isDark ? (
        <MoonIcon className="h-4 w-4" weight="bold" />
      ) : (
        <SunIcon className="h-4 w-4" weight="bold" />
      )}
    </button>
  );
}
