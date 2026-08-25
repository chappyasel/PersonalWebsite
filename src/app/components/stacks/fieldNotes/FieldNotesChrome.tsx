"use client";

import { NotebookIcon, XIcon } from "@phosphor-icons/react";
import * as Dialog from "@radix-ui/react-dialog";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import FieldNoteArtworkIcon from "./FieldNoteArtwork";
import {
  FIELD_NOTES,
  FIELD_NOTE_BY_ID,
  FIELD_NOTE_RARITIES,
  type FieldNoteDefinition,
  type FieldNoteId,
} from "./catalog";
import {
  fieldNotesLocalDay,
  recordFieldNoteEvent,
  resetFieldNotes,
  startFieldNotes,
  subscribeFieldNoteAwards,
  useFieldNotesProgress,
} from "./progress";
import { connectFieldNotesShortcut } from "./shortcut";

const FieldNotesPrototype = dynamic(() => import("./FieldNotesPrototype"), {
  ssr: false,
});

type CollectionFilter = "all" | "found" | "unfound";

function OverviewStamp({
  note,
  earnedAt,
}: {
  note: FieldNoteDefinition;
  earnedAt: number;
}) {
  return (
    <div
      role="img"
      aria-label={`${note.title}, found ${new Date(earnedAt).toLocaleDateString()}`}
      data-rarity={note.rarity.toLowerCase()}
      className="field-notes-overview-stamp grid size-16 shrink-0 place-items-center rounded-full border border-[#513b25]/15 bg-[#fffaf0]/80 text-[#513b25] shadow-[0_8px_25px_rgba(55,38,21,0.10)] sm:size-[4.5rem]"
    >
      <FieldNoteArtworkIcon note={note} earned size={30} />
    </div>
  );
}

function DiscoveryCard({
  note,
  earnedAt,
}: {
  note: FieldNoteDefinition;
  earnedAt: number | undefined;
}) {
  const earned = earnedAt !== undefined;
  const title = note.hidden && !earned ? "?" : note.title;
  const rarity = note.hidden && !earned ? null : note.rarity;
  return (
    <li>
      <article
        data-earned={earned ? "true" : "false"}
        data-rarity={rarity?.toLowerCase() ?? "hidden"}
        className="field-notes-card group relative min-h-48 overflow-hidden rounded-[1.35rem] border border-[#513b25]/10 bg-[#fffdf7]/70 p-5 shadow-[0_12px_42px_rgba(57,40,21,0.07)] backdrop-blur-md sm:min-h-52 sm:p-6"
      >
        <div
          aria-hidden
          className={`absolute -right-5 -top-5 grid size-32 place-items-center rounded-full border transition-[opacity,transform] duration-500 motion-reduce:transition-none ${
            earned
              ? "rotate-6 border-[#a57033]/15 bg-[#d8a759]/10 text-[#7a542b]/75"
              : "border-[#513b25]/5 bg-[#513b25]/[0.025] text-[#513b25]/10"
          }`}
        >
          <FieldNoteArtworkIcon note={note} earned={earned} size={58} />
        </div>
        <div className="relative flex h-full flex-col">
          <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.16em] text-[#745d43]/65">
            {earned
              ? `Found · ${note.rarity}`
              : note.hidden
                ? "Unknown"
                : `${note.rarity} clue`}
          </p>
          <h3 className="mt-7 max-w-[80%] font-serif text-xl leading-tight text-[#3d2c1c] sm:text-[1.35rem]">
            {title}
          </h3>
          <p className="mt-auto max-w-[92%] pt-7 font-serif text-[13px] leading-relaxed text-[#66513b]/75 sm:text-sm">
            {earned
              ? note.foundCopy
              : note.hidden
                ? "No clue for this one. You'll know it when you find it."
                : note.hint}
          </p>
        </div>
      </article>
    </li>
  );
}

