"use client";

import Link from "next/link";
import { type ComponentProps, useContext, useRef } from "react";

import { DocumentSheetNavigationContext } from "./DocumentSheetNavigation";
import { InModalSheetContext } from "./ModalSheet";
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
  const inSheet = useContext(InModalSheetContext);
  const navigateDocument = useContext(DocumentSheetNavigationContext);
  const source = useRef<HTMLAnchorElement | null>(null);
  const isDocument = /^\/(manual|routine|systems)(?:[?#]|$)/.test(href);
  return (
    <Link
      {...props}
      href={href}
      // Fetch the complete document, not just a route/loading boundary.
      prefetch={props.prefetch ?? (isDocument ? true : undefined)}
      replace={inSheet || props.replace}
      data-route-transition="preserve"
      onClick={(event) => {
        props.onClick?.(event);
        source.current = event.currentTarget;
      }}
      onNavigate={(event) => {
        if (!prefersFullPage()) {
          if (
            inSheet &&
            isDocument &&
            source.current &&
            navigateDocument?.(href, source.current)
          )
            event.preventDefault();
          return;
        }
        event.preventDefault();
        window.location.assign(href);
      }}
    />
  );
}
