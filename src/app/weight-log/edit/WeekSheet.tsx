"use client";

import {
  ArrowCounterClockwiseIcon,
  CalendarBlankIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "~/lib/utils";
import { PHASE_COLORS } from "~/lib/weight-log/chart";
import {
  type CellColor,
  type WeekRowColors,
  weekTableColors,
} from "~/lib/weight-log/color-scale";
import { lastWeighInBefore, relativeDayLabel } from "~/lib/weight-log/entry";
import {
  weekLabel as labelOfWeek,
  pounds,
  rate,
} from "~/lib/weight-log/format";
import {
  addDays,
  cycleNumbers,
  phaseWeekCount,
  weekStartOf,
} from "~/lib/weight-log/phases";
import {
  type SheetCell,
  type SheetChange,
  type SheetEdit,
  bareRow,
  cellKey,
  dayEditable,
  editableCells,
  phaseHolding,
  planEditable,
  rateEdit,
  targetEdit,
  undoOf,
  weighInEdit,
  withWeeks,
} from "~/lib/weight-log/sheet";
import {
  SUMMARY_COLUMNS as COLUMNS,
  DAY_NAMES,
} from "~/lib/weight-log/week-columns";
import { type WeekTableRow, weekNumber } from "~/lib/weight-log/week-table";
import { api } from "~/trpc/react";

import { Button } from "~/components/ui/button";
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
  TooltipTrigger,
} from "~/components/ui/tooltip";

import { EditorSection } from "./EditorSection";
import { WEEKS_CONTROLS_ID } from "./headerSlot";
import { failure, isConflict } from "./refusal";

const formatDay = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    ...options,
  });

