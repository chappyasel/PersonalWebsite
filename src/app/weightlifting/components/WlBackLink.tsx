"use client";

import Link from "next/link";

import { cn } from "~/lib/utils";

import { useWlPath } from "../lib/paths";

/** The "← Chappy's Weightlifting" crumb, host-aware so it soft-navigates on
 * both the root domain and the subdomain. */
export function WlBackLink({ className }: { className?: string }) {
  const wlPath = useWlPath();
  return (
    <Link
      href={wlPath()}
      className={cn(
        "text-sm text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
        className,
      )}
    >
      ← Chappy&apos;s Weightlifting
    </Link>
  );
}