function FieldNotesArchive({ onClose }: { onClose: () => void }) {
  const progress = useFieldNotesProgress();
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const earnedNotes = useMemo(
    () =>
      FIELD_NOTES.flatMap((note) => {
        const earnedAt = progress.earned[note.id];
        return earnedAt === undefined ? [] : [{ note, earnedAt }];
      }).sort((a, b) => b.earnedAt - a.earnedAt),
    [progress.earned],
  );
  const featured = earnedNotes.slice(0, 5);
  const visibleNotes = useMemo(
    () =>
      FIELD_NOTES.filter((note) => {
        const found = progress.earned[note.id] !== undefined;
        return filter === "all" || (filter === "found" ? found : !found);
      }),
    [filter, progress.earned],
  );
  const discoveryCopy =
    earnedNotes.length === 0
      ? "Look closer. Each discovery earns a stamp."
      : `${earnedNotes.length} ${earnedNotes.length === 1 ? "discovery" : "discoveries"} across ${progress.visitedUnits.length || 1} ${progress.visitedUnits.length === 1 ? "shelf" : "shelves"}.`;

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="field-notes-overlay fixed inset-0 z-[5000] bg-[#1d3040]/45 backdrop-blur-[2px]" />
      <Dialog.Content
        data-stacks-scrollable
        // Opening with F must not paint a focus ring on the first control
        // (the close button). Focus stays put; the dialog still traps Tab
        // and Escape still closes through the dismissable layer.
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="field-notes-sky fixed inset-0 z-[5001] overflow-y-auto overscroll-contain text-[#3d2c1c] focus:outline-none"
      >
        <div aria-hidden className="field-notes-cloud field-notes-cloud-a" />
        <div aria-hidden className="field-notes-cloud field-notes-cloud-b" />
        <div aria-hidden className="field-notes-cloud field-notes-cloud-c" />

        <Dialog.Close
          aria-label="Close Field Notes"
          onClick={onClose}
          className="fixed right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))] z-20 grid size-11 place-items-center rounded-full border border-white/35 bg-white/25 text-[#3d2c1c] shadow-[0_8px_30px_rgba(31,52,65,0.14)] backdrop-blur-xl transition-colors hover:bg-white/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f4932] motion-reduce:transition-none"
        >
          <XIcon aria-hidden size={20} weight="bold" />
        </Dialog.Close>

        <main className="relative mx-auto min-h-full w-full max-w-[1420px] px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(5.5rem,calc(env(safe-area-inset-top)+5rem))] sm:px-8 lg:px-12">
          <header className="field-notes-overview relative overflow-hidden rounded-[2rem] border border-white/45 bg-[#fff9ea]/80 px-6 py-8 shadow-[0_30px_90px_rgba(34,57,71,0.16)] backdrop-blur-2xl sm:px-10 sm:py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10 lg:px-14 lg:py-12">
            <div className="relative z-10">
              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-[#745d43]/65">
                Chappy&apos;s world
              </p>
              <Dialog.Title className="mt-3 font-serif text-4xl leading-none tracking-[-0.035em] text-[#382719] sm:text-6xl">
                Field Notes
              </Dialog.Title>
              <Dialog.Description className="mt-4 max-w-xl font-serif text-sm leading-relaxed text-[#66513b]/75 sm:text-base">
                {discoveryCopy}
              </Dialog.Description>
              <div className="mt-6 grid max-w-xl grid-cols-2 gap-x-5 gap-y-2 border-t border-dashed border-[#73563a]/20 pt-4 sm:grid-cols-4">
                {FIELD_NOTE_RARITIES.map((rarity) => {
                  const found = FIELD_NOTES.filter(
                    (note) =>
                      note.rarity === rarity &&
                      progress.earned[note.id] !== undefined,
                  ).length;
                  const total = FIELD_NOTES.filter(
                    (note) => note.rarity === rarity,
                  ).length;
                  return (
                    <div
                      key={rarity}
                      className="flex items-center justify-between gap-2 text-[#5c402b]/75"
                    >
                      <span className="flex items-center gap-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em]">
                        <span
                          aria-hidden
                          data-rarity={rarity.toLowerCase()}
                          className="field-notes-rarity-swatch size-3 shrink-0"
                        />
                        {rarity}
                      </span>
                      <span className="font-sans text-[10px] font-semibold">
                        {found}/{total}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative z-10 mt-8 flex min-h-[4.5rem] items-center gap-2 lg:mt-0 lg:justify-end">
              {featured.length ? (
                featured.map(({ note, earnedAt }) => (
                  <OverviewStamp
                    key={note.id}
                    note={note}
                    earnedAt={earnedAt}
                  />
                ))
              ) : (
                <div className="flex items-center gap-3 text-[#745d43]/55">
                  <div className="grid size-16 place-items-center rounded-full border border-dashed border-[#745d43]/25">
                    <NotebookIcon aria-hidden size={27} />
                  </div>
                  <p className="max-w-36 font-serif text-xs leading-relaxed">
                    Your first stamp will land here.
                  </p>
                </div>
              )}
            </div>
          </header>

          <div className="mx-auto mt-8 flex w-fit rounded-full border border-white/40 bg-white/25 p-1 shadow-[0_8px_30px_rgba(31,52,65,0.08)] backdrop-blur-xl">
            {(["all", "found", "unfound"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-10 rounded-full px-4 font-sans text-xs font-medium capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f4932] motion-reduce:transition-none sm:px-5 ${
                  filter === value
                    ? "bg-[#fff9ea]/90 text-[#382719] shadow-sm"
                    : "text-[#4d6170] hover:bg-white/25"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          <section
            className="relative mt-10"
            aria-labelledby="field-notes-findings"
          >
            <div className="mb-4 flex items-end justify-between gap-4 px-1">
              <h2
                id="field-notes-findings"
                className="font-serif text-xl text-[#3d2c1c] sm:text-2xl"
              >
                Findings
              </h2>
              <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.14em] text-[#745d43]/55">
                {visibleNotes.length} shown
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleNotes.map((note) => (
                <DiscoveryCard
                  key={note.id}
                  note={note}
                  earnedAt={progress.earned[note.id]}
                />
              ))}
            </ul>
          </section>

          <footer className="mt-16 flex flex-col items-center gap-3 border-t border-white/30 pt-7 text-center font-sans text-[11px] text-[#4d6170]/70 sm:flex-row sm:justify-between sm:text-left">
            <p>Saved in this browser. No account or leaderboard.</p>
            {earnedNotes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset every Field Note found in this browser?",
                    )
                  )
                    resetFieldNotes();
                }}
                className="rounded-full px-3 py-2 text-[#4d6170]/70 underline decoration-[#4d6170]/25 underline-offset-4 hover:text-[#382719] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f4932]"
              >
                Reset Field Notes
              </button>
            )}
          </footer>
        </main>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

function FieldNotesExperience() {
  const progress = useFieldNotesProgress();
  const [open, setOpen] = useState(false);
  const [awardQueue, setAwardQueue] = useState<FieldNoteId[]>([]);
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const stop = startFieldNotes();
    // The Regular compares calendar days, so the day is resolved here at the
    // moment the room opens rather than inside the pure reducer.
    recordFieldNoteEvent({ type: "session-started", day: fieldNotesLocalDay() });
    return stop;
  }, []);
  useEffect(
    () => connectFieldNotesShortcut(() => setOpen((value) => !value)),
    [],
  );
  useEffect(
    () =>
      subscribeFieldNoteAwards((ids) => {
        if (!openRef.current) setAwardQueue((queue) => [...queue, ...ids]);
      }),
    [],
  );
  useEffect(() => {
    if (!awardQueue.length) return;
    const timeout = window.setTimeout(
      () => setAwardQueue((queue) => queue.slice(1)),
      2450,
    );
    return () => window.clearTimeout(timeout);
  }, [awardQueue]);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-field-notes-open", open);
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.removeAttribute("data-field-notes-open");
    };
  }, [open]);

  const earnedCount = Object.keys(progress.earned).length;
  const activeAward = awardQueue[0]
    ? FIELD_NOTE_BY_ID.get(awardQueue[0])
    : undefined;

  return (
    <>
      <style>{`
        html[data-field-notes-open] body {
          pointer-events: auto !important;
        }
        .field-notes-overlay[data-state="open"] { animation: field-notes-fade-in 260ms ease-out both; }
        .field-notes-overlay[data-state="closed"] { animation: field-notes-fade-out 180ms ease-in both; }
        .field-notes-sky {
          background:
            radial-gradient(circle at 18% 11%, rgb(255 250 226 / 0.88), transparent 24rem),
            linear-gradient(180deg, #91b9cc 0%, #c4d9dc 35%, #e7d8bb 76%, #d7b98d 100%);
          animation: field-notes-rise-in 520ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        html.dark .field-notes-sky {
          background:
            radial-gradient(circle at 20% 9%, rgb(188 160 112 / 0.22), transparent 25rem),
            linear-gradient(180deg, #263d52 0%, #516a76 46%, #8b7a65 100%);
        }
        .field-notes-cloud {
          position: fixed;
          pointer-events: none;
          border-radius: 999px;
          background: rgb(255 255 255 / 0.27);
          filter: blur(22px);
        }
        .field-notes-cloud::before,
        .field-notes-cloud::after {
          content: "";
          position: absolute;
          border-radius: inherit;
          background: inherit;
        }
        .field-notes-cloud-a { width: 32rem; height: 8rem; left: -8rem; top: 19%; }
        .field-notes-cloud-a::before { width: 14rem; height: 14rem; left: 8rem; top: -6rem; }
        .field-notes-cloud-a::after { width: 18rem; height: 11rem; left: 17rem; top: -3rem; }
        .field-notes-cloud-b { width: 36rem; height: 9rem; right: -13rem; top: 48%; }
        .field-notes-cloud-b::before { width: 16rem; height: 13rem; left: 3rem; top: -5rem; }
        .field-notes-cloud-b::after { width: 20rem; height: 12rem; left: 16rem; top: -4rem; }
        .field-notes-cloud-c { width: 28rem; height: 7rem; left: 22%; bottom: -4rem; opacity: 0.7; }
        .field-notes-cloud-c::before { width: 15rem; height: 12rem; left: 3rem; top: -5rem; }
        .field-notes-rarity-swatch {
          display: inline-block;
          color: #6f5136;
          background: currentColor;
          -webkit-mask:
            radial-gradient(circle at 50% 0, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top left / var(--swatch-step) 100% repeat-x,
            radial-gradient(circle at 50% 100%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) bottom left / var(--swatch-step) 100% repeat-x,
            radial-gradient(circle at 0 50%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top left / 100% var(--swatch-step) repeat-y,
            radial-gradient(circle at 100% 50%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top right / 100% var(--swatch-step) repeat-y;
          -webkit-mask-composite: source-in;
          mask:
            radial-gradient(circle at 50% 0, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top left / var(--swatch-step) 100% repeat-x,
            radial-gradient(circle at 50% 100%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) bottom left / var(--swatch-step) 100% repeat-x,
            radial-gradient(circle at 0 50%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top left / 100% var(--swatch-step) repeat-y,
            radial-gradient(circle at 100% 50%, transparent 0 var(--swatch-notch), #000 calc(var(--swatch-notch) + .25px)) top right / 100% var(--swatch-step) repeat-y;
          mask-composite: intersect;
        }
        .field-notes-rarity-swatch[data-rarity="common"] {
          --swatch-notch: .65px;
          --swatch-step: 6px;
          background: #b49a77;
        }
        .field-notes-rarity-swatch[data-rarity="uncommon"] {
          --swatch-notch: .9px;
          --swatch-step: 5px;
          background: #62826a;
        }
        .field-notes-rarity-swatch[data-rarity="rare"] {
          --swatch-notch: 1.2px;
          --swatch-step: 4px;
          background:
            repeating-linear-gradient(
              90deg,
              #51748c 0 2px,
              #b7cad7 2px 3px
            );
        }
        .field-notes-rarity-swatch[data-rarity="legendary"] {
          --swatch-notch: 1.45px;
          --swatch-step: 3.5px;
          background:
            repeating-linear-gradient(
              135deg,
              #b78932 0 2px,
              #884b60 2px 3px
            );
        }
        .field-notes-card[data-earned="true"]::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          border-radius: inherit;
          box-shadow: inset 0 0 0 1px rgb(165 112 51 / 0.12);
        }
        .field-notes-award {
          animation: field-notes-award-collapse 2450ms cubic-bezier(0.16, 1, 0.3, 1) both;
          transform-origin: 50% -16px;
        }
        .field-notes-icon-receiving {
          animation: field-notes-icon-receive 2450ms ease-out both;
        }
        @keyframes field-notes-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes field-notes-fade-out { from { opacity: 1; } to { opacity: 0; } }
        @keyframes field-notes-rise-in {
          from { opacity: 0; transform: translateY(4vh) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes field-notes-award-collapse {
          0% { opacity: 0; transform: translate(-50%, 8px) scale(0.94); }
          14%, 68% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -30px) scale(0.16); }
        }
        @keyframes field-notes-icon-receive {
          0%, 82% { transform: scale(1); }
          89% { transform: scale(1.12) rotate(-5deg); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .field-notes-overlay[data-state],
          .field-notes-sky,
          .field-notes-award,
          .field-notes-icon-receiving { animation: none; }
          .field-notes-award { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <div className="relative">
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label={`Open Field Notes${earnedCount ? `, ${earnedCount} found` : ""}`}
              aria-keyshortcuts="F"
              className={`stacks-on-background-text pointer-events-auto grid size-9 place-items-center rounded-full text-foreground/80 transition-[background-color,color,transform] hover:bg-foreground/[0.09] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current active:bg-foreground/[0.14] motion-reduce:transition-none ${activeAward ? "field-notes-icon-receiving" : ""}`}
            >
              <NotebookIcon
                aria-hidden
                size={18}
                weight={earnedCount ? "duotone" : "regular"}
              />
            </button>
          </Dialog.Trigger>
          {activeAward && (
            <div
              key={`${activeAward.id}:${progress.earned[activeAward.id]}`}
              role="status"
              aria-live="polite"
              className="field-notes-award pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-40 w-max max-w-[min(17rem,calc(100vw-2rem))] rounded-2xl border border-white/40 bg-[#fff9ea]/90 px-4 py-3 text-[#3d2c1c] shadow-[0_14px_45px_rgba(34,43,48,0.2)] backdrop-blur-xl"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#7a542b]/10 bg-[#d8a759]/10 text-[#7a542b]">
                  <FieldNoteArtworkIcon note={activeAward} earned size={19} />
                </span>
                <span>
                  <span className="block font-sans text-[9px] font-semibold uppercase tracking-[0.16em] text-[#745d43]/60">
                    Field note added
                  </span>
                  <span className="mt-0.5 block whitespace-nowrap font-serif text-sm">
                    {activeAward.title}
                  </span>
                </span>
              </div>
            </div>
          )}
        </div>
        {open && <FieldNotesArchive onClose={() => setOpen(false)} />}
      </Dialog.Root>
    </>
  );
}

export default function FieldNotesChrome() {
  if (process.env.NODE_ENV === "development") return <FieldNotesPrototype />;
  return <FieldNotesExperience />;
}
