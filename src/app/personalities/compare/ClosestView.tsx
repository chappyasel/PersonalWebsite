import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

import {
  type Person,
  type Snapshot,
  closestProfiles,
  recordFor,
  traitColors,
  traits,
} from "./model";
import styles from "./prototype.module.css";

export default function ClosestView({
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
  // Inspect a match without changing whose ranked list is being shown.
  const [matchId, setMatchId] = useState<string>();
  const ranked = closestProfiles(focus, people, preference, norms);
  const selected = ranked.find((row) => row.person.id === matchId) ?? ranked[0];
  const maximum = Math.max(
    1,
    Math.ceil(Math.max(...ranked.map((row) => row.distance), 0) * 2) / 2,
  );
  const source = recordFor(focus, preference);
  const matchSource = selected && recordFor(selected.person, preference);
  const omitted =
    people.filter((person) => person.id !== focus.id).length - ranked.length;
  return (
    <div className={`${styles.aggregateLayout} ${styles.closestLayout}`}>
      <section>
        <div className={styles.chartHeading}>
          <div>
            <span className={styles.eyebrow}>
              PERSONALITY SIMILARITY / ALL FIVE TRAITS
            </span>
            <h2>Closest to {focus.name}</h2>
          </div>
        </div>
        <p className={styles.aggregateNote}>
          {ranked.length} people ranked from smallest to largest difference.
          Smaller distances mean more similar scores. Choose anyone in
          &quot;Closest to&quot; to see their list.
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
          <span>RMS Δz</span>
        </div>
        <fieldset aria-label={`People ranked by similarity to ${focus.name}`}>
          {ranked.map(({ person, distance }, index) => (
            <Button
              key={person.id}
              variant="ghost"
              className={styles.distanceRow}
              aria-pressed={person.id === selected?.person.id}
              aria-label={`${index + 1}. ${person.name}, distance ${distance.toFixed(3)} from ${focus.name}. Compare traits.`}
              onClick={() => setMatchId(person.id)}
            >
              <span className={styles.distanceName}>
                <span className={styles.matchRank}>{index + 1}</span>
                {person.name}
              </span>
              <span className={styles.distanceTrack} aria-hidden="true">
                <span
                  style={{
                    width: `${(distance / maximum) * 100}%`,
                    background:
                      person.group === "You"
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
        </fieldset>
        {!ranked.length && (
          <p className={styles.aggregateNote}>
            No comparable people in this selection. Show more people or choose a
            reference person with all five scores.
          </p>
        )}
        {omitted > 0 && (
          <p className={styles.fine}>
            {omitted} comparisons omitted because both people need all five
            valid scores.
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
          Distance = √[sum of the five squared score differences in trait SD
          units ÷ 5]. Zero means identical scores. Every trait has equal weight.
          This describes score similarity, not relationship compatibility, and
          does not adjust for trait correlations.
        </p>
      </section>
      {selected && source && matchSource ? (
        <Card className={`${styles.details} ${styles.matchDetails}`}>
          <span className={styles.eyebrow}>
            COMPARE WITH {focus.name.toUpperCase()}
          </span>
          <h2>{selected.person.name}</h2>
          <div className={styles.aggregateNumber}>
            {selected.distance.toFixed(2)}
            <small>RMS difference in trait SD units</small>
          </div>
          <table className={styles.matchTable}>
            <caption>
              Raw scores and signed differences. A positive Δ means{" "}
              {selected.person.name} scored higher.
            </caption>
            <thead>
              <tr>
                <th scope="col">Trait</th>
                <th scope="col">{focus.name}</th>
                <th scope="col">{selected.person.name}</th>
                <th scope="col">Δ in SD</th>
              </tr>
            </thead>
            <tbody>
              {traits.map((trait) => {
                const a = source.scores[trait]!;
                const b = matchSource.scores[trait]!;
                const delta = (b - a) / norms[trait].sd;
                return (
                  <tr key={trait}>
                    <th scope="row">
                      <span style={{ color: traitColors[trait] }}>{trait}</span>
                    </th>
                    <td>{a}</td>
                    <td>{b}</td>
                    <td>
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className={styles.fine}>
            {focus.name}: {source.label}
            <br />
            {selected.person.name}: {matchSource.label}
          </p>
          <Button
            className={styles.matchAction}
            variant="outline"
            onClick={() => onFocus(selected.person.id)}
          >
            See {selected.person.name}&apos;s ranked list
          </Button>
        </Card>
      ) : (
        <Card className={styles.details}>
          <h2>{focus.name}</h2>
          <p className={styles.fine}>
            Select more people to compare their scores with this profile.
          </p>
        </Card>
      )}
    </div>
  );
}
