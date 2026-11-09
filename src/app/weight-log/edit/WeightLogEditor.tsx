"use client";

import {
  CaretLeftIcon,
  CaretRightIcon,
  ScalesIcon,
  TableIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  type CSSProperties,
  type FormEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { cn } from "~/lib/utils";
import { type CellColor, weekTableColors } from "~/lib/weight-log/color-scale";
import { addDays, weekStartOf } from "~/lib/weight-log/phases";
import type { WeekTableRow } from "~/lib/weight-log/week-table";
import { type RouterOutputs, api } from "~/trpc/react";

import { Button } from "~/components/ui/button";
import { CollapsibleSection } from "~/components/ui/collapsible-section";
import { Input } from "~/components/ui/input";
import { LoadFailed } from "~/components/ui/load-failed";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { PlanEditor, SetPointsEditor } from "./PlanEditor";

type Phase = RouterOutputs["weightLog"]["phases"]["phases"][number];

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

const formatDay = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    ...options,
  });

const pounds = (value: number | null) =>
  value === null ? "—" : value.toFixed(1);

/**
 * A cell's workbook color in both themes. The values are computed, so they
 * travel as custom properties and the class below picks the theme's pair.
 */
function fillStyle(color: CellColor | null): CSSProperties | undefined {
  if (!color) return undefined;
  return {
    "--wl-fill": color.light.background,
    "--wl-ink": color.light.text,
    "--wl-fill-dark": color.dark.background,
    "--wl-ink-dark": color.dark.text,
  } as CSSProperties;
}

const FILLED =
  "bg-[color:var(--wl-fill)] text-[color:var(--wl-ink)] dark:bg-[color:var(--wl-fill-dark)] dark:text-[color:var(--wl-ink-dark)]";

/** A difference to one decimal, with its sign. Zero has none. */
function signed(value: number | null) {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}

/** The phase whose weeks hold this Monday. The newest phase has no end, so a
 * weigh-in past its plan still belongs to it. */
function phaseOfWeek(phases: Phase[], week: string) {
  return phases.find(
    (phase, index) => phase.start <= week && (index === 0 || week <= phase.end),
  );
}

/** The summary columns, after the seven days, in the workbook's order. A
 * colored column takes the shared blue-white-red scale. */
const COLUMNS: {
  key: keyof WeekTableRow;
  label: string;
  hint: string;
  signed?: boolean;
  colored?: "average" | "target" | "originalTarget";
}[] = [
  {
    key: "average",
    label: "Avg",
    hint: "Weekly average",
    colored: "average",
  },
  {
    key: "change",
    label: "Chg",
    hint: "Change from last week's average",
    signed: true,
  },
  {
    key: "target",
    label: "Target",
    hint: "This week's target",
    colored: "target",
  },
  {
    key: "gapToTarget",
    label: "Gap",
    hint: "Weekly average minus target",
    signed: true,
  },
  {
    key: "poundsPerWeek",
    label: "lb/wk",
    hint: "Target minus last week's target",
    signed: true,
  },
  {
    key: "originalTarget",
    label: "Orig",
    hint: "Original target, set when the phase began",
    colored: "originalTarget",
  },
  {
    key: "gapToOriginalTarget",
    label: "Gap",
    hint: "Target minus original target",
    signed: true,
  },
];

const subscribeNever = () => () => undefined;