/** A date's place in its week, Monday 0 to Sunday 6. */
const dayIndex = (date: string) =>
  (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

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

/**
 * Touch screens get wider, taller cells, so a finger lands on the right one
 * and a 16 px input (iOS zooms the page into anything smaller) fits a
 * weigh-in such as 000.0 with the input's padding on both sides.
 */
const TOUCH_CELL =
  "[@media(pointer:coarse)]:min-w-[3.75rem] [@media(pointer:coarse)]:py-2.5";

/** Today's day cell, in light and dark mode. */
const TODAY_RING = "ring-2 ring-inset ring-red-600 dark:ring-red-500";

/**
 * The phase the weekly table shows: the one picked in Weeks while it still
 * exists, otherwise the one holding today. Starting a phase on the current
 * phase's own Monday deletes it, and a pick left pointing at it would fail
 * to load.
 */
export function tablePhaseToShow(
  chosenId: string | null,
  phases: readonly { id: string }[],
  homeId: string | null,
) {
  return phases.some((phase) => phase.id === chosenId) ? chosenId : homeId;
}

/**
 * Opens the date picker on a click anywhere in the control. The native
 * input sits invisible over the button, so on a desktop browser a click
 * would otherwise land on an unseen month or day segment. A phone opens its
 * picker on the tap itself.
 */
function openPicker(event: MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (typeof input.showPicker !== "function") return;
  try {
    input.showPicker();
  } catch {
    // Some browsers refuse outside a trusted gesture; the input still works.
  }
}

type CommitHow = "enter" | "tab" | "blur";

/** A cell turned into an input of its own size. */
function CellInput({
  label,
  initialText,
  prefilled,
  today,
  onCommit,
  onCancel,
  onTab,
}: {
  label: string;
  initialText: string;
  /** The text is a carried weigh-in the owner hasn't typed over. */
  prefilled: boolean;
  today: boolean;
  /** Returns a message when the text can't be sent, keeping the input open. */
  onCommit: (text: string, how: CommitHow, typed: boolean) => string | null;
  onCancel: () => void;
  /** Moves to the next or previous cell, or returns false at either end. */
  onTab: (
    text: string,
    back: boolean,
    typed: boolean,
  ) => "moved" | "invalid" | "end";
}) {
  const [text, setText] = useState(initialText);
  const [typed, setTyped] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // Enter, Tab, and Escape each end the edit; the blur that follows as the
  // input unmounts must not end it again.
  const done = useRef(false);
  const placed = useRef(false);

  const finish = (how: CommitHow) => {
    if (done.current) return;
    if (onCommit(text, how, typed) === null) done.current = true;
    else setInvalid(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (done.current) return;
    if (event.key === "Enter") {
      event.preventDefault();
      finish("enter");
    } else if (event.key === "Escape") {
      event.preventDefault();
      done.current = true;
      onCancel();
    } else if (event.key === "Tab") {
      const result = onTab(text, event.shiftKey, typed);
      if (result === "end") return; // The browser moves on; blur saves.
      event.preventDefault();
      if (result === "moved") done.current = true;
      else setInvalid(true);
    }
  };

  return (
    <Input
      ref={(input) => {
        if (!input || placed.current) return;
        placed.current = true;
        input.focus({ preventScroll: true });
        // The caret goes at the end with nothing selected: on iOS a
        // backspace clears a fully selected field.
        input.setSelectionRange(input.value.length, input.value.length);
        input.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }}
      type="text"
      inputMode="decimal"
      enterKeyHint="done"
      autoComplete="off"
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={text}
      className={cn(
        "absolute inset-0 z-[1] h-full min-w-0 scroll-ml-28 rounded-none border-0 bg-white px-1.5 py-0 text-right text-xs tabular-nums shadow-none ring-2 ring-inset ring-neutral-500 focus-visible:outline-none dark:bg-neutral-900 dark:ring-neutral-300 md:text-xs [@media(pointer:coarse)]:text-base md:[@media(pointer:coarse)]:text-base",
        today && "ring-red-600 dark:ring-red-500",
        invalid &&
          "text-red-700 ring-red-600 dark:text-red-400 dark:ring-red-500",
        prefilled && !typed && "text-muted-foreground",
      )}
      onChange={(event) => {
        setText(event.target.value);
        setTyped(true);
        setInvalid(false);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => finish("blur")}
    />
  );
}

interface Editing {
  cell: SheetCell;
  key: string;
  text: string;
  prefilled: boolean;
}

interface Status {
  message: string;
  /** The change Undo puts back, if it can. */
  undo: SheetChange | null;
}

const without = (record: Record<string, string>, keys: string[]) => {
  if (!keys.some((key) => key in record)) return record;
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
};

/**
 * The Weeks table, edited like a spreadsheet. Tap a day to type its
 * weigh-in, or a week's target or lbs/w to change the plan. Return or
 * leaving the cell saves, Escape cancels, and an emptied day deletes its
 * weigh-in. One status line, shared by every cell, reports the last change
 * and offers to undo it.
 */
export function WeekSheet({ today }: { today: string }) {
  const utils = api.useUtils();
  const phasesQuery = api.weightLog.phases.useQuery();
  const phasesLoaded = phasesQuery.data !== undefined;
  const phases = phasesQuery.data?.phases ?? [];
  const runningId = phasesQuery.data?.runningId ?? null;
  const cycles = cycleNumbers(phases);
  const currentWeek = weekStartOf(today);
  const todayPhase = phaseHolding(today, phases, runningId);

  const [chosenPhaseId, setChosenPhaseId] = useState<string | null>(null);
  const shownPhaseId = tablePhaseToShow(
    chosenPhaseId,
    phases,
    todayPhase?.id ?? phasesQuery.data?.currentId ?? null,
  );
  const shownPhase = phases.find((phase) => phase.id === shownPhaseId);
  const tableQuery = api.weightLog.weekTable.useQuery(
    { phaseId: shownPhaseId ?? "" },
    { enabled: shownPhaseId !== null },
  );

  // The date picked with Go to date, and a day whose cell opens once its row
  // has loaded.
  const [jumpDate, setJumpDate] = useState<string | null>(null);
  const [openWhenLoaded, setOpenWhenLoaded] = useState<string | null>(null);
  const jumpWeek = jumpDate ? weekStartOf(jumpDate) : null;
  // This week's weigh-ins and the one before it seed today's cell, and give
  // this week a row before it has a weigh-in or a plan.
  const todayWeekQuery = api.weightLog.week.useQuery({ week: currentWeek });
  const jumpWeekQuery = api.weightLog.week.useQuery({
    week: jumpWeek ?? currentWeek,
  });

  const [editing, setEditing] = useState<Editing | null>(null);
  /** Text the server refused, kept in its cell until saved or cancelled. */
  const [failed, setFailed] = useState<Record<string, string>>({});
  /** Text sent and not yet back, shown in its cell meanwhile. */
  const [pending, setPending] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status | null>(null);
  // The header's slot for the phase picker and Go to date. The editor
  // renders only in the browser, so the document is there.
  const [headerSlot] = useState(() =>
    document.getElementById(WEEKS_CONTROLS_ID),
  );
  // A plan edit changes the revision and later targets. Until the page has
  // the new plan, the plan cells wait.
  const [planLanding, setPlanLanding] = useState(false);
  const focusAfter = useRef<string | null>(null);

  // Weeks the phase's table lacks: this week before anything is in it, and
  // the week Go to date picked. Each joins the table of the phase that holds
  // it, or a table of its own when no phase does.
  const extraWeeks: WeekTableRow[] = [];
  for (const [week, data] of [
    [currentWeek, todayWeekQuery.data],
    [jumpWeek, jumpWeekQuery.data],
  ] as const) {
    if (week && data?.week === week && !extraWeeks.some((r) => r.week === week))
      extraWeeks.push(bareRow(data));
  }
  const holder = (row: WeekTableRow) =>
    phaseHolding(row.week, phases, runningId)?.id ?? null;
  const looseRows = phasesLoaded
    ? extraWeeks.filter((row) => holder(row) === null)
    : [];
  const tableData =
    tableQuery.data?.phaseId === shownPhaseId ? tableQuery.data : undefined;
  const rows = tableData
    ? withWeeks(
        tableData.rows,
        extraWeeks.filter((row) => holder(row) === shownPhaseId),
      )
    : undefined;
  const allRows = [...looseRows, ...(rows ?? [])];
  const rowByWeek = new Map(allRows.map((row) => [row.week, row]));
  const colors = rows ? weekTableColors(rows) : [];
  const looseColors = weekTableColors(looseRows);

  const weightOn = (date: string) =>
    rowByWeek.get(weekStartOf(date))?.weights[dayIndex(date)] ?? null;
  const excludedOn = (date: string) =>
    rowByWeek.get(weekStartOf(date))?.excludedDays.includes(dayIndex(date)) ??
    false;

  // Today's empty cell starts from the latest counted weigh-in before it,
  // as the old form did. Nothing is saved until the owner presses Return.
  const carried = todayWeekQuery.data
    ? lastWeighInBefore(today, todayWeekQuery.data, todayWeekQuery.data.before)
    : null;

  const refreshWeighIns = () =>
    Promise.all([
      utils.weightLog.week.invalidate(),
      utils.weightLog.weekTable.invalidate(),
    ]);
  const refreshPlan = () =>
    Promise.all([
      utils.weightLog.phases.invalidate(),
      utils.weightLog.weekTable.invalidate(),
    ]);
  // Each mutation refetches before its call's promise settles, so a sent
  // value gives way to the saved one without a blank frame.
  const upsert = api.weightLog.upsertWeighIn.useMutation({
    onSuccess: refreshWeighIns,
  });
  const remove = api.weightLog.deleteWeighIn.useMutation({
    onSuccess: refreshWeighIns,
  });
  const restore = api.weightLog.restoreWeighIn.useMutation({
    onSuccess: refreshWeighIns,
  });
  const changeRate = api.weightLog.changeRate.useMutation({
    onSuccess: refreshPlan,
  });
  // Every write settles through its own promise. TanStack Query runs a
  // `mutate` call's own callbacks only for the latest call on a hook, so two
  // quick edits would leave the first cell saving, with no status or undo.
  const [inFlight, setInFlight] = useState(0);
  const write = <Result,>(
    request: Promise<Result>,
    done: (result: Result) => void,
    fail: (error: unknown) => void,
  ) => {
    setInFlight((count) => count + 1);
    void request
      .then(done, fail)
      .finally(() => setInFlight((count) => count - 1));
  };
  const busy = inFlight > 0;

  const dayLabel = (date: string) =>
    formatDay(date, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
    });
  const weekLabel = (week: string) => labelOfWeek(week, today);
  const cellLabel = (cell: SheetCell) =>
    cell.kind === "day"
      ? `Weigh-in, ${dayLabel(cell.date)}`
      : `${cell.kind === "target" ? "Target" : "lbs/w"}, week of ${weekLabel(cell.week)}`;

  /** Where an opened cell starts: a refused draft, the value, or a carry. */
  const editingFor = (cell: SheetCell): Editing => {
    const key = cellKey(cell);
    if (failed[key] !== undefined) {
      return { cell, key, text: failed[key], prefilled: false };
    }
    if (cell.kind === "day") {
      const weight = weightOn(cell.date);
      if (weight !== null) {
        return { cell, key, text: weight.toFixed(1), prefilled: false };
      }
      if (cell.date === today && carried) {
        return { cell, key, text: carried.pounds.toFixed(1), prefilled: true };
      }
      return { cell, key, text: "", prefilled: false };
    }
    const row = rowByWeek.get(cell.week)!;
    // The cell reads a rate to one decimal, but the field opens on the two
    // the plan is edited to, so 0.25 opens as 0.25, not 0.3.
    return {
      cell,
      key,
      text:
        cell.kind === "target"
          ? row.target!.toFixed(1)
          : row.poundsPerWeek!.toFixed(2),
      prefilled: false,
    };
  };
  const open = (cell: SheetCell) => setEditing(editingFor(cell));

  // Go to date opens its day once the row is on the page.
  if (
    openWhenLoaded !== null &&
    rowByWeek.has(weekStartOf(openWhenLoaded)) &&
    !(
      todayWeekQuery.isFetching ||
      jumpWeekQuery.isFetching ||
      tableQuery.isFetching
    )
  ) {
    setOpenWhenLoaded(null);
    if (dayEditable(openWhenLoaded, today)) {
      setEditing(editingFor({ kind: "day", date: openWhenLoaded }));
    }
  }

  const jump = (date: string) => {
    const day = date > today ? today : date;
    const phase = phaseHolding(day, phases, runningId);
    if (phase) setChosenPhaseId(phase.id);
    setJumpDate(day);
    setEditing(null);
    setOpenWhenLoaded(day);
  };

  const editFor = (cell: SheetCell, text: string): SheetEdit => {
    if (cell.kind === "day") {
      return weighInEdit(cell.date, text, weightOn(cell.date));
    }
    const row = rowByWeek.get(cell.week)!;
    if (cell.kind === "rate") {
      return rateEdit(cell.week, text, row.poundsPerWeek!);
    }
    return targetEdit(
      cell.week,
      text,
      row.target!,
      row.target! - row.poundsPerWeek!,
    );
  };

  const send = (cell: SheetCell, edit: SheetEdit, text: string) => {
    const key = cellKey(cell);
    const refused = (error: unknown, fallback: string) => {
      setFailed((current) => ({ ...current, [key]: text }));
      setStatus({ message: failure(error, fallback), undo: null });
    };
    if (edit.type === "saveWeighIn" || edit.type === "deleteWeighIn") {
      const before = weightOn(edit.date);
      const excluded = excludedOn(edit.date);
      const sent = edit.type === "saveWeighIn" ? edit.pounds.toFixed(1) : "";
      setPending((current) => ({ ...current, [key]: sent }));
      // A later edit of the same cell owns it from then on.
      const settle = () =>
        setPending((current) =>
          current[key] === sent ? without(current, [key]) : current,
        );
      const day = dayLabel(edit.date);
      if (edit.type === "deleteWeighIn") {
        write(
          remove.mutateAsync({ date: edit.date }),
          () => {
            settle();
            setStatus({
              message: `Deleted ${pounds(before)} lb from ${day}.`,
              undo: {
                kind: "weighIn",
                date: edit.date,
                before,
                after: null,
                excluded,
              },
            });
          },
          (error) => {
            settle();
            refused(error, "The weigh-in didn't delete. Try again.");
          },
        );
        return;
      }
      write(
        upsert.mutateAsync({ date: edit.date, pounds: edit.pounds }),
        () => {
          settle();
          setStatus({
            message:
              before === null
                ? `Saved ${sent} lb for ${day}.`
                : `Changed ${day} from ${pounds(before)} to ${sent} lb.`,
            undo: {
              kind: "weighIn",
              date: edit.date,
              before,
              after: edit.pounds,
              excluded,
            },
          });
        },
        (error) => {
          settle();
          refused(error, "The weigh-in didn't save. Try again.");
        },
      );
      return;
    }
    if (edit.type !== "changeRate" || !tableData) return;
    const row = rowByWeek.get(edit.week)!;
    const previous = row.target! - row.poundsPerWeek!;
    const target = previous + edit.poundsPerWeek;
    const moved = target - row.target!;
    const later = (rows ?? []).some(
      (item) => item.week > edit.week && item.target !== null,
    );
    const sentCells = {
      [cellKey({ kind: "target", week: edit.week })]: pounds(target),
      [cellKey({ kind: "rate", week: edit.week })]: rate(edit.poundsPerWeek),
    };
    const { phaseId, revision } = tableData;
    setPending((current) => ({ ...current, ...sentCells }));
    setPlanLanding(true);
    const settle = () => {
      setPlanLanding(false);
      setPending((current) =>
        without(
          current,
          Object.keys(sentCells).filter(
            (item) => current[item] === sentCells[item],
          ),
        ),
      );
    };
    // The revision travels with the edit, so the server refuses it if
    // another tab changed the plan since this page loaded it.
    write(
      changeRate.mutateAsync({
        phaseId,
        weekStart: edit.week,
        poundsPerWeek: edit.poundsPerWeek,
        revision,
      }),
      () => {
        settle();
        setStatus({
          message: `Set the week of ${weekLabel(edit.week)} to ${pounds(target)} lb at ${rate(edit.poundsPerWeek)} lb/wk.${later ? ` Later targets moved ${rate(moved)} lb.` : ""}`,
          undo: {
            kind: "rate",
            phaseId,
            week: edit.week,
            before: row.poundsPerWeek!,
            after: edit.poundsPerWeek,
          },
        });
      },
      (error) => {
        settle();
        if (isConflict(error)) void refreshPlan();
        refused(error, "The plan didn't change. Try again.");
      },
    );
  };
  /**
   * End the open cell's edit. A message comes back when the text can't be
   * sent, and Return or Tab keep the cell open on it. Leaving the cell keeps
   * the text in it, marked, so nothing typed is lost.
   */
  const commit = (
    cell: SheetCell,
    text: string,
    how: CommitHow,
    typed: boolean,
  ): string | null => {
    const key = cellKey(cell);
    if (editing?.key !== key) return null;
    // A carried weigh-in saves only on Return, as the form's check did.
    if (editing.prefilled && !typed && how !== "enter") {
      setEditing(null);
      return null;
    }
    const edit = editFor(cell, text);
    if (edit.type === "invalid") {
      setStatus({ message: edit.message, undo: null });
      if (how !== "blur") return edit.message;
      setFailed((current) => ({ ...current, [key]: text }));
      setEditing(null);
      return null;
    }
    setFailed((current) => without(current, [key]));
    setEditing(null);
    if (how === "enter") focusAfter.current = key;
    if (edit.type !== "none") send(cell, edit, text);
    return null;
  };

  const cancel = (cell: SheetCell) => {
    const key = cellKey(cell);
    setFailed((current) => without(current, [key]));
    setEditing(null);
    focusAfter.current = key;
  };

  const order = editableCells(allRows, today, { plan: !planLanding });
  const tab = (
    cell: SheetCell,
    text: string,
    back: boolean,
    typed: boolean,
  ) => {
    const index = order.findIndex((item) => cellKey(item) === cellKey(cell));
    const next = order[index + (back ? -1 : 1)];
    if (index === -1 || !next) return "end" as const;
    if (commit(cell, text, "tab", typed) !== null) return "invalid" as const;
    open(next);
    return "moved" as const;
  };

  const runUndo = (change: SheetChange) => {
    const request = undoOf(change);
    const undone = (message: string) => setStatus({ message, undo: null });
    const undoFailed = (error: unknown) =>
      setStatus({
        message: failure(error, "The undo didn't go through. Try again."),
        undo: change,
      });
    switch (request.mutation) {
      case "changeRate": {
        const revision = phasesQuery.data?.revision;
        if (!revision) return;
        setPlanLanding(true);
        write(
          changeRate.mutateAsync({ ...request.input, revision }),
          () => {
            setPlanLanding(false);
            undone(
              `Put the week of ${weekLabel(request.input.weekStart)} back to ${rate(request.input.poundsPerWeek)} lb/wk.`,
            );
          },
          (error) => {
            setPlanLanding(false);
            if (isConflict(error)) void refreshPlan();
            undoFailed(error);
          },
        );
        return;
      }
      case "deleteWeighIn":
        write(
          remove.mutateAsync(request.input),
          () =>
            undone(`Removed the weigh-in for ${dayLabel(request.input.date)}.`),
          undoFailed,
        );
        return;
      case "restoreWeighIn":
        write(
          restore.mutateAsync(request.input),
          () =>
            undone(
              `Put ${dayLabel(request.input.date)} back to ${pounds(request.input.pounds)} lb${request.input.excluded ? ", still left out of the weekly average" : ""}.`,
            ),
          (error) => {
            if (isConflict(error)) void refreshWeighIns();
            undoFailed(error);
          },
        );
        return;
      case "upsertWeighIn":
        write(
          upsert.mutateAsync(request.input),
          () =>
            undone(
              `Put ${dayLabel(request.input.date)} back to ${pounds(request.input.pounds)} lb.`,
            ),
          undoFailed,
        );
        return;
    }
  };

  // A button's ref: Return and Escape hand focus back to the cell. The page
  // opens at the top: the owner enters most weigh-ins through a Shortcut,
  // so the table doesn't scroll to this week.
  const cellRef = (key: string) => (node: HTMLElement | null) => {
    if (node && focusAfter.current === key) {
      focusAfter.current = null;
      node.focus({ preventScroll: true });
    }
  };

  /** One editable cell: a button that turns into an input. */
  const editableCell = ({
    cell,
    text,
    readout,
    name,
    isToday = false,
    disabled = false,
    tooltip,
  }: {
    cell: SheetCell;
    text: string;
    readout: ReactNode;
    name: string;
    isToday?: boolean;
    disabled?: boolean;
    tooltip?: string;
  }) => {
    const key = cellKey(cell);
    if (editing?.key === key) {
      return (
        <>
          {/* Keeps the column as wide as it was. */}
          <span aria-hidden className="invisible block px-1.5 py-1.5">
            {text || " "}
          </span>
          <CellInput
            key={key}
            label={cellLabel(cell)}
            initialText={editing.text}
            prefilled={editing.prefilled}
            today={isToday}
            onCommit={(value, how, typed) => commit(cell, value, how, typed)}
            onCancel={() => cancel(cell)}
            onTab={(value, back, typed) => tab(cell, value, back, typed)}
          />
        </>
      );
    }
    const button = (
      <button
        ref={cellRef(key)}
        type="button"
        disabled={disabled}
        aria-label={name}
        aria-current={isToday ? "date" : undefined}
        onClick={() => open(cell)}
        className={cn(
          "block w-full scroll-ml-28 px-1.5 py-1.5 text-right tabular-nums transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-500 disabled:cursor-default disabled:hover:bg-transparent dark:hover:bg-white/10 dark:focus-visible:ring-neutral-300",
          TOUCH_CELL,
          isToday && TODAY_RING,
        )}
      >
        {readout}
      </button>
    );
    if (!tooltip) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  };

  /** What a cell reads while it isn't open: sent, refused, or saved. */
  const readoutFor = (key: string, saved: string) => {
    if (pending[key] !== undefined) {
      return {
        text: pending[key],
        node: (
          <span className="text-muted-foreground">{pending[key] || " "}</span>
        ),
        note: ", saving",
      };
    }
    if (failed[key] !== undefined) {
      return {
        text: failed[key],
        node: (
          <span className="text-red-700 underline decoration-dotted dark:text-red-400">
            {failed[key] || " "}
          </span>
        ),
        note: ", not saved",
      };
    }
    return { text: saved, node: saved || " ", note: "" };
  };

  const renderRows = (
    tableRows: WeekTableRow[],
    rowColors: WeekRowColors[],
    phaseStart: string | null,
  ) =>
    tableRows.map((row, rowIndex) => {
      const fills = rowColors[rowIndex];
      const current = row.week === currentWeek;
      const future = row.week > currentWeek;
      const plan = planEditable(row);
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
          <td className="sticky left-0 z-[2] w-9 min-w-9 bg-white py-1.5 pl-3 text-right text-muted-foreground dark:bg-neutral-800 sm:w-10 sm:min-w-10 sm:pl-4">
            {phaseStart ? weekNumber(row.week, phaseStart) : null}
          </td>
          <th
            scope="row"
            className={cn(
              "sticky left-9 z-[2] bg-white py-0 pl-1 pr-2 text-left dark:bg-neutral-800 sm:left-10",
              current ? "font-medium" : "font-normal",
            )}
          >
            <span className="inline-block px-2 py-1.5">
              {weekLabel(row.week)}
            </span>
          </th>
          {row.weights.map((weight, day) => {
            const date = addDays(row.week, day);
            const cell: SheetCell = { kind: "day", date };
            const key = cellKey(cell);
            const excluded = row.excludedDays.includes(day);
            const fill = fills?.days[day] ?? null;
            const isToday = date === today;
            const saved = weight === null ? "" : pounds(weight);
            const shown = readoutFor(key, saved);
            const struck = excluded && shown.text === saved && weight !== null;
            return (
              <td
                key={day}
                style={fillStyle(fill)}
                className={cn("relative p-0 text-right", fill && FILLED)}
              >
                {dayEditable(date, today) ? (
                  editableCell({
                    cell,
                    text: shown.text,
                    readout: struck ? (
                      <span className="text-muted-foreground line-through">
                        {saved}
                      </span>
                    ) : (
                      shown.node
                    ),
                    name: `${cellLabel(cell)}${isToday ? ", today" : ""}, ${shown.text ? `${shown.text} lb` : "empty"}${struck ? ", left out of the weekly average" : ""}${shown.note}`,
                    isToday,
                    tooltip: struck
                      ? "Left out of the weekly average"
                      : undefined,
                  })
                ) : (
                  <span className={cn("block px-1.5 py-1.5", TOUCH_CELL)}>
                    {saved || " "}
                  </span>
                )}
              </td>
            );
          })}
          {COLUMNS.map((column, index) => {
            const value = row[column.key];
            const fill = fills?.[column.key] ?? null;
            const editableKind =
              column.key === "target"
                ? "target"
                : column.key === "poundsPerWeek"
                  ? "rate"
                  : null;
            let content: ReactNode = column.format(value);
            if (editableKind && plan) {
              const cell: SheetCell = { kind: editableKind, week: row.week };
              const shown = readoutFor(cellKey(cell), column.format(value));
              content = editableCell({
                cell,
                text: shown.text,
                readout: shown.node,
                name: `${cellLabel(cell)}, ${shown.text}${editableKind === "target" ? " lb" : ""}${shown.note}`,
                disabled: planLanding,
              });
            }
            return (
              <td
                key={column.key}
                style={fillStyle(fill)}
                className={cn(
                  "text-right last:pr-3 sm:last:pr-4",
                  editableKind && plan
                    ? "relative p-0"
                    : cn("px-1.5 py-1.5", editableKind && TOUCH_CELL),
                  index === 0 &&
                    "border-l border-neutral-200 dark:border-neutral-700",
                  fill && FILLED,
                )}
              >
                {content}
              </td>
            );
          })}
        </tr>
      );
    });

  const table = (
    label: string,
    tableRows: WeekTableRow[],
    rowColors: WeekRowColors[],
    phaseStart: string | null,
  ) => (
    <div className="overflow-x-auto">
      <table
        aria-label={label}
        className="w-full min-w-max border-separate border-spacing-0 text-xs tabular-nums"
      >
        <thead>
          <tr className="text-muted-foreground [&>th]:border-b [&>th]:border-neutral-200 dark:[&>th]:border-neutral-700">
            <th
              scope="col"
              className="sticky left-0 z-[2] w-9 min-w-9 bg-white py-2 pl-3 text-right font-normal dark:bg-neutral-800 sm:w-10 sm:min-w-10 sm:pl-4"
            >
              <span aria-hidden>#</span>
              <span className="sr-only">Week number</span>
            </th>
            <th
              scope="col"
              className="sticky left-9 z-[2] bg-white py-2 pl-3 pr-2 text-left font-normal dark:bg-neutral-800 sm:left-10"
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
        <tbody>{renderRows(tableRows, rowColors, phaseStart)}</tbody>
      </table>
    </div>
  );

  // The open cell explains a carried value or an excluded weigh-in. A
  // message about the last change, and its Undo, wait until it closes.
  let hint: string | null = null;
  if (editing?.prefilled && carried) {
    const from = relativeDayLabel(carried.date, today).replace(
      /^Yesterday$/,
      "yesterday",
    );
    hint = `Filled in from ${from}. Not saved yet.`;
  } else if (
    editing?.cell.kind === "day" &&
    rowByWeek
      .get(weekStartOf(editing.cell.date))
      ?.excludedDays.includes(dayIndex(editing.cell.date))
  ) {
    hint = "This weigh-in stays left out of the weekly average.";
  }
  const message = hint ?? status?.message ?? null;
  const undo = hint ? null : (status?.undo ?? null);

  let body: ReactNode;
  if (phasesQuery.isError || tableQuery.isError) {
    body = (
      <LoadFailed
        message="The weekly table failed to load."
        onRetry={() =>
          void (phasesQuery.isError
            ? phasesQuery.refetch()
            : tableQuery.refetch())
        }
        retrying={phasesQuery.isFetching || tableQuery.isFetching}
      />
    );
  } else if (!phasesLoaded || (shownPhaseId !== null && !rows)) {
    body = (
      <div className="flex flex-col gap-2 px-3 sm:px-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        {looseRows.length ? (
          <div>
            <p className="mb-1 px-3 text-xs text-muted-foreground sm:px-4">
              Outside every phase
            </p>
            {table("Weeks outside every phase", looseRows, looseColors, null)}
          </div>
        ) : null}
        {shownPhase && rows
          ? table(
              `Weeks of ${shownPhase.label}`,
              rows,
              colors,
              shownPhase.start,
            )
          : null}
      </div>
    );
  }

  // The phase picker and Go to date sit in the page header's nav. Without
  // the header (in tests), they sit above the table.
  const controls = (
    <>
      <Select
        // "" shows the placeholder and keeps the Select controlled while
        // the phases load.
        value={shownPhaseId ?? ""}
        onValueChange={(next) => {
          setChosenPhaseId(next);
          setEditing(null);
        }}
        disabled={!phases.length}
      >
        <SelectTrigger
          aria-label="Phase"
          className="h-9 w-auto min-w-0 flex-1 gap-2 text-xs lg:max-w-sm lg:flex-none"
        >
          <SelectValue placeholder="Phase" />
        </SelectTrigger>
        <SelectContent className="ph-no-capture ph-mask font-sans">
          {phases.map((phase) => (
            <SelectItem key={phase.id} value={phase.id}>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: PHASE_COLORS[phase.kind] }}
                />
                <span className="truncate">{phase.label}</span>
                <span className="shrink-0 text-muted-foreground">
                  Cycle {cycles.get(phase.id)} ·{" "}
                  {phaseWeekCount(phase.start, phase.end)} wk
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* The native date input lies invisible over the button, so a tap
            opens the phone's own picker. Any date up to today, in a phase
            or not, opens its day for typing. */}
      <div className="relative shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none h-9 w-9 gap-1.5 px-0 text-xs sm:w-auto sm:px-3"
        >
          <CalendarBlankIcon aria-hidden className="h-4 w-4" />
          <span className="hidden sm:inline">Go to date</span>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Input
              type="date"
              aria-label="Go to date"
              max={today}
              value={jumpDate ?? ""}
              className="absolute inset-0 h-full min-w-0 cursor-pointer appearance-none border-0 opacity-0 shadow-none"
              onClick={openPicker}
              onChange={(event) => {
                if (event.target.value) jump(event.target.value);
              }}
            />
          </TooltipTrigger>
          <TooltipContent className="sm:hidden">Go to date</TooltipContent>
        </Tooltip>
      </div>
    </>
  );

  return (
    <EditorSection title="Weeks" showTitle={false} cardClassName="px-0 sm:px-0">
      {headerSlot ? (
        createPortal(controls, headerSlot)
      ) : (
        <div className="mb-3 flex flex-wrap items-center gap-2 px-3 sm:px-4">
          {controls}
        </div>
      )}
      {body}
      {/* One status line for every cell. It floats above the bottom of the
          screen, where it stays in view however far down the table the
          edited row is. It never touches the screen's edge and only fades
          in: iOS Safari latches a solid toolbar strip under fixed UI that
          reaches the bottom edge. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
      >
        {message ? (
          <div className="pointer-events-auto flex max-w-md items-center gap-1 rounded-full border border-neutral-200 bg-white py-1 pl-4 pr-1 text-xs shadow-md duration-200 animate-in fade-in-0 dark:border-neutral-700 dark:bg-neutral-800">
            <span className="py-1">{message}</span>
            {undo ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1 px-2 text-xs"
                disabled={busy}
                onClick={() => runUndo(undo)}
              >
                <ArrowCounterClockwiseIcon aria-hidden className="h-4 w-4" />
                Undo
              </Button>
            ) : null}
            {hint ? null : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Dismiss"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setStatus(null)}
                  >
                    <XIcon aria-hidden className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dismiss</TooltipContent>
              </Tooltip>
            )}
          </div>
        ) : null}
      </div>
    </EditorSection>
  );
}
