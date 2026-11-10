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
 * satori (`next/og`). It keeps the table's light theme, fills, rules,
 * headers, and the red ring on today's cell. A notification image never
 * follows dark mode, so the card is always light.
 *
 * The iPhone shows the card about 350 pt wide in an expanded notification,
 * and that is where the owner reads it. So the card is set for that width,
 * not the editor's: it leaves out Orig and its Gap (`CARD_COLUMNS`), keeps
 * 2 px between a cell's text and its edge, drops the gutter and border
 * around the table, and sets SF Pro Display at 18 px, the size at which the
 * widest cell's text just fits. That lands near 8.5 pt at 350 pt wide. The
 * editor's 12 px with all its columns would land near 5.6 pt.
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

const FONT_SIZE = 18;
const LINE_HEIGHT = 22;
const PADDING_Y = 4;
const CAPTION_SIZE = 13;
const CAPTION_HEIGHT = 18;
const HEADER_HEIGHT = 26;
const ROW_HEIGHT = 28;
/**
 * The space between a cell's text and its edge, so two numbers side by
 * side sit about a space apart.
 */
const CELL_PAD = 2;
/**
 * A day or summary cell: 50 px holds the widest text at 18 px, "Target"
 * (2.75 em), just ahead of "178.6" and "+0.30" in medium (2.70 em).
 */
const NUMBER_WIDTH = 50 + CELL_PAD * 2;
/** The card's left edge to the `#` column's text. */
const EDGE_PAD = 2;
/** `#`: two digits in medium. */
const INDEX_WIDTH = EDGE_PAD + 23;
/** Week: "May 31" in medium, or "May 31, 2030" with a year. */
const WEEK_PAD_LEFT = 4;
const WEEK_PAD_RIGHT = 2;
const WEEK_WIDTH = WEEK_PAD_LEFT + 60 + WEEK_PAD_RIGHT;
const WEEK_WIDTH_WITH_YEAR = WEEK_PAD_LEFT + 112 + WEEK_PAD_RIGHT;
/** Today's ring, thinner than the pad so it clears the text. */
const RING = 1.5;

/**
 * The editor's summary columns less the original target and its gap. Both
 * change only when the plan does, so they say the least about a weigh-in.
 */
export const CARD_COLUMNS = SUMMARY_COLUMNS.filter(
  (column) =>
    column.key !== "originalTarget" && column.key !== "gapToOriginalTarget",
);

const showsYear = (card: WeekCard) =>
  card.rows.some((item) => item.row.week.slice(0, 4) !== card.date.slice(0, 4));

/** The card's size in device pixels, which the route hands to satori. */
export function cardSize(card: WeekCard) {
  const width =
    INDEX_WIDTH +
    (showsYear(card) ? WEEK_WIDTH_WITH_YEAR : WEEK_WIDTH) +
    NUMBER_WIDTH * (DAY_NAMES.length + CARD_COLUMNS.length) +
    1; // Avg's left rule
  const height =
    PADDING_Y * 2 +
    CAPTION_HEIGHT +
    HEADER_HEIGHT +
    1 +
    card.rows.length * (ROW_HEIGHT + 1) -
    1;
  return { width: px(width), height: px(height) };
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
function TodayRing() {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: px(ROW_HEIGHT),
        border: `${px(RING)}px solid ${TODAY}`,
      }}
    />
  );
}

const indexStyle: CSSProperties = {
  paddingLeft: px(EDGE_PAD),
  paddingRight: 0,
};
const weekStyle: CSSProperties = {
  justifyContent: "flex-start",
  paddingLeft: px(WEEK_PAD_LEFT),
  paddingRight: px(WEEK_PAD_RIGHT),
};
const avgEdge = (index: number): CSSProperties =>
  index === 0 ? { borderLeft: `${px(1)}px solid ${RULE}` } : {};
const summaryWidth = (index: number) => NUMBER_WIDTH + (index === 0 ? 1 : 0);

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
      {CARD_COLUMNS.map((column, index) => (
        <Cell
          key={column.key}
          {...cell}
          width={summaryWidth(index)}
          style={avgEdge(index)}
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
      {CARD_COLUMNS.map((column, index) => (
        <Cell
          key={column.key}
          {...cell}
          width={summaryWidth(index)}
          style={{
            ...avgEdge(index),
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
        gap: px(12),
        height: px(CAPTION_HEIGHT),
        paddingLeft: px(EDGE_PAD),
        fontSize: px(CAPTION_SIZE),
        lineHeight: `${px(CAPTION_HEIGHT)}px`,
        color: MUTED,
      }}
    >
      {names.map((name) => (
        <div
          key={name.key}
          style={{ display: "flex", alignItems: "center", gap: px(5) }}
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
        flexDirection: "column",
        width: "100%",
        height: "100%",
        paddingTop: px(PADDING_Y),
        paddingBottom: px(PADDING_Y),
        backgroundColor: CARD,
        color: INK,
        fontFamily: "SF Pro Display",
        fontSize: px(FONT_SIZE),
        lineHeight: `${px(LINE_HEIGHT)}px`,
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
  );
}
