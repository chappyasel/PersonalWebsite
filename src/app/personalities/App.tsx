"use client";

import {
  ArrowLeftIcon,
  ArrowsLeftRightIcon,
  CaretDownIcon,
  ChartLineIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  GraphIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  RulerIcon,
  SlidersHorizontalIcon,
  StackIcon,
  TableIcon,
  TrashIcon,
  TrendUpIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import {
  type Assessment,
  type Library,
  chronological,
  comparable,
  dateLabel,
  norms,
  traits,
} from "~/lib/personalities/data";
import {
  advancedViews,
  mainViews,
  viewForPath,
} from "~/lib/personalities/navigation";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Sheet as Dialog,
  SheetContent as DialogContent,
  SheetDescription as DialogDescription,
  SheetHeader as DialogHeader,
  SheetTitle as DialogTitle,
} from "~/components/ui/sheet";
import {
  Sheet as AlertDialog,
  SheetContent as AlertDialogContent,
  SheetDescription as AlertDialogDescription,
  SheetFooter as AlertDialogFooter,
  SheetHeader as AlertDialogHeader,
  SheetTitle as AlertDialogTitle,
} from "~/components/ui/sheet";
import { Textarea } from "~/components/ui/textarea";

import ChangesView from "./compare/ChangesView";
import Charts from "./compare/Charts";
import DirectCompare from "./compare/DirectCompare";
import type { Snapshot } from "./compare/model";
import styles from "./personalities.module.css";

const viewIcons = {
  A: StackIcon,
  compare: ArrowsLeftRightIcon,
  changes: TrendUpIcon,
  C: TableIcon,
  D: RulerIcon,
  E: UsersThreeIcon,
  pca: GraphIcon,
  history: ClockCounterClockwiseIcon,
};

