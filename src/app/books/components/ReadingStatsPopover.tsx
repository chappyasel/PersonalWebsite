"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "~/components/ui/skeleton";
import { StatsPopover } from "~/components/ui/stats-popover";

const ReadingStatsContent = dynamic(
  () =>
    import("./ReadingStatsContent").then(
      (module) => module.ReadingStatsContent,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    ),
  },
);

type Scope = "all" | (string & {});

type ReadingStatsPopoverProps = {
  scope: Scope;
  children: React.ReactNode;
  triggerClassName?: string;
  align?: "start" | "center" | "end";
};

export function ReadingStatsPopover({
  scope,
  children,
  triggerClassName,
  align = "start",
}: ReadingStatsPopoverProps) {
  return (
    <StatsPopover
      content={<ReadingStatsContent initialScope={scope} />}
      triggerClassName={triggerClassName}
      triggerAriaLabel={
        scope === "all"
          ? "Reading statistics"
          : `Reading statistics for ${scope}`
      }
      align={align}
    >
      {children}
    </StatsPopover>
  );
}
