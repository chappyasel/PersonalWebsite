"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";

import DaylightSheet from "~/components/daylight/DaylightSheet";

import "~/styles/daylight.css";

const DOCUMENTS: Record<string, { label: string; href: string }> = {
  "(.)manual": { label: "Personal Operating Manual", href: "/manual" },
  "(.)routine": { label: "Core Daily Routine", href: "/routine" },
  "(.)systems": { label: "Personal Systems", href: "/systems" },
};

// Keep one shell, its original launch rect, and the scene suspension alive
// while links replace the document inside this slot.
export default function SheetLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const document = segment ? DOCUMENTS[segment] : undefined;
  if (!document) return children;
  return (
    <DaylightSheet label={document.label} expandHref={document.href}>
      {children}
    </DaylightSheet>
  );
}
