"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, useContext, useRef } from "react";

import { recordModalOrigin } from "~/lib/originFlight";

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
 * the caller's onClick, right-click) is untouched. Record the launch rect
 * only when a new sheet will open; navigation within it keeps its origin.
 */
export default function SheetLink({ href, ...props }: SheetLinkProps) {
  const router = useRouter();
  const inSheet = useContext(InModalSheetContext);
  const navigateDocument = useContext(DocumentSheetNavigationContext);
  const source = useRef<HTMLAnchorElement | null>(null);
  const isDocument =
    /^\/(?:(manual|routine|systems)(?:[?#]|$)|musings(?:[/?#]|$))/.test(href);
  const prefetchDocument = () => {
    if (
      isDocument &&
      props.prefetch !== false &&
      (!props.target || props.target === "_self") &&
      !props.download
    )
      router.prefetch(href);
  };
  return (
    <Link
      {...props}
      href={href}
      // Fetch the complete document, not just a route/loading boundary.
      prefetch={props.prefetch ?? (isDocument ? true : undefined)}
      replace={inSheet || props.replace}
      data-route-transition="preserve"
      onMouseEnter={(event) => {
        props.onMouseEnter?.(event);
        if (!event.defaultPrevented) prefetchDocument();
      }}
      onFocus={(event) => {
        props.onFocus?.(event);
        if (!event.defaultPrevented) prefetchDocument();
      }}
      onClick={(event) => {
        props.onClick?.(event);
        source.current = event.currentTarget;
      }}
      onNavigate={(event) => {
        if (!prefersFullPage()) {
          if (!inSheet && source.current) {
            recordModalOrigin(source.current.getBoundingClientRect());
          }
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
