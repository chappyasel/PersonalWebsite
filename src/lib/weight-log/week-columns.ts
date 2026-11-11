import type { WeekRowColors } from "./color-scale";
import { pounds, rate, signed } from "./format";
import type { WeekTableRow } from "./week-table";

/**
 * The weekly table's columns after `#` and Week. The editor's Weeks table
 * and the Log Weight card both draw these, so the card can't drift from the
 * table.
 */

/** The day columns, Monday first. */
export const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The summary columns, after the seven days, in the workbook's order. Each
 * takes its fill from the matching key of the row's colors.
 */
export const SUMMARY_COLUMNS: readonly {
  key: keyof WeekTableRow & keyof WeekRowColors;
  label: string;
  hint: string;
  format: (value: number | null) => string;
}[] = [
  { key: "average", label: "Avg", hint: "Weekly average", format: pounds },
  {
    key: "change",
    label: "+/-",
    hint: "Change from last week's average",
    format: signed,
  },
  {
    key: "target",
    label: "Target",
    hint: "This week's target",
    format: pounds,
  },
  {
    key: "gapToTarget",
    label: "Gap",
    hint: "Weekly average minus target",
    format: signed,
  },
  {
    key: "poundsPerWeek",
    label: "lbs/w",
    hint: "Target minus last week's target",
    format: rate,
  },
  {
    key: "originalTarget",
    label: "Orig",
    hint: "Original target, set when the phase began",
    format: pounds,
  },
  {
    key: "gapToOriginalTarget",
    label: "Gap",
    hint: "Target minus original target",
    format: signed,
  },
];
