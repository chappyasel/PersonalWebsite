"use client";

import Link from "next/link";
import { useEffect } from "react";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center font-serif text-muted-foreground">
      <h1 className="text-3xl font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="max-w-md text-lg">
        This page failed to load. It is usually temporary.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4">
        <button
          onClick={reset}
          className="rounded-lg border border-title px-4 py-2 text-foreground transition-colors hover:bg-muted"
        >
          Try again
        </button>
        <Link
          href="/"
          className="text-sm underline underline-offset-4 transition-colors hover:text-foreground"
        >
          Back to home
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 text-sm">Error ID: {error.digest}</p>
      )}
    </main>
  );
}
