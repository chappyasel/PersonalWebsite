"use client";

import { useTheme } from "next-themes";
import React, { type ReactNode, useEffect, useState } from "react";

import Grainient from "~/components/reactbits/grainient";
import { cn } from "~/lib/utils";

const COLORS = {
  light: { color1: "#faf5f0", color2: "#c4a882", color3: "#a68b6b" },
  dark: { color1: "#1c1714", color2: "#6b5744", color3: "#8b7355" },
} as const;

interface GrainientBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
}

export function GrainientBackground({
  className,
  children,
  ...props
}: GrainientBackgroundProps) {
  const { resolvedTheme } = useTheme();
  const mode = resolvedTheme === "dark" ? "dark" : "light";
  const colors = COLORS[mode];
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={cn("relative [contain:paint]", className)}
      {...props}
    >
      {/* Top grainient */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[100dvh] overflow-hidden transition-opacity duration-700",
          ready ? "opacity-15 dark:opacity-15" : "opacity-0",
          "[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)]",
        )}
      >
        <Grainient
          color1={colors.color1}
          color2={colors.color2}
          color3={colors.color3}
          grainAmount={mode === "dark" ? 0.4 : 0.25}
        />
      </div>
      {/* Bottom grainient — mirrored */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-[100dvh] overflow-hidden transition-opacity duration-700",
          ready ? "opacity-15 dark:opacity-15" : "opacity-0",
          "[mask-image:radial-gradient(ellipse_at_0%_100%,black_10%,transparent_70%)]",
        )}
      >
        <Grainient
          color1={colors.color3}
          color2={colors.color2}
          color3={colors.color1}
          grainAmount={mode === "dark" ? 0.4 : 0.25}
        />
      </div>
      {children}
    </div>
  );
}
