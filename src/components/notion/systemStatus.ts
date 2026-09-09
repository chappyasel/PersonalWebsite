/**
 * The implementation state of one system in the Seven Layers. The owner
 * authors it in Notion as a background colour on the dropdown's title, the
 * same legend the private doc uses: green = new / implementing, blue =
 * partial, yellow = next up, red = not yet. An unmarked system is live. The
 * systems sync lifts the colour into `status` on the dropdown (and off its
 * words, so the page draws a dot rather than a highlighter wash); the toggle
 * and the legend above the layers draw it from here.
 */
export const SYSTEM_STATUSES = [
  "implementing",
  "partial",
  "next",
  "not-yet",
] as const;

export type SystemStatus = (typeof SYSTEM_STATUSES)[number];

/** Notion annotation colour → status. Any other colour is plain formatting. */
export const STATUS_BY_NOTION_COLOR: Readonly<Record<string, SystemStatus>> = {
  green_background: "implementing",
  blue_background: "partial",
  yellow_background: "next",
  red_background: "not-yet",
};

/** Tooltip copy. Whole phrases, not the legend's shorthand: the dot is the
 * only place a state is named, so "Partial" on its own left the reader to
 * guess partial what. */
export const SYSTEM_STATUS_LABEL: Readonly<Record<SystemStatus, string>> = {
  implementing: "New, implementing now",
  partial: "Partially implemented",
  next: "Next to implement",
  "not-yet": "Not implemented yet",
};
