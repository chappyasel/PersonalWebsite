"use client";

import { useMemo, useState } from "react";

import { clusterProfiles } from "~/lib/personalities/clusters";
import {
  axisDescription,
  describeCluster,
} from "~/lib/personalities/interpretation";
import { personalityPca } from "~/lib/personalities/pca";

import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import { type Person, recordFor, traitColors, traits } from "./model";
import styles from "./pca.module.css";

const colors: Record<string, string> = {
  You: "#182a2a",
  Family: "#b36a35",
  Friends: "#398b82",
};
const clusterColors = [
  "#327fa1",
  "#b36c38",
  "#8b65bd",
  "#339370",
  "#bd5681",
  "#887f31",
];
const pairs = [
  { id: "0,1", label: "PC1 × PC2" },
  { id: "0,2", label: "PC1 × PC3" },
  { id: "1,2", label: "PC2 × PC3" },
];

export default function PcaView({
  cohort,
  people,
  focus,
  onFocus,
}: {
  cohort: Person[];
  people: Person[];
  focus: Person;
  onFocus: (id: string) => void;
}) {
  const [pair, setPair] = useState("0,1");
  const [colorBy, setColorBy] = useState("clusters");
  const [clusterCount, setClusterCount] = useState("auto");
  const [names, setNames] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const result = useMemo(
    () =>
      personalityPca(
        cohort.map((p) => ({
          id: p.id,
          scores: recordFor(p, "")?.scores ?? {},
        })),
      ),
    [cohort],
  );
  const clustered = useMemo(() => {
    if (!result) return null;
    const byId = new Map(cohort.map((person) => [person.id, person]));
    const profiles = result.points.map((point) => {
      const scores = recordFor(byId.get(point.id)!, "")!.scores;
      return {
        id: point.id,
        values: traits.map((trait, j) =>
          result.deviations[j]! > 1e-10
            ? (scores[trait]! - result.means[j]!) / result.deviations[j]!
            : 0,
        ),
      };
    });
    return clusterProfiles(
      profiles,
      clusterCount === "auto" ? undefined : Number(clusterCount),
    );
  }, [result, cohort, clusterCount]);
  if (!result)
    return (
      <Card className={styles.empty}>
        PCA needs at least three complete results with some variation between
        them.
      </Card>
    );
  const [horizontal, vertical] = pair.split(",").map(Number) as [
    number,
    number,
  ];
  const components = [
    result.components[horizontal]!,
    result.components[vertical]!,
  ];
  const captured = components.reduce((sum, c) => sum + c.explained, 0);
  const visible = new Set(people.map((p) => p.id));
  const byId = new Map(cohort.map((p) => [p.id, p]));
  const points = result.points.filter((p) => visible.has(p.id));
  const clusterByPerson = new Map(
    clustered?.clusters.flatMap((cluster) =>
      cluster.members.map((id) => [id, cluster.index] as const),
    ) ?? [],
  );
  const colorFor = (person: Person) =>
    colorBy === "clusters" && clustered
      ? clusterColors[clusterByPerson.get(person.id) ?? 0]!
      : (colors[person.group] ?? colors.Friends);
  const legend =
    colorBy === "clusters" && clustered
      ? clustered.clusters.map(
          (cluster) =>
            [
              `Cluster ${cluster.index + 1}`,
              clusterColors[cluster.index]!,
            ] as const,
        )
      : Object.entries(colors);
  // Equal units on both axes, with bounds fitted to the full cohort so filters don't move dots.
  const extent = Math.max(
    1,
    Math.ceil(
      Math.max(
        ...result.points.flatMap((p) => [
          Math.abs(p.coordinates[horizontal]!),
          Math.abs(p.coordinates[vertical]!),
        ]),
      ) * 1.15,
    ),
  );
  const project = (v: number) => (v * 240) / extent;
  const inspected = hovered ?? focus.id;
  const record = recordFor(focus, "");
  return (
    <div className={styles.layout}>
      <section>
        <div className={styles.heading}>
          <div>
            <h2>Personality map</h2>
            <p>
              {(captured * 100).toFixed(1)}% of the variation captured ·{" "}
              {result.sampleSize} people
            </p>
          </div>
          <div className={styles.controls}>
            <Select value={pair} onValueChange={setPair}>
              <SelectTrigger aria-label="PCA axes">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pairs.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={colorBy} onValueChange={setColorBy}>
              <SelectTrigger aria-label="Color dots by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clusters">Clusters</SelectItem>
                <SelectItem value="groups">Friends / family</SelectItem>
              </SelectContent>
            </Select>
            {colorBy === "clusters" && (
              <Select value={clusterCount} onValueChange={setClusterCount}>
                <SelectTrigger aria-label="Number of clusters">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Auto · {clustered?.k ?? "–"} clusters
                  </SelectItem>
                  {Array.from(
                    {
                      length: Math.max(0, (clustered?.maxClusters ?? 2) - 1),
                    },
                    (_, i) => i + 2,
                  ).map((k) => (
                    <SelectItem key={k} value={String(k)}>
                      {k} clusters
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <label>
              <Checkbox
                checked={names}
                onCheckedChange={(value) => setNames(value === true)}
              />{" "}
              Names
            </label>
          </div>
        </div>
        <svg
          className={styles.map}
          viewBox="0 0 600 600"
          aria-label="Personality profiles projected onto two principal components"
        >
          <title>Personality PCA map</title>
          <desc>
            Each dot is one person. Select a dot to inspect their result. The
            two axes capture {(captured * 100).toFixed(1)} percent of the
            variation in the standardized traits.
          </desc>
          {[-1, -0.5, 0, 0.5, 1].map((fraction) => {
            const v = fraction * extent,
              p = project(v);
            return (
              <g
                key={fraction}
                className={fraction === 0 ? styles.zero : styles.grid}
              >
                <line x1={300 + p} y1={60} x2={300 + p} y2={540} />
                <line x1={60} y1={300 - p} x2={540} y2={300 - p} />
                <text x={300 + p} y={560} textAnchor="middle">
                  {Number(v.toFixed(1))}
                </text>
                <text x={46} y={304 - p} textAnchor="end">
                  {Number(v.toFixed(1))}
                </text>
              </g>
            );
          })}
          <text x={300} y={590} textAnchor="middle" className={styles.axis}>
            PC{horizontal + 1} · {(components[0]!.explained * 100).toFixed(1)}%
          </text>
          <text
            transform="translate(14 300) rotate(-90)"
            textAnchor="middle"
            className={styles.axis}
          >
            PC{vertical + 1} · {(components[1]!.explained * 100).toFixed(1)}%
          </text>
          {[...points]
            .sort(
              (a, b) => Number(a.id === inspected) - Number(b.id === inspected),
            )
            .map((point) => {
              const person = byId.get(point.id)!;
              const x = 300 + project(point.coordinates[horizontal]!),
                y = 300 - project(point.coordinates[vertical]!);
              const active = point.id === inspected,
                selected = point.id === focus.id;
              return (
                <g
                  key={point.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={`${person.name}, PC${horizontal + 1} ${point.coordinates[horizontal]!.toFixed(2)}, PC${vertical + 1} ${point.coordinates[vertical]!.toFixed(2)}`}
                  className={styles.point}
                  onClick={() => onFocus(person.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onFocus(person.id);
                    }
                  }}
                  onMouseEnter={() => setHovered(person.id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(person.id)}
                  onBlur={() => setHovered(null)}
                >
                  <title>
                    {person.name} · {recordFor(person, "")?.label}
                  </title>
                  <circle cx={x} cy={y} r={13} fill="transparent" />
                  {selected && (
                    <circle
                      cx={x}
                      cy={y}
                      r={11}
                      fill="none"
                      stroke={colorFor(person)}
                      strokeWidth={1.5}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={active ? 7 : 5.5}
                    fill={colorFor(person)}
                    stroke="white"
                    strokeWidth={1.5}
                  />
                  {(names || active) && (
                    <text
                      x={x + (x > 460 ? -13 : 13)}
                      y={y - 10}
                      textAnchor={x > 460 ? "end" : "start"}
                      className={styles.name}
                    >
                      {person.name}
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
        <div className={styles.legend}>
          {legend.map(([group, color]) => (
            <span key={group}>
              <i style={{ background: color }} />
              {group}
            </span>
          ))}
          <span>Click a dot to inspect</span>
        </div>
        <p className={styles.note}>
          Nearby dots look similar in these two dimensions. The map leaves out{" "}
          {((1 - captured) * 100).toFixed(1)}% of the variation, so apparent
          neighbors may differ on traits it does not show.
        </p>
      </section>
      <aside className={styles.sidebar}>
        <Card className={styles.card}>
          <h3>What do the axes mean?</h3>
          <p className={styles.note}>
            Traits correlated with each axis. Positive values point right or up;
            negative values point left or down. Neither end is better. The
            numbers are correlations, not percentages.
          </p>
          {components.map((component, index) => (
            <section key={index} className={styles.weights}>
              <h4>
                {index === 0 ? "Horizontal" : "Vertical"} · PC
                {(index === 0 ? horizontal : vertical) + 1}
              </h4>
              <p className={styles.axisReading}>
                <strong>{index === 0 ? "Right" : "Up"}:</strong>{" "}
                {axisDescription(component.coefficients, component.variance)}.
              </p>
              <p className={styles.axisReading}>
                <strong>{index === 0 ? "Left" : "Down"}:</strong>{" "}
                {axisDescription(
                  component.coefficients,
                  component.variance,
                  -1,
                )}
                .
              </p>
              {traits.map((trait, j) => {
                const correlation =
                  component.coefficients[j]! * Math.sqrt(component.variance);
                return (
                  <div className={styles.weight} key={trait}>
                    <span>{trait}</span>
                    <div className={styles.bar}>
                      <i
                        style={{
                          left:
                            correlation < 0
                              ? `${50 + correlation * 50}%`
                              : "50%",
                          width: `${Math.abs(correlation) * 50}%`,
                          background: traitColors[trait],
                        }}
                      />
                    </div>
                    <strong>
                      {correlation >= 0 ? "+" : ""}
                      {correlation.toFixed(2)}
                    </strong>
                  </div>
                );
              })}
            </section>
          ))}
        </Card>
        <Card className={styles.card}>
          <h3>{focus.name}</h3>
          <p className={styles.note}>{record?.label}</p>
          <div className={styles.scores}>
            {traits.map((trait) => (
              <div key={trait}>
                <span>{trait}</span>
                <strong>
                  {record?.scores[trait]} <small>/ 120</small>
                </strong>
              </div>
            ))}
          </div>
        </Card>
        <Card className={styles.card}>
          <h3>All five components</h3>
          {result.components.map((component, i) => (
            <div className={styles.variance} key={i}>
              <span>PC{i + 1}</span>
              <div>
                <i
                  style={{
                    width: `${component.explained * 100}%`,
                    background: [horizontal, vertical].includes(i)
                      ? "#398b82"
                      : "#b4c1bc",
                  }}
                />
              </div>
              <strong>{(component.explained * 100).toFixed(1)}%</strong>
            </div>
          ))}
        </Card>
      </aside>
      {clustered && colorBy === "clusters" && (
        <section
          className={styles.clusterSection}
          aria-label="Personality clusters"
        >
          <div className={styles.clusterHeading}>
            <h3>{clustered.k} exploratory clusters</h3>
            <p>
              Separation score {clustered.silhouette.toFixed(2)} on a −1 to 1
              scale. Values near 0 mean overlap; closer to 1 means clearer
              groups.
            </p>
            <p>
              {clusterCount === "auto"
                ? `Auto compares 2–${Math.max(...clustered.candidates.map((c) => c.k))} clusters and chooses the highest score. `
                : "Cluster count is set manually. "}
              Grouping uses all five standardized traits, so changing the map’s
              axes keeps memberships intact.
            </p>
          </div>
          <div className={styles.clusterCards}>
            {clustered.clusters.map((cluster) => {
              const description = describeCluster(cluster.centroid);
              return (
                <Card className={styles.card} key={cluster.index}>
                  <h3>
                    <span
                      className={styles.clusterDot}
                      style={{ background: clusterColors[cluster.index] }}
                    />
                    Cluster {cluster.index + 1} · {cluster.members.length}{" "}
                    people
                  </h3>
                  <h4 className={styles.clusterLabel}>{description.label}</h4>
                  <p className={styles.note}>
                    On average, {description.description}. Individual members
                    can differ.
                  </p>
                  <div className={styles.scores}>
                    {traits.map((trait, j) => (
                      <div key={trait}>
                        <span>{trait}</span>
                        <strong>
                          {cluster.centroid[j]! >= 0 ? "+" : ""}
                          {cluster.centroid[j]!.toFixed(2)} SD
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className={styles.members}>
                    {cluster.members
                      .map((id) => byId.get(id)!)
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((person) =>
                        visible.has(person.id) ? (
                          <Button
                            key={person.id}
                            variant={
                              focus.id === person.id ? "default" : "outline"
                            }
                            size="sm"
                            onClick={() => onFocus(person.id)}
                          >
                            {person.name}
                          </Button>
                        ) : (
                          <span key={person.id} className={styles.hiddenMember}>
                            {person.name} · hidden
                          </span>
                        ),
                      )}
                  </div>
                </Card>
              );
            })}
          </div>
          <p className={styles.note}>
            K-means finds groups of nearby profiles. These descriptions
            summarize cluster averages relative to this group; they are not
            fixed personality types or AI predictions. New people or different
            test dates can change the groups.
          </p>
        </section>
      )}
      <p className={styles.method}>
        PCA uses one selected IPIP-120 result per person, centered and scaled
        within all {result.sampleSize} profiles. Filters hide dots without
        refitting the axes; changing a test result refits the map. These axes
        describe this group, not universal personality types.{" "}
        {result.constantTraits.length > 0
          ? `Traits with no variation contribute nothing: ${result.constantTraits.join(", ")}.`
          : ""}
      </p>
    </div>
  );
}
