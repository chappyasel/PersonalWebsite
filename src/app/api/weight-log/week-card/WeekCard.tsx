import type { CSSProperties, ReactNode } from "react";

import { PHASE_COLORS } from "~/lib/weight-log/chart";
import type { CellColor } from "~/lib/weight-log/color-scale";
import { pounds, weekLabel } from "~/lib/weight-log/format";
import { addDays, weekStartOf } from "~/lib/weight-log/phases";
import {
  type WeekCard,
  type WeekCardRow,
  currentRow,
  gridRows,
} from "~/lib/weight-log/week-card";
import { DAY_NAMES, SUMMARY_COLUMNS } from "~/lib/weight-log/week-columns";

/**
 * The Log Weight Shortcut's week card, drawn by satori (`next/og`) in the
 * editor's Weeks table look (`WeekSheet.tsx`): its light theme, fills,
 * rules, number formats, and the red ring on today's cell. A notification
 * image never follows dark mode, so the card is always light.
 *
 * The owner reads it on a phone held upright, where an expanded
 * notification shows it about 360 pt wide. So the card is 360 px wide and
 * as tall as its rows, so 1 px of its layout is about 1 pt on the phone.
 * It has two blocks:
 *
 * 1. A day grid of this week and the two before it, under a caption naming
 *    this week's phase and number, so a day reads against the same day of
 *    the last two weeks.
 * 2. The weekly summary (`CARD_COLUMNS`) for up to five weeks before this
 *    one, this week, and up to five after.
 *
 * In both, a row names its phase only where the phase changes, and the
 * first rows name theirs when it isn't this week's. Labels are Medium,
 * numbers Semibold, and this week's rows Bold, a step up from the rest as
 * the editor's medium current row is from its regular ones.
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
const INK = "#413c39"; // --foreground, hsl(25 7% 24%)
const MUTED = "#56514d"; // --muted-foreground, hsl(24 6% 32%)
const CARD = "#ffffff";
const RULE = "#e5e5e5"; // neutral-200: the header and Avg's edge
const ROW_RULE = "#f5f5f5"; // neutral-100: between rows
const TODAY = "#dc2626"; // red-600

/** The card's width: an expanded iPhone notification's, in points. */
export const CARD_WIDTH = 360;
/** The card's edge to the first and last text. */
const EDGE = 5;
const PADDING_Y = 10;

/** The subsets the route loads: `weight-log-card-fonts.py` makes them. */
export const WEIGHT = { label: 500, number: 600, current: 700 } as const;

/** The table's type, and the day grid's numbers. */
const FONT_SIZE = 14;
const LINE_HEIGHT = 18;
/** The caption's, the column headers', and the phase labels' type. */
const SMALL_SIZE = 12;
/** The day grid's month, over the Monday's day of the month. */
const MONTH_SIZE = 11;

const CAPTION_HEIGHT = 22;
const DAY_HEADER_HEIGHT = 22;
/**
 * The day grid's cells, in whole device pixels. Bold "178.6" is 2.83 em,
 * 39.6 px of a 46 px cell at 14 px, which leaves the ring 1.2 px clear of
 * the text. The week label takes what the seven days leave.
 */
export const DAY_FONT_SIZE = FONT_SIZE;
const DAY_HEIGHT = 36;
const DAY_WIDTH = 46;
const GRID_LABEL_WIDTH = CARD_WIDTH - EDGE - DAY_WIDTH * DAY_NAMES.length;
const STRIP_GAP = 14;
const HEADER_HEIGHT = 24;
const ROW_HEIGHT = 26;
const LABEL_HEIGHT = 22;
/** The space between a cell's text and its edge. */
const CELL_PAD = 4;
/** Today's ring, inside the cell as the editor's `ring-inset`. */
const RING = 2;

/** `#`: two digits in bold, 1.29 em. */
const INDEX_WIDTH = EDGE + 19 + CELL_PAD;
/** Week: "May 31" in bold is 3.44 em. The card never writes a year. */
const WEEK_TEXT = 49;

/**
 * The editor's summary columns less the original target and its gap, which
 * change only when the plan is first set, so they say the least about a
 * weigh-in.
 */
