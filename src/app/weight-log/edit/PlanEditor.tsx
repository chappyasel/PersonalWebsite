"use client";

import {
  ChartLineUpIcon,
  PlusIcon,
  TargetIcon,
  XIcon,
} from "@phosphor-icons/react";
import { TRPCClientError } from "@trpc/client";
import { type FormEvent, type ReactNode, useState } from "react";

import {
  PHASE_KINDS,
  type PhaseKind,
  addDays,
  phaseName,
  weekStartOf,
} from "~/lib/weight-log/phases";
import {
  MAX_PLAN_WEEKS,
  MAX_POUNDS_PER_WEEK,
  MAX_TARGET,
} from "~/lib/weight-log/plan-edits";
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

type Phase = RouterOutputs["weightLog"]["phases"]["phases"][number];

const KIND_LABELS: Record<PhaseKind, string> = {
  bulk: "Bulk",
  cut: "Cut",
  maintenance: "Maintain",
};

const formatDay = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    ...options,
  });

const longDay = (date: string) =>
  formatDay(date, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const shortDay = (date: string) =>
  formatDay(date, { month: "short", day: "numeric", year: "numeric" });

/** Pounds to two decimals, with a sign, for rates and the shifts they cause. */
function signed(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "0.00";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(2)}`;
}

const weeksBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      (7 * 86_400_000),
  );

/** A number typed in a field, or null when it is empty or not a number. */
function parse(text: string) {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

const validRate = (value: number | null): value is number =>
  value !== null && Math.abs(value) <= MAX_POUNDS_PER_WEEK;
const validPounds = (value: number | null): value is number =>
  value !== null && value > 0 && value <= MAX_TARGET;
const validWeeks = (value: number | null): value is number =>
  value !== null &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= MAX_PLAN_WEEKS;

/**
 * The server's own refusal, such as a week with weigh-ins in the way, or a
 * plain fallback. Refusals name dates, never weights.
 */
function failure(error: unknown, fallback: string) {
  if (
    error instanceof TRPCClientError &&
    !(error.data as { zodError?: unknown } | undefined)?.zodError &&
    ["BAD_REQUEST", "NOT_FOUND", "CONFLICT"].includes(
      (error.data as { code?: string } | undefined)?.code ?? "",
    )
  ) {
    return error.message;
  }
  return fallback;
}

/** The server refused an edit made from a plan or list that has changed since. */
const isConflict = (error: unknown) =>
  error instanceof TRPCClientError &&
  (error.data as { code?: string } | undefined)?.code === "CONFLICT";

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-w-0 flex-col gap-1 text-xs text-muted-foreground ${className ?? ""}`}
    >
      {label}
      {children}
    </label>
  );
}

function Status({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="text-xs text-muted-foreground"
    >
      {children}
    </p>
  );
}

/** Invalidate everything a plan edit can change on the page. */
function useRefreshPlan() {
  const utils = api.useUtils();
  return () =>
    Promise.all([
      utils.weightLog.phases.invalidate(),
      utils.weightLog.weekTable.invalidate(),
    ]);
}

/**
 * The running phase's plan: its weekly rates and its end, and a form to
 * start the next phase (decisions 8 to 12). Every edit goes through
 * `api.weightLog.*`; the server checks the rules again.
 */