async function api<T = unknown>(path: string, body?: unknown, method?: string) {
  const response = await fetch(`/api/personalities/${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    cache: "no-store",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Personality-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = new Error(
      (value as { error?: string }).error ?? "Request failed.",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return value as T;
}
function Pick({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) onChange(String(v));
        }}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export default function App() {
  const router = useRouter(),
    params = useSearchParams();
  const pathname = usePathname();
  const view = viewForPath(pathname, params.get("variant")).id;
  const [library, setLibrary] = useState<Library | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"person" | "score" | null>(null),
    [entry, setEntry] = useState("code"),
    [preview, setPreview] = useState<Omit<Assessment, "id" | "addedAt"> | null>(
      null,
    ),
    [code, setCode] = useState(""),
    [format, setFormat] = useState("ipip-120");
  const [personId, setPersonId] = useState(""),
    [chartFocus, setChartFocus] = useState<string | undefined>(),
    [group, setGroup] = useState("Friends"),
    [selected, setSelected] = useState<Record<string, string>>({}),
    [editing, setEditing] = useState<Assessment | null>(null),
    [deleting, setDeleting] = useState<Assessment | null>(null);
  async function refresh() {
    try {
      const data = await api<Library>("data");
      setLibrary(data);
      setPersonId((id) =>
        data.people.some((p) => p.id === id)
          ? id
          : (data.people.find((p) => p.group === "You")?.id ??
            data.people[0]?.id ??
            ""),
      );
    } catch (e) {
      if ((e as { status?: number }).status === 401) setLibrary(null);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // This effect loads data from the authenticated API; state changes follow the network response.
    // oxlint-disable-next-line react/react-compiler
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 401) setLibrary(null);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className={styles["login-page"]}>
        <output>Opening your library…</output>
      </main>
    );
  if (!library)
    return (
      <main className={styles["login-page"]}>
        <Card className={styles["login-card"]}>
          <p className={styles.eyebrow}>BIG FIVE</p>
          <h1>Personalities</h1>
          <p>
            Compare results with friends and explore how scores change over
            time.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const password = new FormData(event.currentTarget).get(
                "password",
              );
              void action(async () => {
                await api("login", { password });
                await refresh();
              });
            }}
          >
            <label htmlFor="password">Site password</label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={200}
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Opening…" : "Continue"}
            </Button>
          </form>
          {error && <p role="alert">{error}</p>}
        </Card>
      </main>
    );
  const snapshot: Snapshot = {
    norms,
    sources: ["Saved spreadsheet reference norms; see Data & assumptions."],
    people: library.people.map((p) => {
      const assessments = p.assessments.filter(comparable).sort(chronological);
      const chosen =
        assessments.find((a) => a.id === selected[p.id]) ?? assessments[0];
      return {
        id: p.id,
        name: p.name,
        group: p.group,
        records: [
          ...(chosen ? [chosen] : []),
          ...assessments.filter((a) => a.id !== chosen?.id),
        ].map((a) => ({
          id: a.id,
          takenOn: a.takenOn,
          dateEstimated: a.dateEstimated,
          source: a.source,
          label: `${a.dateEstimated ? "~ " : ""}${dateLabel(a.takenOn)} · ${a.source}`,
          ref: a.sourceReference ?? a.source,
          scores: a.scores,
        })),
      };
    }),
  };
  const person = library.people.find((p) => p.id === personId);
  const peopleOptions = library.people.map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const count = library.people.reduce((n, p) => n + p.assessments.length, 0);
  function openScore() {
    setEntry("code");
    setPreview(null);
    setCode("");
    setFormat("ipip-120");
    setError("");
    setModal("score");
  }
  return (
    <main className={styles["app-shell"]}>
      <header className={styles["app-header"]}>
        <div>
          <p className={styles.eyebrow}>BIG FIVE</p>
          <h1>Personalities</h1>
          <p>
            {library.people.length} people · {count} assessments
          </p>
        </div>
        <Button
          onClick={() =>
            library.people.length ? openScore() : setModal("person")
          }
          className={styles["add-button"]}
        >
          <PlusIcon size={16} weight="bold" aria-hidden="true" /> Add results
        </Button>
      </header>
      <nav
        aria-label="Personality analysis views"
        className={styles["view-tabs"]}
      >
        {mainViews.map((v) => {
          const Icon = viewIcons[v.id];
          return (
            <Link
              key={v.id}
              href={v.href}
              className={styles["view-tab"]}
              aria-current={view === v.id ? "page" : undefined}
            >
              <Icon
                size={18}
                weight={view === v.id ? "duotone" : "regular"}
                aria-hidden="true"
              />
              {v.name}
            </Link>
          );
        })}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={styles["advanced-trigger"]}
              data-active={advancedViews.some((v) => v.id === view)}
            >
              <SlidersHorizontalIcon size={18} aria-hidden="true" />
              {advancedViews.find((v) => v.id === view)?.name ?? "Advanced"}
              <CaretDownIcon size={13} aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Advanced analyses
            </p>
            {advancedViews.map((v) => {
              const Icon = viewIcons[v.id];
              return (
                <PopoverClose key={v.id} asChild>
                  <Link
                    href={v.href}
                    aria-current={view === v.id ? "page" : undefined}
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm outline-none hover:bg-accent focus-visible:bg-accent ${view === v.id ? "bg-accent font-medium" : ""}`}
                  >
                    <Icon size={17} aria-hidden="true" />
                    {v.name}
                  </Link>
                </PopoverClose>
              );
            })}
          </PopoverContent>
        </Popover>
      </nav>
      {error && !modal && !editing && !deleting && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {view === "history" ? (
        <section className={styles.history}>
          <div className={styles["history-heading"]}>
            <Pick
              label="Person"
              value={personId}
              options={peopleOptions}
              onChange={setPersonId}
            />
            <p>All saved results, newest first. Estimated dates are marked.</p>
          </div>
          {person?.assessments.length ? (
            [...person.assessments].sort(chronological).map((a) => (
              <Card key={a.id} className={styles["history-card"]}>
                <div className={styles["history-title"]}>
                  <div>
                    <div className={styles["date-heading"]}>
                      <h2>{dateLabel(a.takenOn)}</h2>
                      {a.dateEstimated && (
                        <Badge variant="secondary">Estimated</Badge>
                      )}
                    </div>
                    <p>
                      {a.source} ·{" "}
                      {a.scoreKind === "raw"
                        ? `raw scores out of ${a.scoreMax}`
                        : a.scoreKind}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    {comparable(a) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelected((s) => ({ ...s, [person.id]: a.id }));
                          setChartFocus(person.id);
                          router.push("/personalities");
                        }}
                      >
                        <ChartLineIcon size={16} aria-hidden="true" />
                        Use in comparisons
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setError("");
                        setEditing(a);
                      }}
                    >
                      <PencilSimpleIcon size={16} aria-hidden="true" />
                      Edit date / notes
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setError("");
                        setDeleting(a);
                      }}
                    >
                      <TrashIcon size={16} aria-hidden="true" /> Delete
                    </Button>
                  </div>
                </div>
                <div className={styles["score-grid"]}>
                  {traits.map((t) => (
                    <div key={t}>
                      <span>{t}</span>
                      <strong>
                        {a.scores[t]}
                        {a.scoreKind === "raw" ? "" : "%"}
                      </strong>
                    </div>
                  ))}
                </div>
                {!comparable(a) && (
                  <p className={styles.muted}>
                    History only. This test&apos;s score format does not share
                    the raw-score reference used by the comparison views.
                  </p>
                )}
                {(a.notes || a.sourceReference) && (
                  <Accordion type="single" collapsible>
                    <AccordionItem value="source">
                      <AccordionTrigger>Date & source details</AccordionTrigger>
                      <AccordionContent>
                        {a.notes && <p className={styles.notes}>{a.notes}</p>}
                        <p className={styles["source-ref"]}>
                          {a.sourceReference}
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
                {a.facets.length > 0 && (
                  <Accordion type="single" collapsible>
                    <AccordionItem value="facets">
                      <AccordionTrigger>30 subtrait scores</AccordionTrigger>
                      <AccordionContent>
                        <div className={styles["facet-grid"]}>
                          {traits.map((t) => (
                            <div key={t}>
                              <h3>{t}</h3>
                              {a.facets
                                .filter((f) => f.trait === t)
                                .map((f) => (
                                  <p key={f.name}>
                                    <span>{f.name}</span>
                                    <strong>
                                      {f.score} / {f.max}
                                    </strong>
                                  </p>
                                ))}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </Card>
            ))
          ) : (
            <Card className={styles["empty-card"]}>
              <h2>{person?.name ?? "Start your library"}</h2>
              <p>No assessments yet.</p>
              <Button onClick={person ? openScore : () => setModal("person")}>
                {person ? "Add their first score" : "Add a person"}
              </Button>
            </Card>
          )}
        </section>
      ) : view === "compare" ? (
        <DirectCompare
          data={snapshot}
          personId={personId}
          onPerson={setPersonId}
          onAssessment={(id, assessmentId) =>
            setSelected((s) => ({ ...s, [id]: assessmentId }))
          }
        />
      ) : view === "changes" ? (
        <ChangesView
          data={snapshot}
          personId={personId}
          onPerson={setPersonId}
        />
      ) : (
        <>
          <p className={styles["comparison-note"]}>
            Latest result per person. Select a date to compare earlier tests.
            {view === "A" && " Click a trait to expand its curve."}
          </p>
          <Charts
            data={snapshot}
            variant={view}
            initialFocus={chartFocus}
            onPersonFocus={setPersonId}
            onAssessment={(id, assessmentId) =>
              setSelected((s) => ({ ...s, [id]: assessmentId }))
            }
          />
        </>
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setModal(null);
            setError("");
          }
        }}
      >
        <DialogContent side="center" className={styles["entry-dialog"]}>
          <DialogHeader>
            <DialogTitle>
              {modal === "person" ? "New person" : "Add results"}
            </DialogTitle>
            <DialogDescription>
              {modal === "person"
                ? "Create their profile, then add their results."
                : "Choose someone, then import a test or enter their scores."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {modal === "person" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void action(async () => {
                  const p = await api<{ id: string }>("people", {
                    name: d.get("name"),
                    group,
                  });
                  await refresh();
                  setPersonId(p.id);
                  openScore();
                });
              }}
              className={styles["entry-form"]}
            >
              <label className={styles.field} htmlFor="assessment-field-1">
                Name
                <Input
                  id="assessment-field-1"
                  autoFocus
                  name="name"
                  required
                  maxLength={100}
                />
              </label>
              <Pick
                label="Group"
                value={group}
                options={["You", "Friends", "Family"].map((v) => ({
                  value: v,
                  label: v,
                }))}
                onChange={setGroup}
              />
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setModal(library.people.length ? "score" : null);
                  }}
                >
                  <ArrowLeftIcon size={16} aria-hidden="true" /> Back
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Continue to scores"}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className={styles["person-entry"]}>
                <Pick
                  label="Person"
                  value={personId}
                  options={peopleOptions}
                  onChange={setPersonId}
                />
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setGroup("Friends");
                    setError("");
                    setModal("person");
                  }}
                >
                  <UserPlusIcon size={16} aria-hidden="true" /> New person
                </Button>
              </div>
              <div>
                <div
                  className={styles["entry-methods"]}
                  role="group"
                  aria-label="How to add results"
                >
                  {[
                    { id: "code", label: "Import a code", icon: LinkIcon },
                    {
                      id: "manual",
                      label: "Enter numbers",
                      icon: PencilSimpleIcon,
                    },
                  ].map((method) => (
                    <Button
                      key={method.id}
                      type="button"
                      variant={entry === method.id ? "default" : "ghost"}
                      aria-pressed={entry === method.id}
                      onClick={() => {
                        setEntry(method.id);
                        setError("");
                      }}
                    >
                      <method.icon size={16} aria-hidden="true" />
                      {method.label}
                    </Button>
                  ))}
                </div>
                {entry === "code" && (
                  <div>
                    <div className={styles["entry-form"]}>
                      <label
                        className={styles.field}
                        htmlFor="assessment-field-2"
                      >
                        Big Five result code or link
                        <Input
                          id="assessment-field-2"
                          value={code}
                          onChange={(e) => {
                            setCode(e.target.value);
                            setPreview(null);
                          }}
                          placeholder="Paste your bigfive-test.com code"
                          maxLength={250}
                        />
                      </label>
                      <Button
                        variant="outline"
                        disabled={busy || !code.trim()}
                        onClick={() =>
                          void action(async () => {
                            setPreview(
                              await api<Omit<Assessment, "id" | "addedAt">>(
                                "import-preview",
                                { code },
                              ),
                            );
                          })
                        }
                      >
                        <MagnifyingGlassIcon size={16} aria-hidden="true" />
                        {busy ? "Fetching…" : "Preview result"}
                      </Button>
                      {preview && (
                        <Card className={styles["import-preview"]}>
                          <h3>{dateLabel(preview.takenOn)}</h3>
                          <div className={styles["score-grid"]}>
                            {traits.map((t) => (
                              <div key={t}>
                                <span>{t}</span>
                                <strong>{preview.scores[t]}</strong>
                              </div>
                            ))}
                          </div>
                          <p>
                            Raw scores out of 120, plus {preview.facets.length}{" "}
                            subtraits.
                          </p>
                          <Button
                            disabled={busy || !personId}
                            onClick={() =>
                              void action(async () => {
                                await api("import-score", { personId, code });
                                await refresh();
                                setModal(null);
                                router.push("/personalities/history");
                              })
                            }
                          >
                            <CheckIcon size={16} aria-hidden="true" />
                            Save to {person?.name}&apos;s history
                          </Button>
                        </Card>
                      )}
                    </div>
                  </div>
                )}
                {entry === "manual" && (
                  <div>
                    <form
                      className={styles["entry-form"]}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const d = new FormData(e.currentTarget);
                        void action(async () => {
                          await api("assessments", {
                            personId,
                            takenOn: d.get("takenOn"),
                            dateEstimated: d.get("dateEstimated") === "on",
                            source: "manual",
                            testVersion:
                              format === "ipip-120"
                                ? "ipip-120"
                                : d.get("testName"),
                            scoreKind: format === "ipip-120" ? "raw" : format,
                            scoreMax: format === "ipip-120" ? 120 : 100,
                            scores: Object.fromEntries(
                              traits.map((t) => [t, Number(d.get(t))]),
                            ),
                            notes: d.get("notes"),
                          });
                          await refresh();
                          setModal(null);
                          router.push("/personalities/history");
                        });
                      }}
                    >
                      <Pick
                        label="Score format"
                        value={format}
                        options={[
                          {
                            value: "ipip-120",
                            label: "IPIP-120 raw totals, 24–120",
                          },
                          {
                            value: "percentile",
                            label: "Reported percentiles, 0–100",
                          },
                          {
                            value: "percentage",
                            label: "Reported percentages, 0–100",
                          },
                        ]}
                        onChange={setFormat}
                      />
                      {format !== "ipip-120" && (
                        <label
                          className={styles.field}
                          htmlFor="assessment-field-3"
                        >
                          Test name
                          <Input
                            id="assessment-field-3"
                            name="testName"
                            required
                            maxLength={100}
                            placeholder="For example, Truity"
                          />
                        </label>
                      )}
                      <label
                        className={styles.field}
                        htmlFor="assessment-field-4"
                      >
                        Assessment date
                        <Input
                          id="assessment-field-4"
                          name="takenOn"
                          placeholder="YYYY-MM-DD or YYYY-MM; leave blank if unknown"
                          maxLength={10}
                        />
                      </label>
                      <label className={styles["estimate-field"]}>
                        <Checkbox name="dateEstimated" /> Approximate date
                      </label>
                      <div className={styles["manual-grid"]}>
                        {traits.map((t) => (
                          <label
                            className={styles.field}
                            key={t}
                            htmlFor={`score-${t}`}
                          >
                            {t}
                            <Input
                              id={`score-${t}`}
                              name={t}
                              type="number"
                              min={format === "ipip-120" ? 24 : 0}
                              max={format === "ipip-120" ? 120 : 100}
                              step={format === "ipip-120" ? 1 : 0.1}
                              required
                            />
                          </label>
                        ))}
                      </div>
                      <label
                        className={styles.field}
                        htmlFor="assessment-field-5"
                      >
                        Notes
                        <Textarea
                          id="assessment-field-5"
                          name="notes"
                          maxLength={4000}
                        />
                      </label>
                      <Button type="submit" disabled={busy || !personId}>
                        <CheckIcon size={16} aria-hidden="true" />
                        {busy ? "Saving…" : "Save results"}
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent side="center">
          <DialogHeader>
            <DialogTitle>Edit assessment details</DialogTitle>
            <DialogDescription>
              Scores stay unchanged. Add a separate assessment for a new test.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className={styles["entry-form"]}
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                void action(async () => {
                  await api(
                    `assessments/${editing.id}`,
                    {
                      takenOn: d.get("takenOn"),
                      dateEstimated: d.get("dateEstimated") === "on",
                      notes: d.get("notes"),
                    },
                    "PATCH",
                  );
                  await refresh();
                  setEditing(null);
                });
              }}
            >
              <label className={styles.field} htmlFor="assessment-field-6">
                Assessment date
                <Input
                  id="assessment-field-6"
                  name="takenOn"
                  defaultValue={editing.takenOn ?? ""}
                  placeholder="YYYY-MM-DD or YYYY-MM"
                  maxLength={10}
                />
              </label>
              <label className={styles["estimate-field"]}>
                <Checkbox
                  name="dateEstimated"
                  defaultChecked={editing.dateEstimated ?? false}
                />{" "}
                Approximate date
              </label>
              <label className={styles.field} htmlFor="assessment-field-7">
                Notes
                <Textarea
                  id="assessment-field-7"
                  name="notes"
                  defaultValue={editing.notes}
                  maxLength={4000}
                />
              </label>
              <Button type="submit" disabled={busy}>
                <CheckIcon size={16} aria-hidden="true" /> Save details
              </Button>
            </form>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent side="center">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the {dateLabel(deleting?.takenOn ?? null)} assessment
              from this person&apos;s history. Their other assessments stay
              saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert">{error}</p>}
          <AlertDialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              Keep assessment
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (deleting)
                  void action(async () => {
                    await api(`assessments/${deleting.id}`, {}, "DELETE");
                    await refresh();
                    setDeleting(null);
                  });
              }}
            >
              <TrashIcon size={16} aria-hidden="true" /> Delete assessment
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
