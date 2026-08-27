"use client";

import Link from "next/link";
import { useEffect } from "react";

import DaylightSky from "~/components/daylight/DaylightSky";

import "~/styles/daylight.css";

/**
 * The catch-all for any route without its own error screen. Segments that
 * want a scoped recovery (staying inside their own chrome, retrying one
 * dataset) still define their own; this one exists so no route can fall
 * through to Next's unstyled built-in page.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled page error:", error);
  }, [error]);

  return (
    <main className="daylight-root font-serif">
      <div className="dl-screen">
        <DaylightSky />
        <h1 className="text-3xl font-bold text-[hsl(var(--dl-sky-ink))]">
          Something went wrong
        </h1>
        <p className="mt-3 max-w-md text-lg">
          This page failed to load. It is usually temporary.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={reset}
            className="rounded-lg border border-[hsl(var(--dl-sky-ink)/0.45)] px-4 py-2 text-[hsl(var(--dl-sky-ink))] transition-colors hover:bg-[hsl(var(--dl-sky-ink)/0.12)]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="font-sans text-sm text-[hsl(var(--dl-sky-ink)/0.85)] underline underline-offset-4 transition-colors hover:text-[hsl(var(--dl-sky-ink))]"
          >
            Back to home
          </Link>
        </div>
        {error.digest && (
          <p className="mt-5 font-sans text-xs text-[hsl(var(--dl-sky-ink)/0.7)]">
            Error ID: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
