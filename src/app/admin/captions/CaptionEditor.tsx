"use client";

import { useMemo, useState } from "react";
import Image from "next/image";

import type {
  CaptionEditorSaveInput,
  CaptionEditorSaveResult,
  CaptionEditorSnapshot,
} from "~/lib/stacks/captionEditorData";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";

type SaveState = "idle" | "saving" | "saved" | "stale" | "error";

type CaptionEditorProps = Readonly<{
  initialSnapshot: CaptionEditorSnapshot;
  saveAction: (input: CaptionEditorSaveInput) => Promise<CaptionEditorSaveResult>;
}>;

function draftMap(snapshot: CaptionEditorSnapshot) {
  return Object.fromEntries(snapshot.entries.map((entry) => [entry.id, entry.body]));
}

export function CaptionEditor({ initialSnapshot, saveAction }: CaptionEditorProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    draftMap(initialSnapshot),
  );
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const dirty = useMemo(
    () =>
      snapshot.entries.filter((entry) => drafts[entry.id] !== entry.body),
    [drafts, snapshot.entries],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot.entries;
    return snapshot.entries.filter((entry) =>
      `${entry.title} ${entry.id} ${entry.body} ${entry.section}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query, snapshot.entries]);

  async function save() {
    if (!dirty.length || saveState === "saving") return;
    setSaveState("saving");
    try {
      const result = await saveAction({
        revision: snapshot.revision,
        edits: dirty.map((entry) => ({
          id: entry.id,
          body: drafts[entry.id] ?? "",
        })),
      });
      if (!result.saved) {
        setSaveState("stale");
        return;
      }
      setSnapshot(result.snapshot);
      setDrafts(draftMap(result.snapshot));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  const message =
    saveState === "error"
      ? "Save failed. Your edits are still here."
      : saveState === "stale"
        ? "The caption file changed elsewhere. Reload before saving so nothing gets overwritten."
        : null;

  return (
    <div className="min-h-screen bg-[#f1ede4] text-[#27231d]">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-[#f1ede4]/95 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#766e62]">
              Local editor
            </p>
            <h1 className="font-serif text-3xl tracking-tight">Scene captions</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[#655d52]">
            <span>{snapshot.entries.length} captions</span>
            <span aria-hidden>·</span>
            <span>{dirty.length ? `${dirty.length} unsaved` : "All changes saved"}</span>
          </div>
          <Input
            aria-label="Search captions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="h-10 bg-white/70 md:w-64"
          />
          <Button
            type="button"
            onClick={() => void save()}
            disabled={!dirty.length || saveState === "saving"}
            aria-label="Save captions"
            className="h-10 min-w-28"
          >
            {saveState === "saving" ? "Saving..." : "Save captions"}
          </Button>
        </div>
        {message && (
          <p role="alert" className="mx-auto mt-3 max-w-[1500px] text-sm text-red-700">
            {message}
          </p>
        )}
      </header>

      <main className="mx-auto grid max-w-[1500px] items-start gap-5 px-4 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:px-8 md:py-8">
        {visible.map((entry) => {
          const changed = drafts[entry.id] !== entry.body;
          return (
            <Card
              key={entry.id}
              className={`overflow-hidden border-black/10 bg-[#fbf8f1] text-[#27231d] shadow-sm ${changed ? "ring-2 ring-[#b46735]/60" : ""}`}
            >
              {entry.image && (
                <div className="relative aspect-[4/3] bg-[#201f1c]">
                  <Image
                    src={entry.image}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-contain"
                  />
                </div>
              )}
              <CardHeader className="space-y-2 p-4 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="font-serif text-xl leading-tight">
                    {entry.title}
                  </CardTitle>
                  <div className="flex shrink-0 gap-1">
                    <Badge variant={entry.kind === "photo" ? "secondary" : "outline"}>
                      {entry.section}
                    </Badge>
                    <Badge variant="outline">{entry.status}</Badge>
                  </div>
                </div>
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {entry.id}
                </p>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <label className="sr-only" htmlFor={`caption-${entry.id}`}>
                  {entry.title} caption
                </label>
                <Textarea
                  id={`caption-${entry.id}`}
                  value={drafts[entry.id] ?? ""}
                  disabled={saveState === "saving"}
                  onChange={(event) => {
                    setDrafts((current) => ({
                      ...current,
                      [entry.id]: event.target.value,
                    }));
                    setSaveState("idle");
                  }}
                  rows={entry.image ? 6 : 4}
                  className="resize-y border-black/15 bg-white/70 font-serif text-[15px] leading-relaxed shadow-inner focus-visible:border-[#8b5736] focus-visible:ring-[#b46735]/20"
                />
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
