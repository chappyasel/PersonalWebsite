"use client";

import { useSyncExternalStore } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { TooltipProvider } from "~/components/ui/tooltip";

import { PlanEditor, SetPointsEditor } from "./PlanEditor";
import { WeekSheet } from "./WeekSheet";

/** Today in the device's time zone (decision 22), as an ISO date. */
function localToday() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Re-reads the device's date whenever it may have moved: when the tab comes
 * back into view, when the browser restores the page from its back-forward
 * cache, on focus, and at local midnight. A phone can keep the page alive for
 * days without reloading it.
 */
function subscribeToToday(onChange: () => void) {
  window.addEventListener("focus", onChange);
  window.addEventListener("pageshow", onChange);
  document.addEventListener("visibilitychange", onChange);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const armForMidnight = () => {
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    timer = setTimeout(
      () => {
        onChange();
        armForMidnight();
      },
      midnight.getTime() - now.getTime() + 1000,
    );
  };
  armForMidnight();
  return () => {
    window.removeEventListener("focus", onChange);
    window.removeEventListener("pageshow", onChange);
    document.removeEventListener("visibilitychange", onChange);
    clearTimeout(timer);
  };
}

const subscribeNever = () => () => undefined;

/**
 * The owner's Weight Log editor: the weekly table, which takes weigh-ins and
 * plan changes cell by cell, the running phase's plan, and the set points.
 * Everything reads and writes through `api.weightLog.*`, which is
 * owner-only.
 *
 * "Today" is the device's date, which the server cannot know, so the editor
 * renders only in the browser.
 */
export function WeightLogEditor() {
  const inBrowser = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  if (!inBrowser) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return <Editor />;
}

function Editor() {
  const today = useSyncExternalStore(subscribeToToday, localToday, localToday);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto grid w-full min-w-0 max-w-2xl grid-cols-[minmax(0,1fr)] gap-6">
        <WeekSheet today={today} />
        <PlanEditor today={today} />
        <SetPointsEditor />
      </div>
    </TooltipProvider>
  );
}
