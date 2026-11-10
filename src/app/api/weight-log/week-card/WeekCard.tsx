import type { ReactNode } from "react";

import {
  type Fill,
  type WeekSummary,
  pounds,
  signed,
} from "~/lib/weight-log/week-summary";

/**
 * The Log Weight Shortcut's week card, drawn by satori (`next/og`). A
 * notification image never follows dark mode, so the card is always light.
 * Satori throws on a style value that is undefined, after the route has
 * returned, so every optional style here is spread in only when it has a
 * value.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 640;

const INK = "#262626";
const MUTED = "#737373";
const FAINT = "#A3A3A3";
const LINE = "#D4D4D4";
const PAPER = "#F5F5F5";
const EMPTY = "#FFFFFF";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekOf(monday: string) {
  return new Date(`${monday}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fillStyle(fill: Fill | null) {
  return fill
    ? { backgroundColor: fill.background, color: fill.text }
    : { backgroundColor: EMPTY, color: INK };
}

function DayCell({
  day,
  label,
  today,
  future,
}: {
  day: WeekSummary["days"][number];
  label: string;
  today: boolean;
  future: boolean;
}) {
  const filled = day.pounds !== null && !day.excluded;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
        width: 138,
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: today ? 700 : 400,
          color: today ? INK : MUTED,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 138,
          height: 136,
          borderRadius: 16,
          fontSize: 40,
          fontWeight: 700,
          ...(filled
            ? fillStyle(day.fill)
            : { backgroundColor: future ? PAPER : EMPTY, color: FAINT }),
          border: today
            ? `5px solid ${INK}`
            : `2px ${future ? "dashed" : "solid"} ${LINE}`,
          ...(day.excluded && { textDecoration: "line-through" }),
        }}
      >
        {day.pounds === null ? "" : pounds(day.pounds)}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  fill,
  note,
}: {
  label: string;
  value: string;
  fill: Fill | null;
  note?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 252,
      }}
    >
      <div style={{ fontSize: 28, color: MUTED }}>{label}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 112,
          borderRadius: 16,
          fontSize: 54,
          fontWeight: 700,
          border: `2px solid ${LINE}`,
          ...fillStyle(fill),
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 26, color: MUTED, height: 32 }}>{note ?? ""}</div>
    </div>
  );
}

function NoTarget() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: 520,
      }}
    >
      <div style={{ fontSize: 28, color: MUTED }}>Target</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 112,
          borderRadius: 16,
          fontSize: 36,
          color: MUTED,
          border: `2px dashed ${LINE}`,
        }}
      >
        No target this week
      </div>
    </div>
  );
}

export function WeekCard({ summary }: { summary: WeekSummary }) {
  const dash = "–";
  const hasTarget = summary.target !== null;
  const stats: ReactNode[] = [
    <Stat
      key="average"
      label="Average so far"
      value={summary.average === null ? dash : pounds(summary.average)}
      fill={summary.fills.average}
      note={`${summary.counted} of 7 weigh-ins`}
    />,
    hasTarget ? (
      <Stat
        key="target"
        label="Target"
        value={pounds(summary.target!)}
        fill={summary.fills.target}
      />
    ) : (
      <NoTarget key="target" />
    ),
    ...(hasTarget
      ? [
          <Stat
            key="gap"
            label="Gap to target"
            value={
              summary.gapToTarget === null ? dash : signed(summary.gapToTarget)
            }
            fill={summary.fills.gapToTarget}
          />,
        ]
      : []),
    <Stat
      key="change"
      label="Change"
      value={summary.change === null ? dash : signed(summary.change)}
      fill={summary.fills.change}
      note={
        summary.lastWeek === null
          ? "No average last week"
          : `Last week ${pounds(summary.lastWeek)}`
      }
    />,
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "52px 66px",
        backgroundColor: PAPER,
        color: INK,
        fontFamily: "Georgia Pro",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <div style={{ fontSize: 52, fontWeight: 700 }}>
          {`Week of ${weekOf(summary.week)}`}
        </div>
        <div style={{ fontSize: 30, color: MUTED }}>{summary.phase ?? ""}</div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 44,
        }}
      >
        {summary.days.map((day, index) => (
          <DayCell
            key={day.date}
            day={day}
            label={WEEKDAYS[index]!}
            today={day.date === summary.date}
            future={day.date > summary.date}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 52,
        }}
      >
        {stats}
      </div>
    </div>
  );
}
