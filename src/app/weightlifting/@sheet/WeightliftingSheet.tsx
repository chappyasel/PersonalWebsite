"use client";

import { useWlPath } from "../lib/paths";
import { type ReactNode } from "react";

import ModalSheet from "~/components/modal-sheet/ModalSheet";

/** The shared sheet chrome with a host-aware expand target: the interceptor
 * layouts are server components and cannot know which host they are on, so
 * they pass the subpath and this wrapper resolves it in the browser (a
 * /weightlifting-prefixed href on the subdomain would redirect). */
export function WeightliftingSheet({
  label,
  variant,
  expandSubpath,
  children,
}: {
  label: string;
  variant?: "document" | "card";
  expandSubpath: string;
  children: ReactNode;
}) {
  const wlPath = useWlPath();
  return (
    <ModalSheet
      label={label}
      variant={variant}
      expandHref={wlPath(expandSubpath)}
    >
      {children}
    </ModalSheet>
  );
}
