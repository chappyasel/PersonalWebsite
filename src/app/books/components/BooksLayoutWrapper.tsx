"use client";

import { GrainientBackground } from "~/components/ui/grainient-background";
import { type FontOption, useFont } from "~/lib/font-provider";
import { cn } from "~/lib/util";

const fontClasses: Record<FontOption, string> = {
  georgia: "font-georgia",
  system: "font-system",
  literata: "font-literata",
};

export function BooksLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { font, mounted } = useFont();

  return (
    <GrainientBackground
      className={cn(
        "min-h-screen bg-background text-foreground",
        mounted ? fontClasses[font] : "font-georgia",
      )}
    >
      {children}
    </GrainientBackground>
  );
}
