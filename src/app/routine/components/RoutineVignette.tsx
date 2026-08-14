import styles from "../routine.module.css";
import type { TimelineEntry } from "../types";
import Image from "next/image";

export default function RoutineVignette({
  entries,
}: {
  entries: readonly TimelineEntry[];
}) {
  return (
    <aside aria-hidden="true" className={styles.vignette} data-routine-vignette>
      <div className={styles.skyGlow} />
      <div className={styles.city}>
        <span className={styles.sutro} />
        <span className={styles.bridge} />
      </div>

      <figure className={`${styles.photo} ${styles.photoPrimary}`}>
        <Image
          src="/images/stacks/v8/systems-home-office.webp"
          alt=""
          width={256}
          height={192}
          sizes="(max-width: 640px) 35vw, 180px"
        />
      </figure>
      <figure className={`${styles.photo} ${styles.photoSecondary}`}>
        <Image
          src="/images/stacks/v8/systems-supplements.webp"
          alt=""
          width={240}
          height={120}
          sizes="(max-width: 640px) 29vw, 150px"
        />
      </figure>
      <figure className={`${styles.photo} ${styles.photoTertiary}`}>
        <Image
          src="/images/stacks/v8/systems-sf-dusk.webp"
          alt=""
          width={192}
          height={144}
          sizes="(max-width: 640px) 24vw, 120px"
        />
      </figure>

      <div className={styles.clock}>
        <span className={styles.clockBellLeft} />
        <span className={styles.clockBellRight} />
        <span className={styles.clockFace}>3:45</span>
        <span className={styles.clockFootLeft} />
        <span className={styles.clockFootRight} />
      </div>

      <div className={styles.clipboard}>
        <div className={styles.clip} />
        <div className={styles.sheet}>
          <p className={styles.sheetEyebrow}>Core daily routine</p>
          <div className={styles.scheduleRows}>
            {entries.map((entry, index) => (
              <div
                key={`${entry.time}-${entry.title}-${index}`}
                className={styles.scheduleRow}
                data-routine-schedule-row
              >
                <span className={styles.checkmark}>{index < 3 ? "✓" : ""}</span>
                <time>{entry.time}</time>
                <span>{entry.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.shelf} />
    </aside>
  );
}
