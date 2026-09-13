"use client";

import { useState } from "react";

import { dateLabel, norms, traits } from "~/lib/personalities/data";
import type { SharedSnapshot } from "~/lib/personalities/sharing";

import { Card } from "~/components/ui/card";

import DirectCompare from "./compare/DirectCompare";
import PairedCurve from "./compare/PairedCurve";
import styles from "./personalities.module.css";

export default function SharedResults({
  snapshot,
}: {
  snapshot: SharedSnapshot;
}) {
  const [personId, setPersonId] = useState("");
  const people = snapshot.results.flatMap((result, index) =>
    result.testVersion === "ipip-120" &&
    result.scoreKind === "raw" &&
    result.scoreMax === 120
      ? [
          {
            id: String(index),
            name:
              snapshot.results.filter((r) => r.label === result.label).length >
              1
                ? `${result.label} · Result ${index + 1}${result.takenOn ? ` · ${dateLabel(result.takenOn)}` : ""}`
                : result.label,
            group: "",
            records: [
              {
                id: String(index),
                takenOn: result.takenOn,
                dateEstimated: result.dateEstimated,
                source: "",
                ref: "",
                label: result.takenOn
                  ? dateLabel(result.takenOn)
                  : "Shared result",
                scores: result.scores,
              },
            ],
          },
        ]
      : [],
  );
  const extent = Math.max(
    3.2,
    ...traits.flatMap((trait) =>
      [
        ...(snapshot.anonymous?.scores[trait] ?? []),
        ...people.map((p) => p.records[0]!.scores[trait]),
      ].map(
        (score) =>
          Math.abs((score - norms[trait].mean) / norms[trait].sd) + 0.2,
      ),
    ),
  );
  return (
    <div className="space-y-6">
      {people.length < 2 &&
        snapshot.anonymous &&
        snapshot.anonymous.count > 0 && (
          <p className="text-sm">
            Gray dots: {snapshot.anonymous.count} others
          </p>
        )}
      {snapshot.results.map((result, index) =>
        people.length >= 2 &&
        people.some((p) => p.id === String(index)) ? null : (
          <Card key={index} className={styles["history-card"]}>
            <h2>{result.label}</h2>
            {result.takenOn && (
              <p>
                {dateLabel(result.takenOn)}
                {result.dateEstimated ? " · Estimated date" : ""}
              </p>
            )}
            <p>
              {result.testVersion} ·{" "}
              {result.scoreKind === "raw"
                ? `Raw scores out of ${result.scoreMax}`
                : result.scoreKind}
            </p>
            <div className={styles["score-grid"]}>
              {traits.map((trait) => (
                <div key={trait}>
                  <span>{trait}</span>
                  <strong>
                    {result.scores[trait]}
                    {result.scoreKind === "raw" ? "" : "%"}
                  </strong>
                </div>
              ))}
            </div>
            {people.length === 1 &&
              snapshot.anonymous &&
              result.testVersion === "ipip-120" &&
              result.scoreKind === "raw" &&
              result.scoreMax === 120 && (
                <div className="mt-6 space-y-4">
                  {traits.map((trait) => (
                    <div key={trait}>
                      <h3>{trait}</h3>
                      <PairedCurve
                        trait={trait}
                        left={{
                          name: result.label,
                          z:
                            (result.scores[trait] - norms[trait].mean) /
                            norms[trait].sd,
                        }}
                        extent={extent}
                        anonymous={snapshot.anonymous!.scores[trait].map(
                          (score) =>
                            (score - norms[trait].mean) / norms[trait].sd,
                        )}
                      />
                    </div>
                  ))}
                  <p className="text-sm">
                    Curves use the saved reference means and standard
                    deviations, not the distribution of these friends and
                    family. These reference norms have not been validated across
                    test providers. Higher scores mean more of a trait, not a
                    better result.
                  </p>
                </div>
              )}
          </Card>
        ),
      )}
      {people.length >= 2 && (
        <DirectCompare
          data={{ people, norms, sources: [] }}
          personId={personId}
          onPerson={setPersonId}
          onAssessment={() => undefined}
          readOnly
          anonymous={snapshot.anonymous}
        />
      )}
    </div>
  );
}