export function PlanEditor({ today }: { today: string }) {
  const phasesQuery = api.weightLog.phases.useQuery();
  const phases = phasesQuery.data?.phases ?? [];
  const runningId = phasesQuery.data?.runningId ?? null;
  const running = phases.find((phase) => phase.id === runningId);
  const current = phases.find(
    (phase) => phase.id === phasesQuery.data?.currentId,
  );
  const weeksQuery = api.weightLog.weekTable.useQuery(
    { phaseId: runningId ?? "" },
    { enabled: runningId !== null },
  );
  const planned = (weeksQuery.data?.rows ?? []).filter(
    (row) => row.target !== null,
  );

  // The running phase's forms wait for its weeks; Start a phase only needs
  // the phase list. Keeping it mounted through a refetch keeps its result
  // line on screen after a start.
  let runningPlan: ReactNode = null;
  if (running && weeksQuery.isError) {
    runningPlan = (
      <LoadFailed
        message="The plan failed to load."
        onRetry={() => void weeksQuery.refetch()}
        retrying={weeksQuery.isFetching}
      />
    );
  } else if (running && !weeksQuery.data) {
    runningPlan = (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  } else if (running && weeksQuery.data && planned.length) {
    const { phaseId, revision } = weeksQuery.data;
    runningPlan = (
      <>
        <div>
          <p className="text-sm font-medium">{running.label}</p>
          <p className="text-xs text-muted-foreground">
            {weeksBetween(running.start, addDays(running.end, 1))} weeks, ending{" "}
            {longDay(running.end)}
          </p>
        </div>
        <RateForm
          key={`rate-${running.id}`}
          phaseId={phaseId}
          revision={revision}
          rows={planned}
          today={today}
        />
        <EndForm
          key={`end-${running.id}`}
          phase={running}
          revision={revision}
          rows={planned}
        />
      </>
    );
  }

  let body: ReactNode;
  if (phasesQuery.isError) {
    body = (
      <LoadFailed
        message="The plan failed to load."
        onRetry={() => void phasesQuery.refetch()}
        retrying={phasesQuery.isFetching}
      />
    );
  } else if (!phasesQuery.data) {
    body = (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-700 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0 [&>*]:py-4">
        {runningPlan}
        <StartForm
          current={current ?? null}
          revision={phasesQuery.data.revision}
          today={today}
        />
      </div>
    );
  }

  return (
    <CollapsibleSection
      title="Plan"
      icon={<ChartLineUpIcon className="h-5 w-5" weight="bold" />}
    >
      {body}
    </CollapsibleSection>
  );
}

/**
 * Change one week's lb/wk (decision 11). The form shows how far every later
 * target moves before the owner saves.
 */
function RateForm({
  phaseId,
  revision,
  rows,
  today,
}: {
  phaseId: string;
  revision: string;
  rows: WeekTableRow[];
  today: string;
}) {
  const editable = rows.filter((row) => row.poundsPerWeek !== null);
  const thisWeek = weekStartOf(today);
  const [chosen, setChosen] = useState<string | null>(null);
  // The rows change after a length edit or another tab's. The chosen week
  // can go, or a one-week plan can gain its first week with a rate, so the
  // form falls back to this week, or the last one, whenever its own is gone.
  const row =
    editable.find((item) => item.week === chosen) ??
    editable.find((item) => item.week >= thisWeek) ??
    editable.at(-1);
  const [draft, setDraft] = useState<{ week: string; text: string } | null>(
    null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const refresh = useRefreshPlan();
  const mutation = api.weightLog.changeRate.useMutation();

  // A rate typed for a week that has gone is not a rate for the fallback.
  if (draft !== null && draft.week !== row?.week) setDraft(null);
  if (!row) {
    return (
      <p className="text-xs text-muted-foreground">
        The plan has no week after its first, so there is no lb/wk to change.
      </p>
    );
  }
  const week = row.week;
  const currentRate = row.poundsPerWeek!;
  const value = draft?.week === week ? draft.text : currentRate.toFixed(2);
  const entered = parse(value);
  const moveBy = validRate(entered) ? entered - currentRate : null;
  const changed = moveBy !== null && Math.round(moveBy * 100) !== 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!changed || !validRate(entered) || mutation.isPending) return;
    mutation.mutate(
      { phaseId, weekStart: week, poundsPerWeek: entered, revision },
      {
        onSuccess: () =>
          void refresh().then(() => {
            setDraft(null);
            setStatus(
              `Set ${shortDay(week)} to ${signed(entered)} lb/wk. Targets from that week on moved ${signed(moveBy)} lb.`,
            );
          }),
        onError: (error) => {
          if (isConflict(error)) void refresh();
          setStatus(failure(error, "The rate didn't save. Try again."));
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      aria-label="Weekly rate"
      className="flex flex-col gap-2"
    >
      <h3 className="text-sm font-medium">Weekly rate</h3>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Week" className="flex-1 basis-40">
          <Select
            value={week}
            onValueChange={(next) => {
              setChosen(next);
              setDraft(null);
              setStatus(null);
            }}
          >
            <SelectTrigger aria-label="Week" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="ph-no-capture ph-mask font-sans">
              {editable.map((item) => (
                <SelectItem key={item.week} value={item.week}>
                  {shortDay(item.week)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="lb/wk" className="w-24">
          <Input
            type="number"
            inputMode="decimal"
            step="0.05"
            min={-MAX_POUNDS_PER_WEEK}
            max={MAX_POUNDS_PER_WEEK}
            value={value}
            className="tabular-nums"
            onChange={(event) => {
              setDraft({ week, text: event.target.value });
              setStatus(null);
            }}
          />
        </Field>
        <Button type="submit" disabled={!changed || mutation.isPending}>
          Save rate
        </Button>
      </div>
      <Status>
        {status ??
          (changed
            ? `Targets from ${shortDay(week)} on move ${signed(moveBy)} lb.`
            : entered !== null && !validRate(entered)
              ? `Keep the rate within ${MAX_POUNDS_PER_WEEK} lb/wk either way.`
              : null)}
      </Status>
    </form>
  );
}

/**
 * Move the running phase's end (decision 11). More weeks continue at the
 * last rate; fewer weeks come off the end, and the server refuses a week
 * that has weigh-ins.
 */
function EndForm({
  phase,
  revision,
  rows,
}: {
  phase: Phase;
  revision: string;
  rows: WeekTableRow[];
}) {
  const lastWeek = rows.at(-1)!.week;
  const count = weeksBetween(phase.start, lastWeek) + 1;
  const lastRate = rows.at(-1)!.poundsPerWeek ?? 0;
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const refresh = useRefreshPlan();
  const mutation = api.weightLog.moveEnd.useMutation();

  const value = text ?? String(count);
  const entered = parse(value);
  const valid = validWeeks(entered);
  const newLast = valid ? addDays(phase.start, (entered - 1) * 7) : null;
  const changed = valid && entered !== count;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!changed || !newLast || mutation.isPending) return;
    mutation.mutate(
      { phaseId: phase.id, lastWeek: newLast, revision },
      {
        onSuccess: () =>
          void refresh().then(() => {
            setText(null);
            setStatus(`The plan now ends ${longDay(addDays(newLast, 6))}.`);
          }),
        onError: (error) => {
          if (isConflict(error)) void refresh();
          setStatus(failure(error, "The end didn't move. Try again."));
        },
      },
    );
  };

  let preview: string | null = null;
  if (changed) {
    const difference = entered - count;
    preview =
      difference > 0
        ? `Adds ${difference} ${difference === 1 ? "week" : "weeks"} at ${signed(lastRate)} lb/wk, ending ${longDay(addDays(newLast!, 6))}.`
        : `Removes ${-difference} ${difference === -1 ? "week" : "weeks"} from the end, ending ${longDay(addDays(newLast!, 6))}.`;
  } else if (entered !== null && !valid) {
    preview = `A plan runs 1 to ${MAX_PLAN_WEEKS} weeks.`;
  }

  return (
    <form onSubmit={submit} aria-label="Length" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Length</h3>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Weeks" className="w-24">
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            max={MAX_PLAN_WEEKS}
            value={value}
            className="tabular-nums"
            onChange={(event) => {
              setText(event.target.value);
              setStatus(null);
            }}
          />
        </Field>
        <Button type="submit" disabled={!changed || mutation.isPending}>
          Save length
        </Button>
      </div>
      <Status>{status ?? preview}</Status>
    </form>
  );
}

/**
 * The Mondays a new phase can start on: from the current phase's start, or
 * twelve weeks back if that is later, through half a year ahead. The server
 * accepts any Monday on or after the current phase's start.
 */
function startChoices(current: Phase | null, today: string) {
  const thisWeek = weekStartOf(today);
  let first = addDays(thisWeek, -12 * 7);
  if (current && current.start > first) first = current.start;
  const last = addDays(first > thisWeek ? first : thisWeek, 26 * 7);
  const choices: string[] = [];
  for (let monday = first; monday <= last; monday = addDays(monday, 7)) {
    choices.push(monday);
  }
  return choices;
}

/**
 * Start a phase (decisions 8, 9, 10, and 12). The owner confirms after
 * reading what happens to the current phase. The confirmation belongs to the
 * plan it described: if a refetch brings another current phase or another
 * plan, it lapses and the owner reads the new one before starting.
 */
function StartForm({
  current,
  revision,
  today,
}: {
  current: Phase | null;
  revision: string;
  today: string;
}) {
  const choices = startChoices(current, today);
  const nextMonday = addDays(weekStartOf(today), 7);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PhaseKind>("maintenance");
  const defaultStart = choices.includes(nextMonday) ? nextMonday : choices[0]!;
  const [start, setStart] = useState(defaultStart);
  const [targetText, setTargetText] = useState("");
  const [rateText, setRateText] = useState("0");
  const [weeksText, setWeeksText] = useState("12");
  const [confirmed, setConfirmed] = useState<{
    phaseId: string | null;
    revision: string;
  } | null>(null);
  // Our own start changes the revision too. Between the save and the
  // refetch, the form waits instead of reporting the change as another tab's.
  const [landing, setLanding] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const refresh = useRefreshPlan();
  const mutation = api.weightLog.startPhase.useMutation();

  const target = parse(targetText);
  const weeklyRate = parse(rateText);
  const weeks = parse(weeksText);
  const valid =
    validPounds(target) && validRate(weeklyRate) && validWeeks(weeks);
  const lastWeek = validWeeks(weeks) ? addDays(start, (weeks - 1) * 7) : null;
  const name = lastWeek ? phaseName(kind, start, addDays(lastWeek, 6)) : null;
  const replaces = current?.start === start;
  const currentId = current?.id ?? null;
  const confirming =
    confirmed !== null &&
    confirmed.phaseId === currentId &&
    confirmed.revision === revision;
  const lapsed = confirmed !== null && !confirming;

  const edit = (apply: () => void) => {
    apply();
    setConfirmed(null);
    setStatus(null);
  };

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              // The current phase may have changed since the form last opened.
              setStart(defaultStart);
              setTargetText("");
              setConfirmed(null);
              setOpen(true);
              setStatus(null);
            }}
          >
            <PlusIcon aria-hidden />
            Start a phase
          </Button>
        </div>
        {status ? <Status>{status}</Status> : null}
      </div>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || !lastWeek || mutation.isPending || landing) return;
    if (current && !confirming) {
      setConfirmed({ phaseId: currentId, revision });
      setStatus(null);
      return;
    }
    mutation.mutate(
      {
        kind,
        startDate: start,
        startTarget: target,
        poundsPerWeek: weeklyRate,
        lastWeek,
        // The plan the confirmation described, which the server checks
        // again under its lock.
        currentPhaseId: confirmed?.phaseId ?? currentId,
        revision: confirmed?.revision ?? revision,
      },
      {
        onSuccess: () => {
          setConfirmed(null);
          setLanding(true);
          void refresh().then(() => {
            setLanding(false);
            setOpen(false);
            setStatus(`Started ${name}.`);
          });
        },
        onError: (error) => {
          if (isConflict(error)) void refresh();
          setConfirmed(null);
          setStatus(failure(error, "The phase didn't start. Try again."));
        },
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      aria-label="Start a phase"
      className="flex flex-col gap-3"
    >
      <h3 className="text-sm font-medium">Start a phase</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(5,minmax(0,1fr))]">
        <Field label="Kind">
          <Select
            value={kind}
            onValueChange={(next) => edit(() => setKind(next as PhaseKind))}
          >
            <SelectTrigger aria-label="Kind" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="font-sans">
              {PHASE_KINDS.map((item) => (
                <SelectItem key={item} value={item}>
                  {KIND_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Start">
          <Select
            value={start}
            onValueChange={(next) => edit(() => setStart(next))}
          >
            <SelectTrigger aria-label="Start" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="font-sans">
              {choices.map((monday) => (
                <SelectItem key={monday} value={monday}>
                  {shortDay(monday)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Starting target">
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
            max={MAX_TARGET}
            required
            value={targetText}
            className="tabular-nums"
            onChange={(event) => edit(() => setTargetText(event.target.value))}
          />
        </Field>
        <Field label="lb/wk">
          <Input
            type="number"
            inputMode="decimal"
            step="0.05"
            min={-MAX_POUNDS_PER_WEEK}
            max={MAX_POUNDS_PER_WEEK}
            required
            value={rateText}
            className="tabular-nums"
            onChange={(event) => edit(() => setRateText(event.target.value))}
          />
        </Field>
        <Field label="Weeks">
          <Input
            type="number"
            inputMode="numeric"
            step="1"
            min="1"
            max={MAX_PLAN_WEEKS}
            required
            value={weeksText}
            className="tabular-nums"
            onChange={(event) => edit(() => setWeeksText(event.target.value))}
          />
        </Field>
      </div>
      {name && lastWeek ? (
        <p className="text-xs text-muted-foreground">
          {name}, ending {longDay(addDays(lastWeek, 6))}.
        </p>
      ) : null}
      {confirming && current ? (
        <p className="text-xs">
          {replaces
            ? `This replaces ${current.label}, which starts the same Monday, along with its plan and original targets.`
            : `${current.label} ends ${longDay(addDays(start, -1))}, and this plan replaces its planned weeks from ${shortDay(start)} on.`}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant={confirming ? "destructive" : "default"}
          disabled={!valid || mutation.isPending || landing}
        >
          {confirming ? "Start phase" : "Start"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (!confirming) setOpen(false);
            setConfirmed(null);
          }}
        >
          Cancel
        </Button>
      </div>
      <Status>
        {status ??
          (lapsed
            ? "The plan changed while you were confirming. Check the details and tap Start again."
            : null)}
      </Status>
    </form>
  );
}

/**
 * The set points in order (decision 24). The chart labels them by position,
 * so the list saves whole.
 */
export function SetPointsEditor() {
  const query = api.weightLog.setPoints.useQuery();
  const utils = api.useUtils();
  const mutation = api.weightLog.saveSetPoints.useMutation();
  // A draft remembers the list it started from. The save sends it, and the
  // server refuses if another tab saved a different list since.
  const [draft, setDraft] = useState<{
    base: number[];
    texts: string[];
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const saved = query.data ?? [];
  const base = draft?.base ?? saved;
  const texts = draft?.texts ?? saved.map((pounds) => pounds.toFixed(1));
  const values = texts.map(parse);
  const valid = values.every(validPounds);
  const changed =
    draft !== null &&
    (values.length !== base.length ||
      values.some(
        (value, index) =>
          value === null || Math.round(value * 10) / 10 !== base[index],
      ));

  const update = (next: string[]) => {
    setDraft({ base, texts: next });
    setStatus(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid || !changed || mutation.isPending) return;
    mutation.mutate(
      { pounds: values, previous: base },
      {
        onSuccess: () =>
          void utils.weightLog.setPoints.invalidate().then(() => {
            setDraft(null);
            setStatus("Saved the set points.");
          }),
        onError: (error) => {
          if (isConflict(error)) void utils.weightLog.setPoints.invalidate();
          setStatus(failure(error, "The set points didn't save. Try again."));
        },
      },
    );
  };

  return (
    <CollapsibleSection
      title="Set points"
      icon={<TargetIcon className="h-5 w-5" weight="bold" />}
    >
      {query.isError ? (
        <LoadFailed
          message="The set points failed to load."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : !query.data ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-40" />
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          {texts.length ? (
            <ol className="flex flex-col gap-2">
              {texts.map((text, index) => (
                <li key={index} className="flex items-end gap-2">
                  <Field label={`Set point ${index + 1}`} className="w-28">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="0.1"
                      max={MAX_TARGET}
                      required
                      value={text}
                      className="tabular-nums"
                      onChange={(event) =>
                        update(
                          texts.map((item, at) =>
                            at === index ? event.target.value : item,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove set point ${index + 1}`}
                    onClick={() =>
                      update(texts.filter((_, at) => at !== index))
                    }
                  >
                    <XIcon aria-hidden />
                  </Button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted-foreground">No set points.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={texts.length >= 10}
              onClick={() => update([...texts, ""])}
            >
              <PlusIcon aria-hidden />
              Add
            </Button>
            <Button
              type="submit"
              disabled={!valid || !changed || mutation.isPending}
            >
              Save set points
            </Button>
            {draft !== null ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setStatus(null);
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
          <Status>{status}</Status>
        </form>
      )}
    </CollapsibleSection>
  );
}
