import type { CSSProperties, ReactNode } from "react";

import { PHASE_COLORS } from "~/lib/weight-log/chart";
import type { CellColor } from "~/lib/weight-log/color-scale";
import { pounds, weekLabel } from "~/lib/weight-log/format";
import { addDays } from "~/lib/weight-log/phases";
import type { WeekCard, WeekCardRow } from "~/lib/weight-log/week-card";
import { DAY_NAMES, SUMMARY_COLUMNS } from "~/lib/weight-log/week-columns";

/**
 * The Log Weight Shortcut's week card: a snapshot of the editor's Weeks
 * table (`WeekSheet.tsx`) holding last week's row and this week's, drawn by
 * satori (`next/og`). It copies the table's light theme at a phone's width,
 * in CSS pixels times `SCALE`: SF Pro Display at 12 px, the same columns,
 * fills, rules, and the red ring on today's cell. A notification image never
 * follows dark mode, so the card is always light.
 *
 * Satori lays out flexbox only, so each row is a flex row of fixed-width
 * cells. It also throws on a style value that is undefined, after the route
 * has returned, so every optional style here is spread in only when it has
 * a value.
 */

/** Device pixels per CSS pixel. */
const SCALE = 2;
const px = (value: number) => value * SCALE;

/** The page's light tokens and the table's Tailwind colors. */
const PAGE = "#fafaf9"; // --background, hsl(60 9% 98%)
const INK = "#413c39"; // --foreground, hsl(25 7% 24%)
const MUTED = "#56514d"; // --muted-foreground, hsl(24 6% 32%)
const CARD = "#ffffff";
const RULE = "#e5e5e5"; // neutral-200: the card, the header, and Avg's edge
const ROW_RULE = "#f5f5f5"; // neutral-100: between rows
const TODAY = "#dc2626"; // red-600

/** The page's gutter around the card, trimmed from the phone's 12 px. */
const GUTTER = 8;
const CARD_PADDING_Y = 12;
const CAPTION_HEIGHT = 16;
const CAPTION_GAP = 4;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 28;
/**
 * A day or summary cell: "000.0" at 12 px plus 6 px either side, which is
 * the width the editor's columns settle at.
 */
const NUMBER_WIDTH = 44;
/** `#`: 36 px with 12 px on its left, as `w-9 pl-3`. */
const INDEX_WIDTH = 36;
/** Week: "May 31" plus 12 px before and 16 px after, or with a year. */
const WEEK_WIDTH = 67;
const WEEK_WIDTH_WITH_YEAR = 103;
/** The last column's `pr-3`, past a cell's own 6 px. */
const LAST_EXTRA = 6;

const showsYear = (card: WeekCard) =>
  card.rows.some((item) => item.row.week.slice(0, 4) !== card.date.slice(0, 4));

/** The card's size in device pixels, which the route hands to satori. */
export function cardSize(card: WeekCard) {
  const table =
    INDEX_WIDTH +
    (showsYear(card) ? WEEK_WIDTH_WITH_YEAR : WEEK_WIDTH) +
    NUMBER_WIDTH * (DAY_NAMES.length + SUMMARY_COLUMNS.length) +
    1 + // Avg's left rule
    LAST_EXTRA;
  const body =
    CARD_PADDING_Y * 2 +
    CAPTION_HEIGHT +
    CAPTION_GAP +
    HEADER_HEIGHT +
    1 +
    card.rows.length * (ROW_HEIGHT + 1) -
    1;
  return {
    width: px(GUTTER * 2 + 2 + table),
    height: px(GUTTER * 2 + 2 + body),
  };
}

function fillOf(color: CellColor | null): CSSProperties {
  return color
    ? { backgroundColor: color.light.background, color: color.light.text }
    : {};
}

/** One cell of the table, right-aligned unless it says otherwise. */
function Cell({
  width,
  height,
  rule,
  style,
  children,
}: {
  width: number;
  height: number;
  /** The rule under the cell, if any. */
  rule: string | null;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        position: "relative",
        width: px(width),
        height: px(height + (rule ? 1 : 0)),
        paddingLeft: px(6),
        paddingRight: px(6),
        ...(rule && { borderBottom: `${px(1)}px solid ${rule}` }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The ring on today's cell, inside its edges, as the editor's `ring-inset`. */
function TodayRing() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: px(ROW_HEIGHT),
        border: `${px(2)}px solid ${TODAY}`,
      }}
    />
  );
}

const indexStyle: CSSProperties = { paddingLeft: px(12), paddingRight: 0 };
const weekStyle: CSSProperties = {
  justifyContent: "flex-start",
  paddingLeft: px(12),
  paddingRight: px(16),
};
const avgEdge = (index: number): CSSProperties =>
  index === 0 ? { borderLeft: `${px(1)}px solid ${RULE}` } : {};
const lastPad = (index: number): CSSProperties =>
  index === SUMMARY_COLUMNS.length - 1
    ? { paddingRight: px(6 + LAST_EXTRA) }
    : {};
