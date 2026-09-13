"use client";

import { LinkIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { dateLabel } from "~/lib/personalities/data";
import type { AnonymousContext } from "~/lib/personalities/sharing";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";

import PairedCurve from "./PairedCurve";
import ProfileSelect from "./ProfileSelect";
import styles from "./direct.module.css";
import {
  type Snapshot,
  comparisonMetrics,
  recordFor,
  recordsByDate,
  traitColors,
} from "./model";

export default function DirectCompare({
  data,
  personId,
  onPerson,
  onAssessment,
  onShare,
  readOnly = false,
  anonymous,
}: {
  onShare?: (ids: string[]) => void;
  readOnly?: boolean;
  anonymous?: AnonymousContext;
  data: Snapshot;
  personId: string;
  onPerson: (id: string) => void;
  onAssessment: (personId: string, resultId: string) => void;
}) {
  const [otherId, setOtherId] = useState("");
  const people = data.people.filter((person) => person.records.length);
  const left =
    people.find((person) => person.id === personId) ??
    people.find((person) => person.group === "You") ??
    people[0];
  const others = people.filter((person) => person.id !== left?.id);
  const right = others.find((person) => person.id === otherId) ?? others[0];
  if (!left || !right)
    return (
      <Card className={styles.empty}>
        Add IPIP-120 results for at least two people to compare their profiles.
      </Card>
    );
  const a = recordFor(left, "")!,
    b = recordFor(right, "")!;
  const differences = comparisonMetrics(a.scores, b.scores, data.norms);
  const largest = [...differences].sort(
    (a, b) => Math.abs(b.deltaSd) - Math.abs(a.deltaSd),
  )[0];
  const smallest = [...differences].sort(
    (a, b) => Math.abs(a.deltaSd) - Math.abs(b.deltaSd),
  )[0];
  const extent = Math.max(
    3.2,
    ...differences.flatMap((d) =>
      (anonymous?.scores[d.trait] ?? []).map(
        (score) =>
          Math.abs(
            (score - data.norms[d.trait].mean) / data.norms[d.trait].sd,
          ) + 0.2,
      ),
    ),
    ...differences.flatMap((d) => [
      Math.abs(d.leftZ) + 0.2,
      Math.abs(d.rightZ) + 0.2,
    ]),
  );
  const signed = (value: number, digits = 1) =>
    `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
  return (
    <section className={styles.container}>
      {!readOnly && (
        <header className={styles.heading}>
          <h2>How do you differ?</h2>
          <p>
            All five traits, with both results on the same reference curves.
          </p>
        </header>
      )}
      {onShare && a.id && b.id && (
        <Button variant="outline" onClick={() => onShare([a.id!, b.id!])}>
          <LinkIcon aria-hidden="true" />
          Share comparison
        </Button>
      )}
      {(!readOnly || people.length > 2) && (
        <div className={styles.pairControls}>
          {[
            {
              person: left,
              options: people,
              label: "First person",
              change: onPerson,
            },
            {
              person: right,
              options: others,
              label: "Compare with",
              change: setOtherId,
            },
          ].map(({ person, options, label, change }) => (
            <Card key={label} className={styles.pickerCard}>
              <ProfileSelect
                label={label}
                value={person.id}
                options={options.map((p) => ({ value: p.id, label: p.name }))}
                onChange={change}
              />
              {!readOnly && (
                <ProfileSelect
                  label={`${person.name}’s result`}
                  value={person.records[0]!.id!}
                  options={recordsByDate(person.records).map((r) => ({
                    value: r.id!,
                    label: r.label,
                  }))}
                  onChange={(id) => onAssessment(person.id, id)}
                />
              )}
            </Card>
          ))}
        </div>
      )}
      {readOnly && largest && smallest && (
        <div className={styles.gapSummary}>
          {[
            { label: "Biggest gap", gap: largest },
            { label: "Smallest gap", gap: smallest },
          ].map(({ label, gap }) => (
            <Card key={label} className={styles.gapSummaryCard}>
              <span>{label}</span>
              <strong>{gap.trait}</strong>
              <span>
                {Math.abs(gap.deltaSd).toFixed(2)} SD · {Math.abs(gap.delta)}{" "}
                points
              </span>
            </Card>
          ))}
        </div>
      )}
      {!readOnly && largest && (
        <p className={styles.summary}>
          {largest.delta === 0 ? (
            "These results have the same totals on all five traits."
          ) : (
            <>
              Biggest difference: <strong>{largest.trait}</strong>.{" "}
              {largest.delta > 0 ? right.name : left.name} scored{" "}
              {Math.abs(largest.delta)} points higher, a gap of{" "}
              {Math.abs(largest.deltaSd).toFixed(2)} standard deviations.
            </>
          )}
        </p>
      )}
      <div className={styles.legend}>
        <span>
          <i style={{ background: "#182a2a" }} />
          {left.name}
          {readOnly && a.takenOn && (
            <small>
              {dateLabel(a.takenOn)}
              {a.dateEstimated ? " · Estimated" : ""}
            </small>
          )}
        </span>
        <span>
          <i
            style={{
              background: "#398b82",
              borderRadius: 0,
              transform: "rotate(45deg)",
            }}
          />
          {right.name}
          {readOnly && b.takenOn && (
            <small>
              {dateLabel(b.takenOn)}
              {b.dateEstimated ? " · Estimated" : ""}
            </small>
          )}
        </span>
        {readOnly && anonymous && anonymous.count > 0 && (
          <span>
            <i style={{ background: "#8a9292" }} />
            {anonymous.count} others
          </span>
        )}
      </div>
      {!readOnly && (
        <p className={styles.note}>
          Differences below are {right.name} minus {left.name}. Standard
          deviations make gaps comparable across traits.
        </p>
      )}
      <div className={styles.pairedTraits}>
        {differences.map((d) => (
          <Card
            key={d.trait}
            className={`${styles.pairedTrait} ${readOnly ? styles.sharedTrait : ""}`}
          >
            <header className={styles.traitHeader}>
              <h3 style={{ color: traitColors[d.trait] }}>{d.trait}</h3>
              {readOnly ? (
                <div className={styles.gaps}>
                  <strong>{Math.abs(d.deltaSd).toFixed(2)} SD gap</strong>
                  <span>{Math.abs(d.delta)} raw points</span>
                  <span>
                    {Math.abs(d.percentileGap).toFixed(1)} percentile points
                  </span>
                </div>
              ) : (
                <div className={styles.gaps}>
                  <strong>{signed(d.deltaSd, 2)} SD</strong>
                  <span>{signed(d.delta, 0)} raw points</span>
                  <span>{signed(d.percentileGap)} percentile points</span>
                </div>
              )}
            </header>
            <PairedCurve
              trait={d.trait}
              left={{ name: left.name, z: d.leftZ }}
              right={{ name: right.name, z: d.rightZ }}
              extent={extent}
              anonymous={anonymous?.scores[d.trait].map(
                (score) =>
                  (score - data.norms[d.trait].mean) / data.norms[d.trait].sd,
              )}
            />
            {readOnly && (
              <table
                className={styles.sharedMetrics}
                aria-label={`${d.trait} scores and reference estimates`}
              >
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    <th scope="col">Score / 120</th>
                    <th scope="col">Est. percentile</th>
                    <th scope="col">SD from mean</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      person: left,
                      score: d.left,
                      z: d.leftZ,
                      pct: d.leftPercentile,
                      color: "#182a2a",
                    },
                    {
                      person: right,
                      score: d.right,
                      z: d.rightZ,
                      pct: d.rightPercentile,
                      color: "#398b82",
                    },
                  ].map(({ person, score, z, pct, color }) => (
                    <tr key={person.id}>
                      <th scope="row" style={{ color }}>
                        {person.name}
                      </th>
                      <td>{score}</td>
                      <td>{pct.toFixed(1)}</td>
                      <td>{signed(z, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!readOnly && (
              <div className={styles.personReadouts}>
                {[
                  {
                    person: left,
                    score: d.left,
                    z: d.leftZ,
                    pct: d.leftPercentile,
                    color: "#182a2a",
                  },
                  {
                    person: right,
                    score: d.right,
                    z: d.rightZ,
                    pct: d.rightPercentile,
                    color: "#398b82",
                  },
                ].map(({ person, score, z, pct, color }) => (
                  <div key={person.id}>
                    <strong style={{ color }}>{person.name}</strong>
                    <span>{score} / 120 raw</span>
                    <span>{signed(z, 2)} SD from mean</span>
                    <span>Estimated percentile: {pct.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
      {readOnly ? (
        <p className={styles.note}>
          SD = standard deviations from the reference mean. Percentiles are
          reference-curve estimates, not ranks among these friends and family.
          Biggest and smallest gaps are ranked by absolute SD difference.
        </p>
      ) : (
        <p className={styles.note}>
          Difference is {right.name} minus {left.name}. Higher means more of a
          trait, not a better result. Percentiles are normal-curve estimates
          from the saved reference means and standard deviations, not measured
          ranks among your friends. These inherited norms have not been
          validated across test providers. A percentile-point gap is a
          difference between ranks, not a percentage change in personality.
        </p>
      )}
    </section>
  );
}
