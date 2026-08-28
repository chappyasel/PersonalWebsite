"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => undefined;

/**
 * Weightlifting pages resolve at /weightlifting/* on the root domain and at
 * /* on the weightlifting subdomain, where the proxy REDIRECTS any
 * /weightlifting-prefixed request to the stripped path. A prefixed href on
 * the subdomain therefore turns a soft client navigation into a redirect
 * round-trip: a full document load that resets scroll and leaves an extra
 * history entry (back must be pressed twice). Both hosts serve the same
 * static HTML, so the choice can only be made in the browser: SSR and
 * hydration render the prefixed form, then subdomain visitors re-render to
 * stripped paths right after mount (useSyncExternalStore keeps that flip
 * hydration-safe).
 */
export function useWlPath(): (subpath?: string) => string {
  const onSubdomain = useSyncExternalStore(
    emptySubscribe,
    () => window.location.hostname.startsWith("weightlifting."),
    () => false,
  );
  return (subpath = "") =>
    onSubdomain ? subpath || "/" : `/weightlifting${subpath}`;
}
