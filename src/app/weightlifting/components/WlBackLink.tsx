"use client";

import { useWlPath } from "../lib/paths";
import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent as ReactMouseEvent, useContext } from "react";

import { cn } from "~/lib/utils";

import { InModalSheetContext } from "~/components/modal-sheet/ModalSheet";

/** The "← Chappy's Weightlifting" crumb, host-aware so it soft-navigates on
 * both the root domain and the subdomain. Inside a sheet (visible only in
 * the expanded takeover) it pops history instead: a push to the slot's root
 * would strand the sheet, since slots keep their previous content on soft
 * navigation and a catch-all cannot claim the root path. */
export function WlBackLink({ className }: { className?: string }) {
  const wlPath = useWlPath();
  const router = useRouter();
  const inSheet = useContext(InModalSheetContext);

  const onClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!inSheet) return;
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    router.back();
  };

  return (
    <Link
      href={wlPath()}
      onClick={onClick}
      className={cn(
        "text-sm text-neutral-500 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200",
        className,
      )}
    >
      <ArrowLeftIcon
        aria-hidden="true"
        className="inline-block size-[1em] align-[-0.125em]"
      />{" "}
      Chappy&apos;s Weightlifting
    </Link>
  );
}
