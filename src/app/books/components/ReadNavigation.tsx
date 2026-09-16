"use client";

import { useBookPath } from "../hooks/useBookPath";
import { getOrdinalSuffix } from "../lib/format";
import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { MouseEvent } from "react";

import type { BookReading } from "~/lib/books/types";

import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export function ReadNavigation({
  bookId,
  readings = [],
  booksHref,
  onReadSelect,
}: {
  bookId: string;
  readings?: BookReading[];
  booksHref?: string;
  onReadSelect?: (bookId: string, event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const bookPath = useBookPath();
  const currentIndex = readings.findIndex((reading) => reading.id === bookId);
  if (currentIndex < 0) return null;

  const reads = readings.filter((reading) => !reading.abandoned);
  const previous = readings
    .slice(0, currentIndex)
    .reverse()
    .find((reading) => !reading.abandoned);
  const next = readings
    .slice(currentIndex + 1)
    .find((reading) => !reading.abandoned);
  if (!previous && !next) return null;

  return (
    <>
      <TooltipProvider delayDuration={200}>
        <nav aria-label="Other reads" className="flex shrink-0 items-center">
          {(
            [
              [previous, "Previous read", ArrowCounterClockwiseIcon],
              [next, "Next read", ArrowClockwiseIcon],
            ] as const
          ).map(([reading, direction, Icon]) => {
            if (!reading) return null;
            const number = reads.indexOf(reading) + 1;
            const label = `${direction}: ${number}${getOrdinalSuffix(number)} read`;
            return (
              <Tooltip key={direction}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 shrink-0 p-0 text-muted-foreground/70 hover:text-foreground"
                    asChild
                  >
                    <Link
                      replace
                      data-route-transition="preserve"
                      onClick={(event) => onReadSelect?.(reading.id, event)}
                      href={
                        booksHref
                          ? `${booksHref}/${encodeURIComponent(reading.id)}`
                          : bookPath(reading.id)
                      }
                      aria-label={label}
                    >
                      <Icon size={14} weight="bold" aria-hidden />
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </TooltipProvider>
      <span
        aria-hidden="true"
        className="text-xs leading-none text-muted-foreground/40"
      >
        •
      </span>
    </>
  );
}
