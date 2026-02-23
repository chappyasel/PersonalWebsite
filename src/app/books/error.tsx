"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function BooksError({
  error,
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Books page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="text-muted-foreground">
        {error.message || "Failed to load books. Please try again."}
      </p>
      <div className="mt-4 flex gap-4">
        <Link
          href="/"
          className="rounded-lg border border-title px-4 py-2 text-foreground transition-colors hover:bg-muted"
        >
          Back to main site
        </Link>
      </div>
      {error.digest && (
        <p className="mt-4 text-sm text-muted-foreground/50">
          Error ID: {error.digest}
        </p>
      )}
    </div>
  );
}
