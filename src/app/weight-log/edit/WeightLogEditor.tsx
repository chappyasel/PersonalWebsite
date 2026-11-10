"use client";

import { useSyncExternalStore } from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { TooltipProvider } from "~/components/ui/tooltip";

import { PlanEditor, SetPointsEditor } from "./PlanEditor";
import { WeekSheet } from "./WeekSheet";
import type { EditorView } from "./headerSlot";

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
 * One page of the owner's Weight Log editor: the weekly table, which takes
 * weigh-ins and plan changes cell by cell, the running phase's plan, or the
 * set points. Each has its own address, and the header's nav moves between
 * them.
 * Everything reads and writes through `api.weightLog.*`, which is
 * owner-only.
 *
 * "Today" is the device's date, which the server cannot know, so the editor
 * renders only in the browser.
 */
export function WeightLogEditor({ view = "weeks" }: { view?: EditorView }) {
  const inBrowser = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  if (!inBrowser) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return <Editor view={view} />;
}

function Editor({ view }: { view: EditorView }) {
  const today = useSyncExternalStore(subscribeToToday, localToday, localToday);
  return (
    <TooltipProvider delayDuration={200}>
      {view === "weeks" ? (
        <WeekSheet today={today} />
      ) : (
        // The plan's forms read best at a column's width, under the header.
        <div className="grid w-full min-w-0 max-w-2xl grid-cols-[minmax(0,1fr)]">
          {view === "plan" ? <PlanEditor today={today} /> : <SetPointsEditor />}
        </div>
      )}
    </TooltipProvider>
  );
}