/**
 * The owner's Weight Log editor: a weigh-in form, the week around its date
 * for corrections, the weekly table, the running phase's plan, and the set
 * points. Everything reads and writes through
 * `api.weightLog.*`, which is owner-only.
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
  const [date, setDate] = useState(today);
  const [draft, setDraft] = useState<{ date: string; text: string } | null>(
    null,
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // The day turned over while the page stayed open. A form still on the old
  // today with nothing typed moves to the new one, so the morning's reading
  // can't land on yesterday. A typed draft stays where it is.
  const [seenToday, setSeenToday] = useState(today);
  if (seenToday !== today) {
    setSeenToday(today);
    const drafting = draft !== null && draft.date === date;
    if (!drafting && (date === seenToday || date > today)) {
      setDate(today);
      setConfirmingDelete(false);
      setStatus(null);
    }
  }
  const [tablePhaseId, setTablePhaseId] = useState<string | null>(null);
  const formRef = useRef<HTMLElement>(null);

  const utils = api.useUtils();
  const phasesQuery = api.weightLog.phases.useQuery();
  const phases = phasesQuery.data?.phases ?? [];
  const week = weekStartOf(date);
  const gridPhaseId = phaseOfWeek(phases, week)?.id ?? null;
  const shownPhaseId = tablePhaseId ?? phasesQuery.data?.currentId ?? null;
  const gridQuery = api.weightLog.weekTable.useQuery(
    { phaseId: gridPhaseId ?? "" },
    { enabled: gridPhaseId !== null },
  );
  const tableQuery = api.weightLog.weekTable.useQuery(
    { phaseId: shownPhaseId ?? "" },
    { enabled: shownPhaseId !== null },
  );

  const gridRow = gridQuery.data?.rows.find((row) => row.week === week);
  const weekDays = Array.from({ length: 7 }, (_, day) => ({
    date: addDays(week, day),
    weight: gridRow?.weights[day] ?? null,
    excluded: gridRow?.excludedDays.includes(day) ?? false,
  }));
  const existing = weekDays.find((day) => day.date === date)?.weight ?? null;
  const poundsText =
    draft?.date === date
      ? draft.text
      : existing === null
        ? ""
        : pounds(existing);
  const entered = Number.parseFloat(poundsText);
  const valid =
    poundsText.trim() !== "" &&
    Number.isFinite(entered) &&
    entered > 0 &&
    entered <= 1500;
  // Decision 7 lets a save replace the date's weigh-in. The button says so,
  // and the old value stays on screen: in the field until the owner types,
  // then beside the buttons.
  const replacing = existing !== null;
  const unchanged =
    replacing && valid && Math.round(entered * 10) / 10 === existing;

  const refresh = () => utils.weightLog.weekTable.invalidate();
  const upsert = api.weightLog.upsertWeighIn.useMutation({
    onSuccess: async () => {
      await refresh();
      setDraft(null);
    },
    onError: () => setStatus("The weigh-in didn't save. Try again."),
  });
  const remove = api.weightLog.deleteWeighIn.useMutation({
    onSuccess: async (_result, input) => {
      setStatus(
        `Deleted the weigh-in for ${formatDay(input.date, { month: "short", day: "numeric" })}.`,
      );
      setConfirmingDelete(false);
      await refresh();
      setDraft(null);
    },
    onError: () => setStatus("The weigh-in didn't delete. Try again."),
  });
  const busy = upsert.isPending || remove.isPending;

  const choose = (next: string) => {
    setDate(next > today ? today : next);
    setDraft(null);
    setConfirmingDelete(false);
    setStatus(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || busy || unchanged) return;
    const verb = replacing ? "Replaced" : "Saved";
    upsert.mutate(
      { date, pounds: entered },
      {
        onSuccess: (row) =>
          setStatus(
            `${verb} ${pounds(row.pounds)} lb for ${formatDay(row.date, { month: "short", day: "numeric" })}.`,
          ),
      },
    );
  };

  const oldest = phases.at(-1)?.start ?? week;
  const shownPhase = phases.find((phase) => phase.id === shownPhaseId);
  const currentWeek = weekStartOf(today);
  const tableRows = tableQuery.data?.rows;
  const colors = useMemo(
    () => (tableRows ? weekTableColors(tableRows) : []),
    [tableRows],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto grid w-full min-w-0 max-w-2xl grid-cols-[minmax(0,1fr)] gap-6">
        <section ref={formRef} aria-label="Weigh-in" className="scroll-mt-4">
          <CollapsibleSection
            title="Weigh-in"
            icon={<ScalesIcon className="h-5 w-5" weight="bold" />}
          >
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 basis-36 flex-col gap-1 text-xs text-muted-foreground">
                  Date
                  <Input
                    type="date"
                    value={date}
                    max={today}
                    required
                    onChange={(event) => {
                      if (event.target.value) choose(event.target.value);
                    }}
                  />
                </label>
                <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">
                  Pounds
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min="0.1"
                    max="1500"
                    value={poundsText}
                    className="tabular-nums"
                    onChange={(event) => {
                      setDraft({ date, text: event.target.value });
                      setStatus(null);
                    }}
                  />
                </label>
                <Button type="submit" disabled={!valid || busy || unchanged}>
                  {replacing ? "Replace" : "Save"}
                </Button>
              </div>
              <div className="flex min-h-8 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {date !== today ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-3"
                    onClick={() => choose(today)}
                  >
                    Back to today
                  </Button>
                ) : null}
                {existing !== null && !confirmingDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={date === today ? "-ml-3" : undefined}
                    disabled={busy}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <TrashIcon aria-hidden />
                    Delete
                  </Button>
                ) : null}
                {replacing && !unchanged && !confirmingDelete ? (
                  <span>Replaces {pounds(existing)} lb</span>
                ) : null}
                {confirmingDelete && existing !== null ? (
                  <span className="flex items-center gap-2">
                    Delete {pounds(existing)} lb on{" "}
                    {formatDay(date, { month: "short", day: "numeric" })}?
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={busy}
                      onClick={() => remove.mutate({ date })}
                    >
                      Delete
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : null}
                <p role="status" aria-live="polite">
                  {status}
                </p>
              </div>
            </form>

            <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous week"
                  disabled={week <= oldest}
                  onClick={() => choose(addDays(date, -7))}
                >
                  <CaretLeftIcon aria-hidden />
                </Button>
                <p className="text-sm">
                  Week of{" "}
                  {formatDay(week, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next week"
                  disabled={week >= currentWeek}
                  onClick={() => choose(addDays(date, 7))}
                >
                  <CaretRightIcon aria-hidden />
                </Button>
              </div>
              {gridQuery.isError ? (
                <LoadFailed
                  message="This week failed to load."
                  onRetry={() => void gridQuery.refetch()}
                  retrying={gridQuery.isFetching}
                />
              ) : (
                <ol className="grid grid-cols-7 gap-1">
                  {weekDays.map((day, index) => {
                    const selected = day.date === date;
                    const future = day.date > today;
                    const cell = (
                      <button
                        type="button"
                        disabled={future}
                        aria-pressed={selected}
                        aria-label={`${formatDay(day.date, { weekday: "long", month: "long", day: "numeric" })}: ${day.weight === null ? "no weigh-in" : `${pounds(day.weight)} lb${day.excluded ? ", left out of the weekly average" : ""}`}`}
                        onClick={() => choose(day.date)}
                        className={cn(
                          "flex w-full flex-col items-center gap-0.5 rounded-md border px-0.5 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40",
                          selected
                            ? "border-neutral-500 bg-neutral-100 dark:border-neutral-400 dark:bg-neutral-700"
                            : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-700/50",
                        )}
                      >
                        <span className="text-muted-foreground">
                          {DAY_NAMES[index]}
                        </span>
                        <span className="text-muted-foreground">
                          {Number(day.date.slice(8))}
                        </span>
                        {gridQuery.isPending && gridPhaseId !== null ? (
                          <Skeleton className="h-4 w-8" />
                        ) : (
                          <span
                            className={cn(
                              "h-4 font-medium tabular-nums",
                              day.excluded &&
                                "text-muted-foreground line-through",
                            )}
                          >
                            {day.weight === null ? "" : pounds(day.weight)}
                          </span>
                        )}
                      </button>
                    );
                    return (
                      <li key={day.date}>
                        {day.excluded ? (
                          <Tooltip>
                            <TooltipTrigger asChild>{cell}</TooltipTrigger>
                            <TooltipContent>
                              Left out of the weekly average
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          cell
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </CollapsibleSection>
        </section>

        <CollapsibleSection
          title="Weeks"
          icon={<TableIcon className="h-5 w-5" weight="bold" />}
          cardClassName="px-0 sm:px-0"
        >
          <div className="mb-3 px-3 sm:px-4">
            <Select
              value={shownPhaseId ?? undefined}
              onValueChange={setTablePhaseId}
              disabled={!phases.length}
            >
              <SelectTrigger
                aria-label="Phase"
                className="h-8 w-[220px] text-xs"
              >
                <SelectValue placeholder="Phase" />
              </SelectTrigger>
              <SelectContent className="ph-no-capture ph-mask font-sans">
                {phases.map((phase) => (
                  <SelectItem key={phase.id} value={phase.id}>
                    {phase.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {phasesQuery.isError || tableQuery.isError ? (
            <LoadFailed
              message="The weekly table failed to load."
              onRetry={() =>
                void (phasesQuery.isError
                  ? phasesQuery.refetch()
                  : tableQuery.refetch())
              }
              retrying={phasesQuery.isFetching || tableQuery.isFetching}
            />
          ) : !tableQuery.data ? (
            <div className="flex flex-col gap-2 px-3 sm:px-4">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-6 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table
                aria-label={
                  shownPhase ? `Weeks of ${shownPhase.label}` : "Weeks"
                }
                className="w-full min-w-max border-separate border-spacing-0 text-xs tabular-nums"
              >
                <thead>
                  <tr className="text-muted-foreground [&>th]:border-b [&>th]:border-neutral-200 dark:[&>th]:border-neutral-700">
                    <th
                      scope="col"
                      className="sticky left-0 bg-white py-2 pl-3 pr-2 text-left font-normal dark:bg-neutral-800 sm:pl-4"
                    >
                      Week
                    </th>
                    {DAY_NAMES.map((day) => (
                      <th
                        key={day}
                        scope="col"
                        className="px-1.5 py-2 text-right font-normal"
                      >
                        {day}
                      </th>
                    ))}
                    {COLUMNS.map((column, index) => (
                      <th
                        key={column.key}
                        scope="col"
                        className={cn(
                          "px-1.5 py-2 text-right font-normal last:pr-3 sm:last:pr-4",
                          index === 0 &&
                            "border-l border-neutral-200 dark:border-neutral-700",
                        )}
                      >
                        <Tooltip allowTapFirst>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              aria-label={column.hint}
                              className="cursor-help rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                              {column.label}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{column.hint}</TooltipContent>
                        </Tooltip>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableQuery.data.rows.map((row, rowIndex) => {
                    const rowColors = colors[rowIndex];
                    const current = row.week === currentWeek;
                    const future = row.week > currentWeek;
                    return (
                      <tr
                        key={row.week}
                        aria-current={current ? "date" : undefined}
                        className={cn(
                          // Borders sit on the cells: a separated table keeps them with the
                          // sticky Week column when the row scrolls under it.
                          "[&:last-child>*]:border-b-0 [&>*]:border-b [&>*]:border-neutral-100 dark:[&>*]:border-neutral-700/60",
                          future && "text-muted-foreground",
                          current && "font-medium",
                        )}
                      >
                        <th
                          scope="row"
                          className={cn(
                            "sticky left-0 bg-white py-0 pl-1 pr-2 text-left dark:bg-neutral-800 sm:pl-2",
                            current ? "font-medium" : "font-normal",
                          )}
                        >
                          {future ? (
                            <span className="inline-block px-2 py-1.5">
                              {formatDay(row.week, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          ) : (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-7 px-2 text-xs",
                                current ? "font-medium" : "font-normal",
                              )}
                              aria-label={`Show the week of ${formatDay(row.week, { month: "long", day: "numeric", year: "numeric" })}`}
                              onClick={() => {
                                choose(row.week);
                                formRef.current?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "start",
                                });
                              }}
                            >
                              {formatDay(row.week, {
                                month: "short",
                                day: "numeric",
                              })}
                            </Button>
                          )}
                        </th>
                        {row.weights.map((weight, day) => {
                          const excluded = row.excludedDays.includes(day);
                          const fill = rowColors?.days[day] ?? null;
                          return (
                            <td
                              key={day}
                              style={fillStyle(fill)}
                              className={cn(
                                "px-1.5 py-1.5 text-right",
                                fill && FILLED,
                              )}
                            >
                              {weight === null ? null : excluded ? (
                                <Tooltip allowTapFirst>
                                  <TooltipTrigger asChild>
                                    <span
                                      tabIndex={0}
                                      className="cursor-help rounded-sm text-muted-foreground line-through focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    >
                                      {pounds(weight)}
                                      <span className="sr-only">
                                        , left out of the weekly average
                                      </span>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Left out of the weekly average
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                pounds(weight)
                              )}
                            </td>
                          );
                        })}
                        {COLUMNS.map((column, index) => {
                          const value = row[column.key] as number | null;
                          const fill = column.colored
                            ? (rowColors?.[column.colored] ?? null)
                            : null;
                          return (
                            <td
                              key={column.key}
                              style={fillStyle(fill)}
                              className={cn(
                                "px-1.5 py-1.5 text-right last:pr-3 sm:last:pr-4",
                                index === 0 &&
                                  "border-l border-neutral-200 dark:border-neutral-700",
                                fill && FILLED,
                              )}
                            >
                              {column.signed ? signed(value) : pounds(value)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleSection>

        <PlanEditor today={today} />
        <SetPointsEditor />
      </div>
    </TooltipProvider>
  );
}