export const CARD_COLUMNS = SUMMARY_COLUMNS.filter(
  (column) =>
    column.key !== "originalTarget" && column.key !== "gapToOriginalTarget",
);

/**
 * A week's Monday with no year, even across New Year: the rows run in
 * order, so "Jan 6" after "Dec 30" is plainly the next year.
 */
export const cardWeekLabel = (week: string) =>
  weekLabel(week, week, { year: false });

/**
 * The summary table's column widths. The number columns share what Week
 * leaves, in whole device pixels so neighbouring fills meet on a pixel.
 */
function columnWidths() {
  const week = WEEK_TEXT + CELL_PAD * 2;
  // Avg's left rule, and the last column's wider pad at the card's edge.
  const rest = CARD_WIDTH - INDEX_WIDTH - week - 1 - (EDGE - CELL_PAD);
  const number = Math.floor((rest * SCALE) / CARD_COLUMNS.length) / SCALE;
  return {
    index: INDEX_WIDTH,
    week: week + rest - number * CARD_COLUMNS.length,
    number,
  };
}

const phaseKey = (item: WeekCardRow) => item.phase?.id ?? "outside";

type Line =
  | { kind: "label"; item: WeekCardRow; rule: boolean }
  | { kind: "row"; item: WeekCardRow; rule: boolean };

/**
 * A block's lines in order, for the day grid or the summary table: a label
 * where the phase changes, and one at the top when the first rows aren't
 * in this week's phase, since the caption names this week's. A row has a
 * rule under it unless a label or the end follows; a label has one over it
 * unless it opens the block.
 */
function linesOf(card: WeekCard, rows: WeekCardRow[]): Line[] {
  const home = phaseKey(currentRow(card));
  const lines: Line[] = [];
  rows.forEach((item, index) => {
    const before = rows[index - 1];
    const changes = before
      ? phaseKey(before) !== phaseKey(item)
      : phaseKey(item) !== home;
    if (changes) lines.push({ kind: "label", item, rule: index > 0 });
    lines.push({ kind: "row", item, rule: false });
  });
  lines.forEach((line, index) => {
    if (line.kind === "row") line.rule = lines[index + 1]?.kind === "row";
  });
  return lines;
}

const gridLines = (card: WeekCard) => linesOf(card, gridRows(card));
const tableLines = (card: WeekCard) => linesOf(card, card.rows);

const linesHeight = (lines: Line[], rowHeight: number) =>
  lines.reduce(
    (sum, line) =>
      sum +
      (line.kind === "row" ? rowHeight : LABEL_HEIGHT) +
      (line.rule ? 1 : 0),
    0,
  );

/** The card's size in device pixels, which the route hands to satori. */
export function cardSize(card: WeekCard) {
  const height =
    PADDING_Y * 2 +
    CAPTION_HEIGHT +
    DAY_HEADER_HEIGHT +
    1 +
    linesHeight(gridLines(card), DAY_HEIGHT) +
    STRIP_GAP +
    HEADER_HEIGHT +
    1 +
    linesHeight(tableLines(card), ROW_HEIGHT);
  return { width: px(CARD_WIDTH), height: px(height) };
}

function fillOf(color: CellColor | null): CSSProperties {
  return color
    ? { backgroundColor: color.light.background, color: color.light.text }
    : {};
}

/** One cell, right-aligned unless it says otherwise. */
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
        paddingLeft: px(CELL_PAD),
        paddingRight: px(CELL_PAD),
        whiteSpace: "nowrap",
        ...(rule && { borderBottom: `${px(1)}px solid ${rule}` }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** The ring on today's cell, inside its edges, as the editor's `ring-inset`. */
function TodayRing({ height }: { height: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: px(height),
        border: `${px(RING)}px solid ${TODAY}`,
      }}
    />
  );
}

function PhaseDot({ color }: { color: string }) {
  return (
    <div
      style={{
        width: px(8),
        height: px(8),
        borderRadius: px(4),
        backgroundColor: color,
      }}
    />
  );
}

/** A phase's dot and name, as the editor's phase picker shows it. */
function PhaseName({ item }: { item: WeekCardRow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: px(6) }}>
      {item.phase ? <PhaseDot color={PHASE_COLORS[item.phase.kind]} /> : null}
      {item.phase ? item.phase.label : "Outside every phase"}
    </div>
  );
}

