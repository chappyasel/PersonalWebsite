"use client";

import Link from "next/link";
import { useState } from "react";

import {
  assessmentTime,
  traitDifferences,
} from "~/lib/personalities/comparisons";

import { Card } from "~/components/ui/card";

import ProfileSelect from "./ProfileSelect";
import styles from "./direct.module.css";
import { type Snapshot, recordsByDate, traitColors, traits } from "./model";

export default function ChangesView({
  data,
  personId,
  onPerson,
}: {
  data: Snapshot;
  personId: string;
  onPerson: (id: string) => void;
}) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [trait, setTrait] = useState("all");
  const person =
    data.people.find((p) => p.id === personId) ??
    data.people.find((p) => p.group === "You") ??
    data.people[0];
  if (!person)
    return (
      <Card className={styles.empty}>
        Add a person and their results to explore changes over time.
      </Card>
    );
  const records = person.records
    .flatMap((record) => {
      const time = assessmentTime(record.takenOn);
      return time === null ? [] : [{ record, time }];
    })
    .sort(
      (a, b) =>
        a.time - b.time || (a.record.id ?? "").localeCompare(b.record.id ?? ""),
    );
  const dateOptions = recordsByDate(records.map(({ record }) => record)).map(
    (record) => ({ value: record.id!, label: record.label }),
  );
  const from = records.find((r) => r.record.id === fromId) ?? records[0];
  const to =
    records.find((r) => r.record.id === toId && r.time >= (from?.time ?? 0)) ??
    records.at(-1);
  const chosen = trait === "all" ? traits : traits.filter((t) => t === trait);
  const differences =
    from && to ? traitDifferences(from.record.scores, to.record.scores) : [];
  const largest = [...differences].sort(
    (a, b) => Math.abs(b.delta) - Math.abs(a.delta),
  )[0];
  const first = records[0]?.time ?? 0,
    last = records.at(-1)?.time ?? first;
  const range = last - first;
  const x = (time: number) =>
    range ? 65 + ((time - first) / range) * 610 : 370;
  const y = (score: number) => 330 - ((score - 24) / 96) * 280;
  const ticks = [...new Set(records.map((r) => r.time))];
  return (
    <section className={styles.container}>
      <header className={styles.heading}>
        <h2>What changed over time?</h2>
        <p>
          Each point is a saved test. Compare dates using the same score scale.
        </p>
      </header>
      <div className={styles.changeControls}>
        <ProfileSelect
          label="Person"
          value={person.id}
          options={data.people.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) => {
            onPerson(id);
            setFromId("");
            setToId("");
          }}
        />
        <ProfileSelect
          label="Traits"
          value={trait}
          options={[
            { value: "all", label: "All five traits" },
            ...traits.map((t) => ({ value: t, label: t })),
          ]}
          onChange={setTrait}
        />
      </div>
      {!records.length ? (
        <Card className={styles.empty}>
          No dated IPIP-120 results yet.{" "}
          <Link href="/personalities/history">View saved results</Link> to
          review their dates and score formats.
        </Card>
      ) : (
        <>
          {records.length < 2 && (
            <p className={styles.summary}>
              Only one comparable result is saved. Add another test to see
              changes.
            </p>
          )}
          <div className={styles.legend}>
            {chosen.map((t) => (
              <span key={t}>
                <i style={{ background: traitColors[t] }} />
                {t}
              </span>
            ))}
          </div>
          <div className={styles.plotScroll}>
            <svg
              className={styles.timeline}
              viewBox="0 0 750 395"
              role="img"
              aria-label={`${person.name}'s personality scores over time`}
            >
              <title>{`${person.name}'s dated IPIP-120 results`}</title>
              {[24, 48, 72, 96, 120].map((tick) => (
                <g key={tick} className={styles.grid}>
                  <line x1={65} x2={675} y1={y(tick)} y2={y(tick)} />
                  <text x={48} y={y(tick) + 4} textAnchor="end">
                    {tick}
                  </text>
                </g>
              ))}
              {ticks.map((time, i) => (
                <g key={time} className={styles.grid}>
                  <line x1={x(time)} x2={x(time)} y1={50} y2={330} />
                  <text x={x(time)} y={355 + (i % 2) * 20} textAnchor="middle">
                    {new Date(time).toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </text>
                </g>
              ))}
              {chosen.map((t) => (
                <g key={t}>
                  <polyline
                    fill="none"
                    stroke={traitColors[t]}
                    strokeWidth={2}
                    opacity={0.75}
                    points={records
                      .filter((r) => Number.isFinite(r.record.scores[t]))
                      .map((r) => `${x(r.time)},${y(r.record.scores[t]!)}`)
                      .join(" ")}
                  />
                  {records
                    .filter((r) => Number.isFinite(r.record.scores[t]))
                    .map((r) => (
                      <g key={r.record.id}>
                        <circle
                          cx={x(r.time)}
                          cy={y(r.record.scores[t]!)}
                          r={6}
                          fill="white"
                          stroke={traitColors[t]}
                          strokeWidth={2}
                          strokeDasharray={
                            r.record.dateEstimated ? "2 2" : undefined
                          }
                        />
                        <circle
                          cx={x(r.time)}
                          cy={y(r.record.scores[t]!)}
                          r={2}
                          fill={traitColors[t]}
                        />
                        <title>
                          {`${t}: ${r.record.scores[t]} / 120 · ${r.record.label}`}
                        </title>
                      </g>
                    ))}
                </g>
              ))}
              <text
                x={15}
                y={190}
                transform="rotate(-90 15 190)"
                textAnchor="middle"
                className={styles.axis}
              >
                Raw score · 24–120
              </text>
            </svg>
          </div>
          {from && to && (
            <>
              <div className={styles.dateControls}>
                <ProfileSelect
                  label="From"
                  value={from.record.id!}
                  options={dateOptions}
                  onChange={(id) => {
                    setFromId(id);
                    const selected = records.find((r) => r.record.id === id);
                    if (selected && selected.time > to.time) setToId(id);
                  }}
                />
                <ProfileSelect
                  label="To"
                  value={to.record.id!}
                  options={dateOptions}
                  onChange={(id) => {
                    setToId(id);
                    const selected = records.find((r) => r.record.id === id);
                    if (selected && selected.time < from.time) setFromId(id);
                  }}
                />
              </div>
              {largest && records.length > 1 && (
                <p className={styles.summary}>
                  {largest.delta === 0 ? (
                    "No differences in the five trait totals between these results."
                  ) : (
                    <>
                      Largest change: <strong>{largest.trait}</strong>,{" "}
                      {Math.abs(largest.delta)} points{" "}
                      {largest.delta > 0 ? "higher" : "lower"}.
                    </>
                  )}
                </p>
              )}
              <div className={styles.deltaCards}>
                {differences.map((d) => (
                  <Card key={d.trait} className={styles.delta}>
                    <span style={{ color: traitColors[d.trait] }}>
                      {d.trait}
                    </span>
                    <strong>
                      {d.delta > 0 ? "+" : ""}
                      {d.delta}
                    </strong>
                    <small>
                      {d.left} → {d.right} / 120
                    </small>
                  </Card>
                ))}
              </div>
              <p className={styles.note}>
                From {from.record.label} to {to.record.label}. Lines connect
                recorded results; they do not estimate scores between tests.
                Retest differences can reflect context or measurement variation.
              </p>
            </>
          )}
          <p className={styles.note}>
            Dashed markers indicate estimated dates. Month-only dates are
            positioned in the middle of the month; their exact order relative to
            other tests that month is uncertain. Undated results and other score
            formats remain in{" "}
            <Link href="/personalities/history">People & history</Link>.
          </p>
        </>
      )}
    </section>
  );
}
