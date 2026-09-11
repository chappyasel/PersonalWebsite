"use client";

// Four throwaway views on /prototype/personality?variant=A|B|C|D.
// Question: is a focused curve, five-curve overview, or matrix easiest to compare?
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import AggregateView from "./AggregateView";
import {
  type Norm,
  type Person,
  type Snapshot,
  type Trait,
  pctLabel,
  recordFor,
  traitColors,
  traits,
  zScore,
} from "./model";
import styles from "./prototype.module.css";

const variants = [
  { key: "A", name: "One curve" },
  { key: "B", name: "All five" },
  { key: "C", name: "Compare everyone" },
  { key: "D", name: "Overall distance" },
];
const poles: Record<Trait, [string, string]> = {
  Openness: ["Familiar & practical", "Curious & exploratory"],
  Conscientiousness: ["Flexible & spontaneous", "Organized & deliberate"],
  Extraversion: ["Reserved & inward", "Outgoing & energetic"],
  Agreeableness: ["Direct & challenging", "Cooperative & accommodating"],
  Neuroticism: ["Less reactive to stress", "More reactive to stress"],
};

type ViewProps = {
  people: Person[];
  focus: Person;
  preference: string;
  trait: Trait;
  norms: Snapshot["norms"];
  onFocus: (id: string) => void;
  onTrait: (trait: Trait) => void;
};

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.choice}>
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem value={option.value} key={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PrototypeSwitcher({ variant }: { variant: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const change = useCallback(
    (direction: number) => {
      const index = variants.findIndex((v) => v.key === variant);
      const next =
        variants[(index + direction + variants.length) % variants.length]!;
      const query = new URLSearchParams(params.toString());
      query.set("variant", next.key);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [params, pathname, router, variant],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.target instanceof Element &&
          event.target.closest(
            "input, textarea, select, button, [contenteditable], [role=dialog], [role=listbox], [role=slider]",
          ))
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        change(event.key === "ArrowRight" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [change]);
  if (process.env.NODE_ENV === "production") return null;
  return (
    <nav className={styles.switcher} aria-label="Prototype views">
      <Button
        size="icon"
        variant="ghost"
        aria-label="Previous view"
        onClick={() => change(-1)}
      >
        <ArrowLeft />
      </Button>
      <div>
        <small>TRY A VIEW</small>
        <span>
          {variant} / {variants.find((v) => v.key === variant)?.name}
        </span>
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Next view"
        onClick={() => change(1)}
      >
        <ArrowRight />
      </Button>
    </nav>
  );
}

function Curve({
  people,
  focus,
  preference,
  trait,
  norm,
  onFocus,
  compact = false,
}: {
  people: Person[];
  focus: Person;
  preference: string;
  trait: Trait;
  norm: Norm;
  onFocus: (id: string) => void;
  compact?: boolean;
}) {
  const color = traitColors[trait];
  const points = people.flatMap((person) => {
    const score = recordFor(person, preference)?.scores[trait];
    return score === undefined
      ? []
      : [{ person, score, z: zScore(score, norm) }];
  });
  const extent = Math.max(3.2, ...points.map((p) => Math.abs(p.z) + 0.2));
  const x = (z: number) => 40 + ((z + extent) / (2 * extent)) * 760;
  const baseline = compact ? 128 : 215;
  const height = compact ? 95 : 168;
  const y = (z: number) => baseline - Math.exp((-z * z) / 2) * height;
  const curve = Array.from({ length: 161 }, (_, i) => {
    const z = -extent + (i / 160) * extent * 2;
    return `${i === 0 ? "M" : "L"}${x(z)},${y(z)}`;
  }).join(" ");
  const selected = points.find((p) => p.person.id === focus.id);
  const lanes: number[][] = [];
  const plotted = [...points]
    .sort((a, b) => a.z - b.z)
    .map((point) => {
      const px = x(point.z);
      let lane = lanes.findIndex((values) =>
        values.every((previous) => Math.abs(previous - px) > 17),
      );
      if (lane < 0) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane]!.push(px);
      return { ...point, px, py: baseline + 25 + lane * 17 };
    });
  const chartHeight = baseline + Math.max(1, lanes.length) * 17 + 79;
  return (
    <div className={styles.curve}>
      <svg
        viewBox={`0 0 840 ${chartHeight}`}
        role="group"
        aria-label={`${trait} reference bell curve. Dots show ${points.length} people; horizontal position is a z-score.`}
      >
        <path
          d={`${curve} L800,${baseline} L40,${baseline} Z`}
          fill={color}
          opacity="0.09"
        />
        <rect
          x={x(-1)}
          y={20}
          width={x(1) - x(-1)}
          height={baseline - 20}
          fill={color}
          opacity="0.045"
        />
        {[-3, -2, -1, 0, 1, 2, 3].map((z) => (
          <g key={z}>
            <line
              x1={x(z)}
              x2={x(z)}
              y1={20}
              y2={baseline}
              stroke="currentColor"
              opacity={z === 0 ? 0.25 : 0.09}
              strokeDasharray={z === 0 ? undefined : "3 5"}
            />
            <text
              x={x(z)}
              y={chartHeight - 25}
              textAnchor="middle"
              fill="currentColor"
              opacity="0.65"
              fontSize="13"
            >
              {z > 0 ? "+" : ""}
              {z}σ
            </text>
          </g>
        ))}
        <path d={curve} fill="none" stroke={color} strokeWidth="2.5" />
        <line
          x1="40"
          x2="800"
          y1={baseline}
          y2={baseline}
          stroke="currentColor"
          opacity="0.2"
        />
        <text
          x={x(0)}
          y="15"
          textAnchor="middle"
          fontSize="12"
          fill="currentColor"
          opacity="0.5"
        >
          REFERENCE MEAN
        </text>
        {selected && (
          <g>
            <line
              x1={x(selected.z)}
              x2={x(selected.z)}
              y1={y(selected.z)}
              y2={baseline}
              stroke={color}
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            <circle
              cx={x(selected.z)}
              cy={y(selected.z)}
              r="6"
              fill={color}
              stroke="var(--pc-paper)"
              strokeWidth="2"
            />
          </g>
        )}
        {plotted.map((point) => (
          <g
            key={point.person.id}
            role="button"
            tabIndex={0}
            className={styles.dot}
            aria-label={`${point.person.name}, ${trait}, raw ${point.score}, estimated percentile ${pctLabel(point.z)}`}
            onClick={() => onFocus(point.person.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onFocus(point.person.id);
              }
            }}
          >
            <circle cx={point.px} cy={point.py} r="9" fill="transparent" />
            <circle
              cx={point.px}
              cy={point.py}
              r={point.person.id === focus.id ? 6 : 4.5}
              fill={
                point.person.id === "chappy"
                  ? "var(--pc-ink)"
                  : point.person.group === "Family"
                    ? "#d3753b"
                    : color
              }
              stroke={
                point.person.id === focus.id
                  ? "var(--pc-ink)"
                  : "var(--pc-paper)"
              }
              strokeWidth={point.person.id === focus.id ? 2 : 1}
              opacity={point.person.id === focus.id ? 1 : 0.7}
            />
          </g>
        ))}
      </svg>
      <div className={styles.poles}>
        <span>{poles[trait][0]}</span>
        <span>{poles[trait][1]}</span>
      </div>
    </div>
  );
}

function PersonDetails({
  focus,
  preference,
  norms,
  trait,
  onTrait,
}: Pick<ViewProps, "focus" | "preference" | "norms" | "trait" | "onTrait">) {
  const record = recordFor(focus, preference);
  return (
    <Card className={styles.details}>
      <span className={styles.eyebrow}>
        {focus.group === "You" ? "YOUR RESULTS" : focus.group.toUpperCase()}
      </span>
      <h2>{focus.name}</h2>
      <p className={styles.muted}>{record?.label ?? "No scores recorded"}</p>
      <div className={styles.traitSummary}>
        {traits.map((t) => {
          const score = record?.scores[t];
          const pct =
            score === undefined ? null : pctLabel(zScore(score, norms[t]));
          return (
            <Button
              key={t}
              variant="ghost"
              className={styles.summaryRow}
              aria-pressed={trait === t}
              onClick={() => onTrait(t)}
            >
              <span>
                <i style={{ background: traitColors[t] }} />
                {t}
              </span>
              <strong>{pct ?? "No score"}</strong>
            </Button>
          );
        })}
      </div>
      <p className={styles.fine}>
        Estimated percentile under the saved reference model. Higher means more
        of the trait.
      </p>
      <Accordion type="single" collapsible>
        <AccordionItem value="sources">
          <AccordionTrigger>Saved results & sources</AccordionTrigger>
          <AccordionContent>
            {focus.records.map((r) => (
              <div className={styles.record} key={r.source}>
                <strong>{r.label}</strong>
                <p>
                  {traits
                    .map((t) => `${t.slice(0, 1)} ${r.scores[t] ?? "?"}`)
                    .join(" · ")}
                </p>
                <small>{r.ref}</small>
              </div>
            ))}
            <p>
              Assessment dates are not recorded. Neither source is assumed to be
              newer.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

function VariantA(props: ViewProps) {
  const { focus, trait, preference, norms, people, onFocus } = props;
  const score = recordFor(focus, preference)?.scores[trait];
  const z = score === undefined ? undefined : zScore(score, norms[trait]);
  return (
    <div className={styles.focusLayout}>
      <section>
        <div className={styles.chartHeading}>
          <div>
            <span className={styles.eyebrow}>ONE TRAIT, EVERYONE</span>
            <h2>{trait}</h2>
          </div>
          <span
            className={styles.chartNumber}
            style={{ color: traitColors[trait] }}
          >
            {z === undefined ? "No score" : pctLabel(z)}
            <small>{focus.name} · estimated percentile</small>
          </span>
        </div>
        <Curve {...props} norm={norms[trait]} />
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
            <i style={{ background: traitColors[trait] }} />
            Friends
          </span>
          <span>Click a dot or a name to inspect</span>
        </div>
        <div className={styles.readout}>
          {score !== undefined && z !== undefined ? (
            <>
              <strong>{focus.name}</strong>
              <span>{score} / 120 raw</span>
              <span>
                {z > 0 ? "+" : ""}
                {z.toFixed(2)} standard deviations
              </span>
              <span>
                Mean {norms[trait].mean.toFixed(1)} · SD{" "}
                {norms[trait].sd.toFixed(1)}
              </span>
            </>
          ) : (
            <span>No {trait.toLowerCase()} score in this snapshot.</span>
          )}
        </div>
        <div className={styles.nameStrip}>
          {[...people]
            .sort(
              (a, b) =>
                (recordFor(a, preference)?.scores[trait] ?? -Infinity) -
                (recordFor(b, preference)?.scores[trait] ?? -Infinity),
            )
            .map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={p.id === focus.id ? "default" : "outline"}
                onClick={() => onFocus(p.id)}
              >
                {p.name}
              </Button>
            ))}
        </div>
      </section>
      <PersonDetails {...props} />
    </div>
  );
}

function VariantB(props: ViewProps) {
  return (
    <div className={styles.ridgeLayout}>
      <div className={styles.ridges}>
        {traits.map((trait) => {
          const score = recordFor(props.focus, props.preference)?.scores[trait];
          return (
            <section className={styles.ridge} key={trait}>
              <div>
                <Button
                  variant="link"
                  onClick={() => props.onTrait(trait)}
                  className={styles.ridgeTitle}
                >
                  {trait}
                </Button>
                <strong style={{ color: traitColors[trait] }}>
                  {score === undefined
                    ? "No score"
                    : pctLabel(zScore(score, props.norms[trait]))}
                </strong>
                <small>{props.focus.name}</small>
              </div>
              <Curve
                {...props}
                trait={trait}
                norm={props.norms[trait]}
                compact
              />
            </section>
          );
        })}
      </div>
      <PersonDetails {...props} />
    </div>
  );
}

function VariantC(props: ViewProps) {
  const ordered = [...props.people].sort(
    (a, b) =>
      (recordFor(b, props.preference)?.scores[props.trait] ?? -Infinity) -
      (recordFor(a, props.preference)?.scores[props.trait] ?? -Infinity),
  );
  return (
    <div className={styles.matrixLayout}>
      <section className={styles.tableWrap}>
        <table className={styles.matrix}>
          <caption>
            Estimated percentiles. Click a column to sort, or a cell to inspect
            its curve.
          </caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              {traits.map((trait) => (
                <th
                  key={trait}
                  scope="col"
                  aria-sort={trait === props.trait ? "descending" : "none"}
                >
                  <Button variant="ghost" onClick={() => props.onTrait(trait)}>
                    {trait.slice(0, 1)}
                    {trait === props.trait ? " ↓" : ""}
                    <span className="sr-only"> {trait}</span>
                  </Button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((person) => (
              <tr key={person.id} data-selected={person.id === props.focus.id}>
                <th scope="row">
                  <Button
                    variant="ghost"
                    onClick={() => props.onFocus(person.id)}
                  >
                    {person.name}
                  </Button>
                </th>
                {traits.map((trait) => {
                  const score = recordFor(person, props.preference)?.scores[
                    trait
                  ];
                  const z =
                    score === undefined
                      ? undefined
                      : zScore(score, props.norms[trait]);
                  return (
                    <td key={trait}>
                      <Button
                        variant="ghost"
                        aria-label={`${person.name}, ${trait}, ${z === undefined ? "no score" : `${pctLabel(z)} estimated percentile`}`}
                        style={{
                          background: `${traitColors[trait]}${
                            z === undefined
                              ? "00"
                              : Math.round(25 + Math.min(2.5, Math.abs(z)) * 45)
                                  .toString(16)
                                  .padStart(2, "0")
                          }`,
                        }}
                        onClick={() => {
                          props.onFocus(person.id);
                          props.onTrait(trait);
                        }}
                      >
                        {z === undefined ? "—" : pctLabel(z)}
                      </Button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <aside>
        <div className={styles.miniHeading}>
          <h2>{props.focus.name}</h2>
          <span>{props.trait}</span>
        </div>
        <Curve {...props} norm={props.norms[props.trait]} compact />
        <PersonDetails {...props} />
      </aside>
    </div>
  );
}

export default function PersonalityPrototype({ data }: { data: Snapshot }) {
  const params = useSearchParams();
  const variant = variants.some((v) => v.key === params.get("variant"))
    ? params.get("variant")!
    : "A";
  const [trait, setTrait] = useState<Trait>("Extraversion");
  const [group, setGroup] = useState("Everyone");
  const [preference, setPreference] = useState("directory");
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState("chappy");
  const [hidden, setHidden] = useState<string[]>([]);
  const scored = data.people.filter((p) => p.records.length > 0);
  const members = scored.filter(
    (p) => group === "Everyone" || p.group === group || p.id === "chappy",
  );
  const people = members.filter((p) => !hidden.includes(p.id));
  const focus =
    people.find((p) => p.id === focusId) ??
    people.find((p) => p.id === "chappy") ??
    people[0];
  const props = focus
    ? {
        people,
        focus,
        preference,
        trait,
        norms: data.norms,
        onFocus: setFocusId,
        onTrait: setTrait,
      }
    : null;
  const missing = data.people.filter((p) => p.records.length === 0);
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>LOCAL PROTOTYPE / BIG FIVE</span>
          <h1>People on a curve.</h1>
        </div>
        <p>
          <strong>{scored.length}</strong> people with scores
          <span>Your friends, family, and saved results.</span>
        </p>
      </header>
      <div className={styles.toolbar} data-aggregate={variant === "D"}>
        {variant !== "D" && (
          <Choice
            label="Trait"
            value={trait}
            options={traits.map((t) => ({ value: t, label: t }))}
            onChange={(value) => setTrait(value as Trait)}
          />
        )}
        <Choice
          label="Show"
          value={group}
          options={["Everyone", "Friends", "Family"].map((g) => ({
            value: g,
            label: g === "Everyone" ? g : `${g} + you`,
          }))}
          onChange={setGroup}
        />
        <Choice
          label="When two results exist"
          value={preference}
          options={[
            { value: "directory", label: "Use friends spreadsheet" },
            { value: "notebook", label: "Use family notebook" },
          ]}
          onChange={setPreference}
        />
        <Choice
          label="Inspect a person"
          value={focus?.id ?? "empty"}
          options={
            people.length
              ? people.map((p) => ({ value: p.id, label: p.name }))
              : [{ value: "empty", label: "No people selected" }]
          }
          onChange={setFocusId}
        />
      </div>
      {variant !== "D" && (
        <p className={styles.modelNote}>
          The curve uses the reference values saved in your analysis.
          Percentiles are model estimates; the dots are your actual scores. The
          shaded band is one standard deviation either side of the mean.
        </p>
      )}
      {props ? (
        <div className={styles.visual}>
          {variant === "A" ? (
            <VariantA {...props} />
          ) : variant === "B" ? (
            <VariantB {...props} />
          ) : variant === "C" ? (
            <VariantC {...props} />
          ) : (
            <AggregateView {...props} />
          )}
        </div>
      ) : (
        <Card className={styles.empty}>
          No people selected.
          <Button onClick={() => setHidden([])}>Show everyone</Button>
        </Card>
      )}
      <div className={styles.bottomGrid}>
        <Accordion type="single" collapsible>
          <AccordionItem value="people">
            <AccordionTrigger>
              Choose people · {people.length} of {members.length} shown
            </AccordionTrigger>
            <AccordionContent>
              <div className={styles.search}>
                <Search size={16} />
                <Input
                  aria-label="Search people"
                  placeholder="Find a friend or family member"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className={styles.selectionActions}>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setHidden([])}
                >
                  Show everyone
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setHidden(
                      scored.filter((p) => p.id !== "chappy").map((p) => p.id),
                    )
                  }
                >
                  Just me
                </Button>
              </div>
              <div className={styles.peopleList}>
                {members
                  .filter((p) =>
                    p.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((person) => (
                    <label key={person.id}>
                      <Checkbox
                        checked={!hidden.includes(person.id)}
                        onCheckedChange={(checked) =>
                          setHidden((current) =>
                            checked
                              ? current.filter((id) => id !== person.id)
                              : [...current, person.id],
                          )
                        }
                      />
                      <span>{person.name}</span>
                      <small>{person.group}</small>
                    </label>
                  ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Accordion type="single" collapsible>
          <AccordionItem value="method">
            <AccordionTrigger>Data & assumptions</AccordionTrigger>
            <AccordionContent className={styles.method}>
              <p>
                19 friends have scores in 190 directory rows. Your glossary
                results and five family members bring the plotted total to 25
                people. Two people have alternate snapshots. Blank scores stay
                missing.
              </p>
              <p>
                Choosing a preferred source changes Chappy and Gabi. Everyone
                else uses their available result. The notebook&apos;s
                &quot;Gabi&quot; is matched to &quot;Gabi Grengez&quot; in the
                directory.
              </p>
              <p>
                The directory labels its reference values &quot;123Test&quot;.
                The notebook repeats them without a study citation. The earlier
                workbook uses values on a 100-point scale; multiplying those
                means and SDs by 1.2 reproduces the 120-point reference used
                here. This preserves your earlier comparison assumption; it does
                not establish that tests from different providers share
                calibrated norms.
              </p>
              <p>
                Each score becomes z = raw score minus reference mean, divided
                by reference SD. Its estimated percentile is the normal
                cumulative probability at z. The curve is a normal
                approximation, not a measured distribution of your friends. Dots
                stack vertically only to prevent overlap. No group average is
                substituted for the reference population.
              </p>
              <div className={styles.normTable}>
                {traits.map((t) => (
                  <p key={t}>
                    <span>{t}</span>
                    <strong>
                      μ {data.norms[t].mean.toFixed(1)} · σ{" "}
                      {data.norms[t].sd.toFixed(1)}
                    </strong>
                  </p>
                ))}
              </div>
              <p>All local source files</p>
              {data.sources.map((source) => (
                <code key={source}>{source}</code>
              ))}
              <p>
                {missing.length} directory rows have no scores and are not
                plotted.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <footer className={styles.footer} aria-live="polite">
        View {variant} ·{" "}
        {variant === "D" ? "All five traits, RMS distance" : trait} · {group} ·{" "}
        {people.length} shown · Inspecting {focus?.name ?? "nobody"} · Preferred
        source: {preference === "directory" ? "spreadsheet" : "notebook"}
      </footer>
      <PrototypeSwitcher variant={variant} />
    </main>
  );
}