/** This week's phase on the left, its number and Monday on the right. */
function Caption({ card }: { card: WeekCard }) {
  const item = currentRow(card);
  const week = cardWeekLabel(item.row.week);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: px(CAPTION_HEIGHT),
        paddingLeft: px(EDGE),
        paddingRight: px(EDGE),
        color: MUTED,
        fontSize: px(SMALL_SIZE),
        fontWeight: WEIGHT.label,
      }}
    >
      <PhaseName item={item} />
      <div style={{ display: "flex" }}>
        {item.number === null ? week : `Week ${item.number} · ${week}`}
      </div>
    </div>
  );
}

/** The grid's day names over its seven columns. */
function DayHeader() {
  return (
    <div
      style={{
        display: "flex",
        color: MUTED,
        fontSize: px(SMALL_SIZE),
        fontWeight: WEIGHT.label,
      }}
    >
      <Cell width={GRID_LABEL_WIDTH} height={DAY_HEADER_HEIGHT} rule={RULE} />
      {DAY_NAMES.map((day) => (
        <Cell
          key={day}
          width={DAY_WIDTH}
          height={DAY_HEADER_HEIGHT}
          rule={RULE}
          style={{ justifyContent: "center" }}
        >
          {day}
        </Cell>
      ))}
    </div>
  );
}

/**
 * One week's day cells, as the editor's row reads and colors them, under a
 * label of its Monday: the month over the day.
 */
function DayRow({
  item,
  date,
  rule,
}: {
  item: WeekCardRow;
  date: string;
  rule: boolean;
}) {
  const { row, colors } = item;
  const current = row.week === weekStartOf(date);
  const [month, day] = cardWeekLabel(row.week).split(" ");
  const cell = { height: DAY_HEIGHT, rule: rule ? ROW_RULE : null };
  return (
    <div
      data-grid={row.week}
      style={{
        display: "flex",
        fontSize: px(DAY_FONT_SIZE),
        fontWeight: current ? WEIGHT.current : WEIGHT.number,
      }}
    >
      <Cell
        {...cell}
        width={GRID_LABEL_WIDTH}
        style={{
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingLeft: px(EDGE),
          paddingRight: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            color: MUTED,
            fontSize: px(MONTH_SIZE),
            fontWeight: WEIGHT.label,
            lineHeight: `${px(13)}px`,
          }}
        >
          {month}
        </div>
        <div style={{ display: "flex", lineHeight: `${px(16)}px` }}>{day}</div>
      </Cell>
      <div data-days={row.week} style={{ display: "flex" }}>
        {row.weights.map((weight, index) => {
          const excluded = weight !== null && row.excludedDays.includes(index);
          return (
            <Cell
              key={index}
              {...cell}
              width={DAY_WIDTH}
              style={{
                justifyContent: "center",
                ...fillOf(colors.days[index] ?? null),
                ...(excluded && {
                  color: MUTED,
                  textDecoration: "line-through",
                }),
              }}
            >
              {weight === null ? "" : pounds(weight)}
              {addDays(row.week, index) === date ? (
                <TodayRing height={DAY_HEIGHT} />
              ) : null}
            </Cell>
          );
        })}
      </div>
    </div>
  );
}

/** This week and the two before it, day by day. */
function DayGrid({ card }: { card: WeekCard }) {
  return (
    <div data-block="grid" style={{ display: "flex", flexDirection: "column" }}>
      <DayHeader />
      {gridLines(card).map((line) =>
        line.kind === "label" ? (
          <LabelRow
            key={`label-${line.item.row.week}`}
            item={line.item}
            rule={line.rule}
          />
        ) : (
          <DayRow
            key={line.item.row.week}
            item={line.item}
            date={card.date}
            rule={line.rule}
          />
        ),
      )}
    </div>
  );
}

const avgEdge = (index: number): CSSProperties =>
  index === 0 ? { borderLeft: `${px(1)}px solid ${RULE}` } : {};
const lastPad = (index: number): CSSProperties =>
  index === CARD_COLUMNS.length - 1 ? { paddingRight: px(EDGE) } : {};