const summaryWidth = (index: number) =>
  NUMBER_WIDTH +
  (index === 0 ? 1 : 0) +
  (index === SUMMARY_COLUMNS.length - 1 ? LAST_EXTRA : 0);

function HeaderRow({ weekWidth }: { weekWidth: number }) {
  const cell = { height: HEADER_HEIGHT, rule: RULE };
  return (
    <div style={{ display: "flex", color: MUTED }}>
      <Cell {...cell} width={INDEX_WIDTH} style={indexStyle}>
        #
      </Cell>
      <Cell {...cell} width={weekWidth} style={weekStyle}>
        Week
      </Cell>
      {DAY_NAMES.map((day) => (
        <Cell key={day} {...cell} width={NUMBER_WIDTH}>
          {day}
        </Cell>
      ))}
      {SUMMARY_COLUMNS.map((column, index) => (
        <Cell
          key={column.key}
          {...cell}
          width={summaryWidth(index)}
          style={{ ...avgEdge(index), ...lastPad(index) }}
        >
          {column.label}
        </Cell>
      ))}
    </div>
  );
}

function SheetRow({
  item,
  date,
  last,
  weekWidth,
}: {
  item: WeekCardRow;
  date: string;
  last: boolean;
  weekWidth: number;
}) {
  const { row, colors } = item;
  const cell = { height: ROW_HEIGHT, rule: last ? null : ROW_RULE };
  const current = row.week <= date && date <= addDays(row.week, 6);
  return (
    <div
      data-week={row.week}
      style={{ display: "flex", fontWeight: current ? 500 : 400 }}
    >
      <Cell
        {...cell}
        width={INDEX_WIDTH}
        style={{ ...indexStyle, color: MUTED }}
      >
        {item.number === null ? "" : String(item.number)}
      </Cell>
      <Cell {...cell} width={weekWidth} style={weekStyle}>
        {weekLabel(row.week, date)}
      </Cell>
      {row.weights.map((weight, day) => {
        const excluded = weight !== null && row.excludedDays.includes(day);
        const fill = colors.days[day] ?? null;
        return (
          <Cell
            key={day}
            {...cell}
            width={NUMBER_WIDTH}
            style={{
              ...fillOf(fill),
              ...(excluded && { color: MUTED, textDecoration: "line-through" }),
            }}
          >
            {weight === null ? "" : pounds(weight)}
            {addDays(row.week, day) === date ? <TodayRing /> : null}
          </Cell>
        );
      })}
      {SUMMARY_COLUMNS.map((column, index) => (
        <Cell
          key={column.key}
          {...cell}
          width={summaryWidth(index)}
          style={{
            ...avgEdge(index),
            ...lastPad(index),
            ...fillOf(colors[column.key]),
          }}
        >
          {column.format(row[column.key])}
        </Cell>
      ))}
    </div>
  );
}

/**
 * The phase each row's table belongs to, as the editor's phase picker names
 * it, or the editor's own caption for a week outside every phase.
 */
function Caption({ card }: { card: WeekCard }) {
  const names: { key: string; label: string; dot: string | null }[] = [];
  for (const { phase } of card.rows) {
    const key = phase?.id ?? "outside";
    if (names.some((name) => name.key === key)) continue;
    names.push(
      phase
        ? { key, label: phase.label, dot: PHASE_COLORS[phase.kind] }
        : { key, label: "Outside every phase", dot: null },
    );
  }
  return (
    <div
      style={{
        display: "flex",
        gap: px(16),
        height: px(CAPTION_HEIGHT),
        marginBottom: px(CAPTION_GAP),
        paddingLeft: px(12),
        color: MUTED,
      }}
    >
      {names.map((name) => (
        <div
          key={name.key}
          style={{ display: "flex", alignItems: "center", gap: px(8) }}
        >
          {name.dot ? (
            <div
              style={{
                width: px(8),
                height: px(8),
                borderRadius: px(4),
                backgroundColor: name.dot,
              }}
            />
          ) : null}
          {name.label}
        </div>
      ))}
    </div>
  );
}

export function WeekCardImage({ card }: { card: WeekCard }) {
  const weekWidth = showsYear(card) ? WEEK_WIDTH_WITH_YEAR : WEEK_WIDTH;
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        padding: px(GUTTER),
        backgroundColor: PAGE,
        color: INK,
        fontFamily: "SF Pro Display",
        fontSize: px(12),
        lineHeight: `${px(16)}px`,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          paddingTop: px(CARD_PADDING_Y),
          paddingBottom: px(CARD_PADDING_Y),
          backgroundColor: CARD,
          border: `${px(1)}px solid ${RULE}`,
          borderRadius: px(12),
        }}
      >
        <Caption card={card} />
        <HeaderRow weekWidth={weekWidth} />
        {card.rows.map((item, index) => (
          <SheetRow
            key={item.row.week}
            item={item}
            date={card.date}
            last={index === card.rows.length - 1}
            weekWidth={weekWidth}
          />
        ))}
      </div>
    </div>
  );
}
