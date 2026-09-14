"use client";

import { usePathname, useSelectedLayoutSegment } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import DaylightSheet from "~/components/daylight/DaylightSheet";
import DocumentSheetContent from "~/components/modal-sheet/DocumentSheetContent";
import DocumentSheetLoading, {
  type DocumentSheetHeaders,
} from "~/components/modal-sheet/DocumentSheetLoading";
import DocumentSheetNavigation from "~/components/modal-sheet/DocumentSheetNavigation";

import "~/styles/daylight.css";

const DOCUMENTS: Record<string, { label: string; href: string }> = {
  "(.)manual": { label: "Personal Operating Manual", href: "/manual" },
  "(.)routine": { label: "Core Daily Routine", href: "/routine" },
  "(.)systems": { label: "Personal Systems", href: "/systems" },
};

// Keep one shell, its original launch rect, and the scene suspension alive
// while links replace the document inside this slot.
export default function DocumentSheetLayout({
  children,
  headers,
}: {
  children: ReactNode;
  headers: DocumentSheetHeaders;
}) {
  const segment = useSelectedLayoutSegment();
  const pathname = usePathname();
  const document =
    segment === "(.)musings"
      ? { label: "Musings", href: pathname }
      : segment
        ? DOCUMENTS[segment]
        : undefined;
  if (!document) return children;
  return (
    <DaylightSheet label={document.label} expandHref={document.href}>
      {/* Keep this boundary unkeyed so later transitions retain the current
          document until its replacement is ready. The shell can mount while
          the first document loads, and navigation waits for actual content. */}
      <Suspense
        fallback={
          <DocumentSheetLoading
            label={document.label}
            href={document.href}
            headers={headers}
          />
        }
      >
        <DocumentSheetNavigation documentPath={document.href}>
          <DocumentSheetContent key={document.href}>
            {children}
          </DocumentSheetContent>
        </DocumentSheetNavigation>
      </Suspense>
    </DaylightSheet>
  );
}
