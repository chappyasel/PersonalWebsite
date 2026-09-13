"use client";

import { CheckIcon, CopyIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import {
  type Library,
  chronological,
  comparable,
  dateLabel,
} from "~/lib/personalities/data";
import {
  type ShareSummary,
  type SharedSnapshot,
  anonymousContext,
  sharedResult,
} from "~/lib/personalities/sharing";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";

import SharedResults from "./SharedResults";
import { api } from "./api";

export default function ShareDialog({
  library,
  initialIds,
  onClose,
}: {
  library: Library;
  initialIds: string[];
  onClose: () => void;
}) {
  const options = library.people.flatMap((p) =>
    [...p.assessments].sort(chronological).map((a) => ({ a, name: p.name })),
  );
  const [selected, setSelected] = useState(initialIds);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [includeDates, setIncludeDates] = useState(true);
  const [includeAnonymous, setIncludeAnonymous] = useState(true);
  const [expiry, setExpiry] = useState("30");
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [created, setCreated] = useState<{
    id: string;
    url: string;
    snapshot: SharedSnapshot;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const chosen = selected.flatMap((id) => {
    const o = options.find((o) => o.a.id === id);
    return o ? [o] : [];
  });
  const canIncludeAnonymous = chosen.some(({ a }) => comparable(a));
  const preview: SharedSnapshot = {
    version: 1,
    results: chosen.map(({ a, name }) =>
      sharedResult(a, (labels[a.id] ?? name).trim(), includeDates),
    ),
  };
  if (includeAnonymous && canIncludeAnonymous)
    preview.anonymous = anonymousContext(
      library.people,
      new Set(chosen.map(({ a }) => a.personId)),
    );
  useEffect(() => {
    let active = true;
    void api<{ shares: ShareSummary[] }>("shares")
      .then((data) => {
        if (active) setShares(data.shares);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        id: string;
        url: string;
        snapshot: SharedSnapshot;
        expiresAt: number | null;
      }>("shares", {
        results: chosen.map(({ a, name }) => ({
          assessmentId: a.id,
          label: labels[a.id] ?? name,
        })),
        includeDates,
        includeAnonymous: includeAnonymous && canIncludeAnonymous,
        expiresInDays: expiry === "never" ? null : Number(expiry),
      });
      setCreated(result);
      setShares((s) => [
        {
          id: result.id,
          labels: result.snapshot.results.map((r) => r.label),
          createdAt: Date.now(),
          expiresAt: result.expiresAt,
        },
        ...s,
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent
        side="center"
        className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-3xl"
      >
        <SheetHeader>
          <SheetTitle>Share selected results</SheetTitle>
          <SheetDescription>
            Anyone with the link can view and forward this snapshot without a
            password. Notes, source codes, and subtraits are excluded. You can
            add unnamed friends and family as comparison dots. Later edits or
            deletions in your library do not change the snapshot.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          {created ? (
            <section className="space-y-3">
              <h3>Link ready</h3>
              <p>Copy this link before closing. You can revoke it below.</p>
              <Input
                aria-label="Share link"
                readOnly
                value={created.url}
                onFocus={(e) => e.target.select()}
              />
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(created.url);
                    setCopied(true);
                  } catch {
                    setError("Copy the link from the field above.");
                  }
                }}
              >
                {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button
                variant="outline"
                className="ml-2"
                onClick={() => {
                  setCreated(null);
                  setCopied(false);
                }}
              >
                Make another link
              </Button>
              <SharedResults snapshot={created.snapshot} />
            </section>
          ) : (
            <>
              <fieldset className="space-y-3">
                <legend className="mb-3 font-semibold">
                  Choose up to six results · {chosen.length} selected
                </legend>
                <div className="max-h-56 space-y-3 overflow-y-auto">
                  {options.map(({ a, name }) => (
                    <label key={a.id} className="flex items-center gap-3">
                      <Checkbox
                        checked={selected.includes(a.id)}
                        disabled={
                          !selected.includes(a.id) && chosen.length >= 6
                        }
                        onCheckedChange={(checked) =>
                          setSelected((s) =>
                            checked === true
                              ? [...s, a.id]
                              : s.filter((id) => id !== a.id),
                          )
                        }
                      />
                      <span>
                        {name} · {dateLabel(a.takenOn)}
                        {a.dateEstimated ? " · Estimated" : ""} ·{" "}
                        {a.testVersion}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {chosen.map(({ a, name }, i) => (
                <label key={a.id} className="block space-y-1">
                  <span>Display name for result {i + 1}</span>
                  <Input
                    maxLength={100}
                    value={labels[a.id] ?? name}
                    onChange={(e) =>
                      setLabels((s) => ({ ...s, [a.id]: e.target.value }))
                    }
                  />
                </label>
              ))}
              <label className="flex items-center gap-3">
                <Checkbox
                  checked={includeDates}
                  onCheckedChange={(value) => setIncludeDates(value === true)}
                />
                Include assessment dates
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={includeAnonymous && canIncludeAnonymous}
                    disabled={!canIncludeAnonymous}
                    onCheckedChange={(value) =>
                      setIncludeAnonymous(value === true)
                    }
                  />
                  Show unnamed friends and family
                </label>
                <p className="text-sm text-muted-foreground">
                  Adds one latest IPIP-120 result per other person as muted
                  dots. Names, dates, and family or friend labels stay hidden.
                  Each trait is shared separately.
                </p>
                {!canIncludeAnonymous && (
                  <p className="text-sm">
                    Select an IPIP-120 result to show these comparison dots.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <span id="share-expiry-label">Link expiry</span>
                <Select value={expiry} onValueChange={setExpiry}>
                  <SelectTrigger aria-labelledby="share-expiry-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      ["7", "7 days"],
                      ["30", "30 days"],
                      ["90", "90 days"],
                      ["never", "Until revoked"],
                    ].map(([value, label]) => (
                      <SelectItem key={value} value={value!}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {chosen.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-semibold">What friends will see</h3>
                  <SharedResults snapshot={preview} />
                </section>
              )}
              <Button
                disabled={
                  busy ||
                  !chosen.length ||
                  preview.results.some((r) => !r.label)
                }
                onClick={() => void create()}
              >
                {busy ? "Creating link…" : "Create share link"}
              </Button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <section className="space-y-3">
            <h3 className="font-semibold">Manage links</h3>
            <p>
              Revoking stops future access. It cannot remove copies someone has
              already saved.
            </p>
            {!shares.length && <p>No links yet.</p>}
            {shares.map((share) => (
              <div
                key={share.id}
                className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"
              >
                <div>
                  <p>{share.labels.join(" / ")}</p>
                  <p className="text-sm">
                    Created {new Date(share.createdAt).toLocaleString()} ·{" "}
                    {share.expiresAt === null
                      ? "Until revoked"
                      : `${share.expiresAt <= Date.now() ? "Expired" : "Expires"} ${new Date(share.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api(`shares/${share.id}`, {}, "DELETE");
                      setShares((s) => s.filter((v) => v.id !== share.id));
                      if (share.id === created?.id) setCreated(null);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <TrashIcon aria-hidden />
                  Revoke
                </Button>
              </div>
            ))}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
