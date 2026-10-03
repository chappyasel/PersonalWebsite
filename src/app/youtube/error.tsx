"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

import { reportClientError } from "~/lib/error-reporting/client";

import { Button } from "~/components/ui/button";

/**
 * Never shows `error.message`: this area is private, and a message can quote
 * the history it failed to render. The report drops it for the same reason.
 */
export default function YouTubeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    console.error("YouTube page error:", error);
    reportClientError(error, {
      source: "boundary",
      label: "youtube",
      digest: error.digest,
    });
  }, [error]);

  // The page checks access on the server, and reset() alone re-renders the
  // payload that already failed. Refreshing first asks the server again.
  const retry = () =>
    startRetry(() => {
      router.refresh();
      reset();
    });

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-4xl flex-col items-center justify-center gap-3 text-center font-sans">
      <h1 className="font-rounded text-2xl font-semibold text-foreground">
        Something went wrong
      </h1>
      <p className="text-sm text-muted-foreground">
        The dashboard failed to load. It is usually temporary.
      </p>
      <div className="mt-3 flex gap-3">
        <Button onClick={retry} disabled={retrying}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Back to main site</Link>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-3 text-xs text-muted-foreground">
          Error ID: {error.digest}
        </p>
      )}
    </div>
  );
}
