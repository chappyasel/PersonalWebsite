"use client";

import { useTheme } from "next-themes";
import React, {
  type ComponentType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const [Renderer, setRenderer] = useState<ComponentType<{
    color1: string;
    color2: string;
    color3: string;
    grainAmount: number;
  }> | null>(null);
  const [bottomNearViewport, setBottomNearViewport] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    if (reducedMotion.matches) return;
    // Without WebGL, ogl's Renderer throws during construction and takes the
    // whole tree down — keep the static gradient instead.
    try {
      const probe = document.createElement("canvas");
      if (!probe.getContext("webgl2") && !probe.getContext("webgl")) return;
    } catch {
      return;
    }

    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const loadRenderer = () => {
      const load = () => {
        void import("~/components/reactbits/grainient").then((module) => {
          if (!cancelled) setRenderer(() => module.default);
        });
      };
      if ("requestIdleCallback" in window) {
        idleId = window.requestIdleCallback(load, { timeout: 2500 });
      } else {
        timeoutId = globalThis.setTimeout(load, 1);
      }
    };

    if (document.readyState === "complete") loadRenderer();
    else window.addEventListener("load", loadRenderer, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", loadRenderer);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (!bottomRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setBottomNearViewport(Boolean(entry?.isIntersecting)),
      { rootMargin: "300px 0px" },
    );
    observer.observe(bottomRef.current);
    return () => observer.disconnect();
  }, []);

  // Keep the serialized style identical on the server and during hydration.
  // The root theme class changes these CSS variables without changing React
  // props, while the deferred canvas can safely use resolvedTheme afterward.
  const staticGradient = {
    background:
      "radial-gradient(ellipse at center, var(--grainient-color-2) 0%, var(--grainient-color-1) 48%, var(--grainient-color-3) 100%)",
  };

  return (
    <div className={cn("relative [contain:paint]", className)} {...props}>
      {/* Top grainient */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[100dvh] overflow-hidden opacity-15",
          "[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)]",
        )}
        style={staticGradient}
      >
        {Renderer && (
          <Renderer
            color1={colors.color1}
            color2={colors.color2}
            color3={colors.color3}
            grainAmount={mode === "dark" ? 0.4 : 0.25}
          />
        )}
      </div>
      {/* Bottom grainient — mirrored */}
      <div
        ref={bottomRef}
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-[100dvh] overflow-hidden opacity-15",
          "[mask-image:radial-gradient(ellipse_at_0%_100%,black_10%,transparent_70%)]",
        )}
        style={staticGradient}
      >
        {Renderer && bottomNearViewport && (
          <Renderer
            color1={colors.color3}
            color2={colors.color2}
            color3={colors.color1}
            grainAmount={mode === "dark" ? 0.4 : 0.25}
          />
        )}
      </div>
      {children}
    </div>
  );
}
