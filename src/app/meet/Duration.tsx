import { lengthParts, lengthWords } from "~/lib/booking/page";

import styles from "./meet.module.css";

/**
 * "30m" or "1h 30m", each unit at 80% of its number. Screen readers hear
 * the words instead ("30 minutes"), and so does a button's name.
 */
export function Duration({ minutes }: { minutes: number }) {
  return (
    <span className="tabular-nums">
      <span aria-hidden>
        {lengthParts(minutes).map(({ value, unit }, i) => (
          <span key={unit}>
            {i > 0 && " "}
            {value}
            <span className={styles.unit}>{unit}</span>
          </span>
        ))}
      </span>
      <span className="sr-only">{lengthWords(minutes)}</span>
    </span>
  );
}
