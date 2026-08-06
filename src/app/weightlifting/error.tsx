"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function WeightliftingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Weightlifting page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 font-sans">
      <h1 className="text-3xl font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="text-muted-foreground">
        {error.message || "Failed to load workout data. Please try again."}
      </p>
      <div className="mt-4 flex gap-4">
        <button
          onClick={reset}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-white transition-opacity hover:opacity-90 dark:bg-neutral-200 dark:text-neutral-900"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-neutral-300 px-4 py-2 text-foreground transition-colors hover:bg-muted dark:border-neutral-600"
        >
          Back to main site
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 text-sm text-muted-foreground">
          Error ID: {error.digest}
        </p>
      )}
    </div>
  );
}
