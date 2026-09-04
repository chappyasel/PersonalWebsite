"use client";

import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";

import { jumpToSection } from "./sectionJump";

/**
 * A link from running text to a section of the page it is on. A plain
 * anchor, not `next/link`: a section is reached by scrolling, and routing
 * to the page's own path re-presents the page in a sheet (see
 * sectionJump.ts). Modified clicks keep the browser's own behaviour, so
 * open-in-new-tab still lands on the section.
 */
export default function SectionLink({
  id,
  children,
  onClick,
  ...rest
}: {
  id: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    // A section that is not on the page (a stale id) falls through to the
    // browser's fragment handling.
    if (jumpToSection(id)) event.preventDefault();
  };
  return (
    <a href={`#${id}`} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
