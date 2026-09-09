import type { SystemStatus } from "./systemStatus";

/**
 * The dot's colour: the hues RichTextRenderer already gives the same Notion
 * colours, at dot strength instead of a 14% wash over the words. Kept in a
 * .tsx file because tailwind.config.ts scans only those; a class string in a
 * .ts module never reaches the stylesheet.
 */
export const SYSTEM_STATUS_DOT: Readonly<Record<SystemStatus, string>> = {
  implementing: "text-emerald-500/75 dark:text-emerald-400/75",
  partial: "text-blue-500/75 dark:text-blue-400/75",
  next: "text-amber-500/80 dark:text-amber-400/80",
  "not-yet": "text-red-500/70 dark:text-red-400/70",
};

/**
 * The dot element's only text: a no-break space. Unicode line breaking
 * forbids a break before it, so the dot stays on the last line of a title
 * that wraps. Chrome wraps before an inline-block, and before an empty
 * inline box with padding, even with a word joiner in front; a phone-width
 * title left the dot alone on a line both ways. The space also supplies
 * about half the gap between the last word and the dot.
 */
export const STATUS_DOT_GLUE = "\u00a0";

/**
 * A 9px dot painted 1px in from the right edge of the glue's box, with no
 * label of its own: the caller names it (a tooltip, or nothing when it is
 * decoration beside a label). Put STATUS_DOT_GLUE inside.
 *
 * The circle is centred on the arrow icon that follows it, not on the
 * inline box: Georgia Pro's content area sits 0.66px higher than the
 * arrow's centre (measured on the World Model row), so the circle is pushed
 * down by that much. Owner's eye caught it as "1px too high". The 1px inset
 * from the right is the same eye: painted flush, the dot sat as close to
 * the arrow as to the name it belongs to, so it moves toward the name and
 * the arrow stays where it was (the box does not change width).
 */
export function statusDotClassName(status: SystemStatus, extra = ""): string {
  return `inline whitespace-nowrap bg-[radial-gradient(circle_closest-side,currentColor_92%,transparent)] bg-[length:9px_9px] bg-[position:right_1px_top_calc(50%+0.66px)] bg-no-repeat pl-[9px] ${SYSTEM_STATUS_DOT[status]} ${extra}`.trim();
}
