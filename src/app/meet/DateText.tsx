import { SwapText } from "~/components/ui/rolling-text";

import styles from "./meet.module.css";

/** "Nov 4th", "2:30p", "in 3h", or "in 3 days" cut at the letters after
 * its numbers: text, number, suffix, text... "Thu, Nov 12th" and "Thu in 3
 * days" cut the same way, so one rolls into the other part by part. */
const SUFFIX = /(\d+)(st|nd|rd|th|a|p|h| days)\b/;

/**
 * A date or a time with the letters after each number (an ordinal's "th",
 * a clock's "a" or "p", an hour's "h", a count's "days") at 80% of its size
 * and ink, as a unit beside its number is. `rolls` rolls a change part by
 * part, so "Nov 4th" to "Nov 5th" turns only the 4. `measure` draws it
 * from attributes (`.measure`), for an unseen copy that adds nothing to the
 * page's text.
 */
export function DateText({
  text,
  rolls = false,
  measure = false,
}: {
  text: string;
  rolls?: boolean;
  measure?: boolean;
}) {
  const parts = text.split(new RegExp(SUFFIX.source, "g"));
  return (
    <>
      {parts.map((part, i) => {
        if (!rolls && part === "") return null;
        const drawn = measure ? null : rolls ? <SwapText text={part} /> : part;
        const t = measure ? part : undefined;
        return i % 3 === 2 ? (
          <span key={i} data-t={t} className={styles.unit}>
            {drawn}
          </span>
        ) : (
          <span key={i} data-t={t}>
            {drawn}
          </span>
        );
      })}
    </>
  );
}
