import { SwapText } from "~/components/ui/rolling-text";

import styles from "./meet.module.css";

/** "Nov 4th", "2:30p", or "in 3h" cut at the letters after its numbers:
 * text, number, suffix, text... */
const SUFFIX = /(\d+)(st|nd|rd|th|a|p|h)\b/;

/**
 * A date or a time with the letters after each number (an ordinal's "th",
 * a clock's "a" or "p", an hour's "h") at 80% of its size and ink, as a
 * unit beside its number is. `rolls` rolls a change part by part, so "Nov
 * 4th" to "Nov 5th" turns only the 4.
 */
export function DateText({
  text,
  rolls = false,
}: {
  text: string;
  rolls?: boolean;
}) {
  const parts = text.split(new RegExp(SUFFIX.source, "g"));
  return (
    <>
      {parts.map((part, i) => {
        if (!rolls && part === "") return null;
        const drawn = rolls ? <SwapText text={part} /> : part;
        return i % 3 === 2 ? (
          <span key={i} className={styles.unit}>
            {drawn}
          </span>
        ) : (
          <span key={i}>{drawn}</span>
        );
      })}
    </>
  );
}
