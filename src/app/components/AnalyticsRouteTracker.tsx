"use client";

import { type DeepPage, captureOnce } from "../../lib/analytics";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const DEEP_PAGE_ROUTES: ReadonlyArray<{
  route: string;
  page: DeepPage;
  includeChildren?: boolean;
}> = [
  { route: "/books", page: "books", includeChildren: true },
  { route: "/weightlifting", page: "weightlifting", includeChildren: true },
  { route: "/manual", page: "manual" },
  { route: "/routine", page: "routine" },
  { route: "/liarsdice", page: "liars_dice" },
  { route: "/golf", page: "golf" },
];

const DEEP_PAGE_SUBDOMAINS: Readonly<Record<string, DeepPage>> = {
  books: "books",
  weightlifting: "weightlifting",
  manual: "manual",
  routine: "routine",
};

export function deepPageForLocation(
  pathname: string,
  hostname = "",
): DeepPage | null {
  const hostnameParts = hostname.toLowerCase().split(".");
  const rootDomain = hostnameParts.slice(1).join(".");
  if (rootDomain === "chappyasel.com" || rootDomain === "localhost") {
    const subdomainPage = DEEP_PAGE_SUBDOMAINS[hostnameParts[0] ?? ""];
    if (subdomainPage) return subdomainPage;
  }

  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return (
    DEEP_PAGE_ROUTES.find(
      ({ route, includeChildren }) =>
        normalized === route ||
        (includeChildren && normalized.startsWith(`${route}/`)),
    )?.page ?? null
  );
}

export default function AnalyticsRouteTracker() {
  const pathname = usePathname();

  useEffect(() => {
    const page = deepPageForLocation(pathname, window.location.hostname);
    if (!page) return;
    captureOnce(`deep-page:${page}`, "deep_page_entered", { page });
  }, [pathname]);

  return null;
}
