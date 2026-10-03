"use client";

import { cn } from "~/lib/util";

import { Button } from "~/components/ui/button";

/**
 * What a panel shows in place of data its query failed to load: one line
 * saying what is missing and a retry. The failure is already reported by
 * the QueryClient, so this only has to tell the reader.
 */
export function LoadFailed({
  message,
  onRetry,
  retrying = false,
  className,
}: {
  /** One plain sentence: "Watch time failed to load." */
  message: string;
  onRetry: () => void;
  /** The retry is in flight; the button waits for it. */
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-1 py-8 text-center",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRetry}
        disabled={retrying}
        // The negative margin lines the label up with the text above when
        // the column is left-aligned, and changes nothing when centred.
        className="-mx-3 text-muted-foreground"
      >
        Try again
      </Button>
    </div>
  );
}
