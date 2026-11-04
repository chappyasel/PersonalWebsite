import { lengthParts, lengthWords } from "~/lib/booking/page";

import { Count, SwapText } from "~/components/ui/rolling-text";

import styles from "./meet.module.css";

/**
 * "30m" or "1h 30m", each unit at 80% of its number. Screen readers hear
 * the words instead ("30 minutes"), and so does a button's name. `rolls`
 * rolls a change of length: 30m to 45m turns only the digits, and 30m to 1h
 * turns the unit too.
 */
export function Duration({
  minutes,
  rolls = false,
}: {
  minutes: number;
  rolls?: boolean;
}) {
  return (
    <span className="tabular-nums">
      <span aria-hidden>
        {lengthParts(minutes).map(({ value, unit }, i) => (
          <span key={rolls ? i : unit}>
            {i > 0 && " "}
            {rolls ? <Count value={value} /> : value}
            <span className={styles.unit}>
              {rolls ? <SwapText text={unit} /> : unit}
            </span>
          </span>
        ))}
      </span>
      <span className="sr-only">{lengthWords(minutes)}</span>
    </span>
  );
}
