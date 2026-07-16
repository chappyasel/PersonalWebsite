"use client";

import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";

export function QueryErrorFallback({
  label,
  onRetry,
}: {
  label: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <WarningCircleIcon
        className="h-6 w-6 text-neutral-400 dark:text-neutral-500"
        weight="bold"
      />
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Couldn&apos;t load {label}
      </p>
      <button
        onClick={onRetry}
        className="rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
      >
        Retry
      </button>
    </div>
  );
}