/** A summary cell: Avg carries its left rule, the last a wider edge pad. */
const summaryWidth = (widths: ReturnType<typeof columnWidths>, index: number) =>
  widths.number +
  (index === 0 ? 1 : 0) +
  (index === CARD_COLUMNS.length - 1 ? EDGE - CELL_PAD : 0);
const indexStyle: CSSProperties = {
  paddingLeft: px(EDGE),
  color: MUTED,
};
const weekStyle: CSSProperties = { justifyContent: "flex-start" };

function HeaderRow({ widths }: { widths: ReturnType<typeof columnWidths> }) {
  const cell = { height: HEADER_HEIGHT, rule: RULE };
  return (
    <div style={{ display: "flex", color: MUTED, fontWeight: WEIGHT.label }}>
      <Cell {...cell} width={widths.index} style={indexStyle}>
        #
      </Cell>
      <Cell {...cell} width={widths.week} style={weekStyle}>
        Week
      </Cell>
      {CARD_COLUMNS.map((column, index) => (
        <Cell
          key={column.key}
          {...cell}
          width={summaryWidth(widths, index)}
          style={{ ...avgEdge(index), ...lastPad(index) }}
        >
          {column.label}
        </Cell>
      ))}
    </div>
  );
}

/** A phase's name over its first row in the table. */
function LabelRow({ item, rule }: { item: WeekCardRow; rule: boolean }) {
  return (
    <div
      data-phase={phaseKey(item)}
      style={{
        display: "flex",
        alignItems: "flex-end",
        height: px(LABEL_HEIGHT + (rule ? 1 : 0)),
        paddingLeft: px(EDGE),
        paddingBottom: px(3),
        color: MUTED,
        fontSize: px(SMALL_SIZE),
        fontWeight: WEIGHT.label,
        ...(rule && { borderTop: `${px(1)}px solid ${RULE}` }),
      }}
    >
      <PhaseName item={item} />
    </div>
  );
}

/**
 * One week's summary, as the editor's row reads it: a step bolder for this
 * week, muted for a week still to come.
 */
function SummaryRow({
  item,
  date,
  rule,
  widths,
}: {
  item: WeekCardRow;
  date: string;
  rule: boolean;
  widths: ReturnType<typeof columnWidths>;
}) {
  const { row, colors } = item;
  const cell = { height: ROW_HEIGHT, rule: rule ? ROW_RULE : null };
  const thisWeek = weekStartOf(date);
  return (
    <div
      data-week={row.week}
      style={{
        display: "flex",
        fontWeight: row.week === thisWeek ? WEIGHT.current : WEIGHT.number,
        ...(row.week > thisWeek && { color: MUTED }),
      }}
    >
      <Cell {...cell} width={widths.index} style={indexStyle}>
        {item.number === null ? "" : String(item.number)}
      </Cell>
      <Cell {...cell} width={widths.week} style={weekStyle}>
        {cardWeekLabel(row.week)}
      </Cell>
      {CARD_COLUMNS.map((column, index) => (
        <Cell
          key={column.key}
          {...cell}
          width={summaryWidth(widths, index)}
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

export function WeekCardImage({ card }: { card: WeekCard }) {
  const widths = columnWidths();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        paddingTop: px(PADDING_Y),
        paddingBottom: px(PADDING_Y),
        backgroundColor: CARD,
        color: INK,
        fontFamily: "SF Pro Display",
        fontWeight: WEIGHT.number,
        fontSize: px(FONT_SIZE),
        lineHeight: `${px(LINE_HEIGHT)}px`,
      }}
    >
      <Caption card={card} />
      <DayGrid card={card} />
      <div style={{ display: "flex", height: px(STRIP_GAP) }} />
      <div
        data-block="table"
        style={{ display: "flex", flexDirection: "column" }}
      >
        <HeaderRow widths={widths} />
        {tableLines(card).map((line) =>
          line.kind === "label" ? (
            <LabelRow
              key={`label-${line.item.row.week}`}
              item={line.item}
              rule={line.rule}
            />
          ) : (
            <SummaryRow
              key={line.item.row.week}
              item={line.item}
              date={card.date}
              rule={line.rule}
              widths={widths}
            />
          ),
        )}
      </div>
    </div>
  );
}
