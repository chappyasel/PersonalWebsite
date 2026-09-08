"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

import { prefersFullPage } from "./sheetRoute";

type SheetLinkProps = Omit<
  ComponentProps<typeof Link>,
  "href" | "onNavigate"
> & { href: string };

/**
 * A <Link> into a sheet route. Next calls `onNavigate` only for the soft
 * navigation a plain click would start — modified clicks, download and
 * new-tab targets, and cross-origin hrefs never reach it — so cancelling
 * there and loading the page ourselves converts exactly the one case that
 * would otherwise mount the sheet. Everything else about the link (prefetch,
 * the caller's onClick recording the origin rect, right-click) is untouched.
 */
export default function SheetLink({ href, ...props }: SheetLinkProps) {
  return (
    <Link
      {...props}
      href={href}
      onNavigate={(event) => {
        if (!prefersFullPage()) return;
        event.preventDefault();
        window.location.assign(href);
      }}
    />
  );
}
