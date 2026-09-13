import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

import {
  type Person,
  type Snapshot,
  aggregateDistance,
  recordFor,
  traitColors,
  traits,
  zScore,
} from "./model";
import styles from "./prototype.module.css";

export default function AggregateView({
  people,
  focus,
  preference,
  norms,
  onFocus,
}: {
  people: Person[];
  focus: Person;
  preference: string;
  norms: Snapshot["norms"];
  onFocus: (id: string) => void;
}) {
  const ranked = people
    .flatMap((person) => {
      const record = recordFor(person, preference);
      const distance = record && aggregateDistance(record.scores, norms);
      return distance === undefined ? [] : [{ person, distance }];
    })
    .sort(
      (a, b) =>
        b.distance - a.distance || a.person.name.localeCompare(b.person.name),
    );
  const maximum = Math.max(
    2,
    Math.ceil(Math.max(...ranked.map((row) => row.distance), 0) * 2) / 2,
  );
  const record = recordFor(focus, preference);
  const distance = record && aggregateDistance(record.scores, norms);
  return (
    <div className={styles.aggregateLayout}>
      <section>
        <div className={styles.chartHeading}>
          <div>
            <span className={styles.eyebrow}>
              ALL FIVE TRAITS / ONE DISTANCE
            </span>
            <h2>Distance from the mean</h2>
          </div>
        </div>
        <p className={styles.aggregateNote}>
          Each person&apos;s root-mean-square distance from the five reference
          means, measured in each trait&apos;s standard deviations. Larger
          values mean a profile farther from the means.
        </p>
        <div className={styles.distanceAxis} aria-hidden="true">
          <span>Person</span>
          <div>
            {Array.from({ length: maximum * 2 + 1 }, (_, index) => (
              <span
                key={index}
                style={{ left: `${(index / 2 / maximum) * 100}%` }}
              >
                {(index / 2).toFixed(1)}
              </span>
            ))}
          </div>
          <span>RMS z</span>
        </div>
        <div role="group" aria-label="People ranked by aggregate distance">
          {ranked.map(({ person, distance }) => (
            <Button
              variant="ghost"
              key={person.id}
              className={styles.distanceRow}
              aria-pressed={person.id === focus.id}
              aria-label={`${person.name}, ${distance.toFixed(2)} RMS trait z-score. Inspect person.`}
              onClick={() => onFocus(person.id)}
            >
              <span className={styles.distanceName}>{person.name}</span>
              <span className={styles.distanceTrack} aria-hidden="true">
                <span
                  style={{
                    width: `${(distance / maximum) * 100}%`,
                    background:
                      person.id === "chappy"
                        ? "var(--pc-ink)"
                        : person.group === "Family"
                          ? "#d3753b"
                          : "#289fc4",
                  }}
                />
              </span>
              <strong>{distance.toFixed(2)}</strong>
            </Button>
          ))}
        </div>
        {!ranked.length && (
          <p className={styles.aggregateNote}>
            No complete five-trait profiles in this selection.
          </p>
        )}
        {ranked.length < people.length && (
          <p className={styles.aggregateNote}>
            {people.length - ranked.length} selected people omitted because all
            five valid scores are required.
          </p>
        )}
        <div className={styles.legend}>
          <span>
            <i className={styles.youDot} />
            You
          </span>
          <span>
            <i className={styles.familyDot} />
            Family
          </span>
          <span>
            <i style={{ background: "#289fc4" }} />
            Friends
          </span>
        </div>
        <p className={styles.aggregateNote}>
          0 means all five scores equal their reference means. 1 means a
          root-mean-square difference of one trait standard deviation. This
          aggregate is not a population z-score or percentile; it does not
          account for correlations between traits.
        </p>
      </section>
      <Card className={styles.details}>
        <span className={styles.eyebrow}>SELECTED PERSON</span>
        <h2>{focus.name}</h2>
        <p className={styles.muted}>{record?.label ?? "No scores recorded"}</p>
        <div className={styles.aggregateNumber}>
          {distance?.toFixed(2) ?? "No score"}
          <small>RMS trait z-score</small>
        </div>
        <p className={styles.fine}>Signed distance from each reference mean</p>
        <div className={styles.distanceBreakdown}>
          {traits.map((trait) => {
            const score = record?.scores[trait];
            const z =
              score === undefined ? undefined : zScore(score, norms[trait]);
            return (
              <div key={trait}>
                <span>
                  <i style={{ background: traitColors[trait] }} />
                  {trait}
                </span>
                <strong>
                  {z === undefined
                    ? "Missing"
                    : `${z > 0 ? "+" : ""}${z.toFixed(2)}σ`}
                </strong>
              </div>
            );
          })}
        </div>
        <p className={styles.fine}>
          RMS = √[sum of the five squared z-scores ÷ 5]. All five traits have
          equal weight. Squaring keeps high and low scores from canceling.
        </p>
        <p className={styles.fine}>{record?.ref}</p>
      </Card>
    </div>
  );
}
