"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  BarbellIcon,
  BookOpenTextIcon,
  BooksIcon,
  ClockIcon,
  CodeIcon,
  CompassIcon,
  DesktopIcon,
  DiceFiveIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PenNibIcon,
  SunIcon,
  TextAaIcon,
  TextTIcon,
  TrashIcon,
  UserIcon,
} from "@phosphor-icons/react/dist/ssr";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Keycap, KeycapSequence } from "~/components/ui/keycap";
import {
  type AnalyticsCapture,
  capture,
  universalSearchOpenedProperties,
  universalSearchProviderSettledProperties,
  universalSearchResultSelectedProperties,
  universalSearchZeroResultsProperties,
} from "~/lib/analytics";
import { type FontOption, useFont } from "~/lib/font-provider";
import { type ThemeChoice } from "~/lib/theme";
import { runCommandAction } from "~/lib/universal-search/actions";
import { queryServerSearch } from "~/lib/universal-search/client-providers";
import { navigateUniversalSearchResult } from "~/lib/universal-search/navigation";
import { queryPublicSearchIndex } from "~/lib/universal-search/public-index";
import {
  normalizeSearchText,
  rankSearchCandidates,
} from "~/lib/universal-search/ranking";
import {
  type RecentResult,
  clearRecentResults,
  readRecentResults,
  recordRecentResult,
} from "~/lib/universal-search/recents";
import { COMMAND_ENTRIES } from "~/lib/universal-search/registry";
import type {
  CommandEntry,
  CommandIconKey,
  SearchResult,
} from "~/lib/universal-search/types";
import {
  type SearchLocation,
  resolveRegistryDestination,
} from "~/lib/universal-search/urls";
import {
  type AsyncSearchGroup,
  type ProgressiveProviderSettlement,
  type ServerSearchPayload,
  useProgressiveSearch,
} from "~/lib/universal-search/useProgressiveSearch";
import { universalSearchVisualEffects } from "~/lib/universal-search/visualEffects";
import { cn } from "~/lib/util";

import type { UniversalSearchPaletteProps } from "./UniversalSearchController";

const ICONS: Record<CommandIconKey, Icon> = {
  house: HouseIcon,
  books: BooksIcon,
  manual: BookOpenTextIcon,
  routine: ClockIcon,
  weightlifting: BarbellIcon,
  about: UserIcon,
  systems: CompassIcon,
  projects: CodeIcon,
  musings: PenNibIcon,
  dice: DiceFiveIcon,
  sun: SunIcon,
  moon: MoonIcon,
  monitor: DesktopIcon,
  serif: TextAaIcon,
  sans: TextTIcon,
  trash: TrashIcon,
};

export type UniversalSearchPaletteDependencies = {
  storage: Storage;
  location: SearchLocation;
  navigate: (href: string) => void;
  setTheme: (theme: ThemeChoice) => void;
  setFont: (font: FontOption) => void;
  capture: AnalyticsCapture;
  searchPublic: (query: string, signal: AbortSignal) => Promise<SearchResult[]>;
  searchServer: (
    query: string,
    signal: AbortSignal,
  ) => Promise<ServerSearchPayload>;
};

type RankedCommandEntry = CommandEntry & {
  matchKind: SearchResult["matchKind"];
  score: number;
};

/** Translucent selection with an inset ring, after the AIC palette's
 * tint-plus-ring treatment. Built on the primary token so it carries the
 * site's own neutral warmth in both themes instead of a browner accent. */
const ROW_SELECTED =
  "data-[selected=true]:bg-primary/10 data-[selected=true]:ring-1 data-[selected=true]:ring-inset data-[selected=true]:ring-primary/15";

const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;

/** Marks occurrences of the query (or, failing that, its words) in result
 * text, the way the AIC platform highlights matched search text. Split with
 * one capture group puts matches at odd indices. */
function HighlightedText({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;
  let parts = text.split(
    new RegExp(`(${trimmed.replace(ESCAPE_REGEX, "\\$&")})`, "gi"),
  );
  if (parts.length === 1 && /\s/.test(trimmed)) {
    const words = trimmed
      .split(/\s+/)
      .filter((word) => word.length >= 2)
      .map((word) => word.replace(ESCAPE_REGEX, "\\$&"));
    if (words.length > 0) {
      parts = text.split(new RegExp(`(${words.join("|")})`, "gi"));
    }
  }
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className="rounded-[2px] bg-amber-500/25 text-inherit dark:bg-amber-300/25"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function commandMatches(query: string): RankedCommandEntry[] {
  return rankSearchCandidates(
    query,
    COMMAND_ENTRIES.map((entry) => ({
      ...entry,
      metadata: entry.keywords,
    })),
  );
}

function CommandRow({
  entry,
  onSelect,
}: {
  entry: CommandEntry;
  onSelect: () => void;
}) {
  const IconComponent = ICONS[entry.icon];
  return (
    <Command.Item
      value={entry.id}
      onSelect={onSelect}
      className={cn(
        "group flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none",
        "data-[selected=true]:text-foreground",
        ROW_SELECTED,
      )}
    >
      <IconComponent
        aria-hidden
        className="size-[18px] shrink-0 text-muted-foreground group-data-[selected=true]:text-foreground"
        weight="regular"
      />
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
    </Command.Item>
  );
}

function RecentRow({
  recent,
  onSelect,
}: {
  recent: RecentResult;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={`recent:${recent.id}`}
      onSelect={onSelect}
      className={cn(
        "group flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none",
        ROW_SELECTED,
      )}
    >
      <ClockIcon
        aria-hidden
        className="size-[18px] shrink-0 text-muted-foreground"
      />
      <span className="min-w-0 flex-1 truncate">{recent.label}</span>
    </Command.Item>
  );
}

const ASYNC_GROUP_PRESENTATION: Record<
  AsyncSearchGroup,
  { heading: string; icon: Icon }
> = {
  books: { heading: "Books", icon: BooksIcon },
  "public-writing": { heading: "Public writing", icon: PenNibIcon },
  weightlifting: { heading: "Weightlifting", icon: BarbellIcon },
  dad: { heading: "Dad", icon: UserIcon },
};

function SearchResultRow({
  result,
  query,
  onSelect,
}: {
  result: SearchResult;
  query: string;
  onSelect: () => void;
}) {
  const IconComponent =
    ASYNC_GROUP_PRESENTATION[result.group as AsyncSearchGroup].icon;
  const isNoteMatch = result.group === "books" && result.matchKind === "body";
  return (
    <Command.Item
      value={result.id}
      onSelect={onSelect}
      className={cn(
        "group flex cursor-default select-none items-start gap-3 rounded-lg px-3 py-2 text-sm outline-none",
        ROW_SELECTED,
      )}
    >
      {result.imageUrl ? (
        // Books read as portrait spines; article and project thumbnails
        // are landscape captures.
        result.group === "books" ? (
          <Image
            src={result.imageUrl}
            alt=""
            width={26}
            height={39}
            className="mt-0.5 h-[39px] w-[26px] shrink-0 rounded-[3px] object-cover shadow-sm"
            draggable={false}
          />
        ) : (
          <Image
            src={result.imageUrl}
            alt=""
            width={40}
            height={26}
            className="mt-0.5 h-[26px] w-[40px] shrink-0 rounded-[3px] object-cover shadow-sm"
            draggable={false}
          />
        )
      ) : (
        <IconComponent
          aria-hidden
          className="mt-0.5 size-[18px] shrink-0 text-muted-foreground group-data-[selected=true]:text-foreground"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground">
          <HighlightedText text={result.label} query={query} />
        </span>
        {result.description && (
          <span className="mt-0.5 block truncate text-xs leading-relaxed text-muted-foreground">
            <HighlightedText text={result.description} query={query} />
          </span>
        )}
        {result.excerpt && (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
            {isNoteMatch && (
              <span className="mr-1.5 font-sans text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                In notes
              </span>
            )}
            <HighlightedText text={result.excerpt} query={query} />
          </span>
        )}
      </span>
    </Command.Item>
  );
}

function ProviderErrorRow({ group }: { group: AsyncSearchGroup }) {
  const heading = ASYNC_GROUP_PRESENTATION[group].heading;
  return (
    <Command.Item
      disabled
      value={`provider-state:${group}:error`}
      className="px-3 py-1.5 text-xs text-muted-foreground"
    >
      {`${heading} search unavailable`}
    </Command.Item>
  );
}

/** One anonymous pulsing group stands in for every provider still searching.
 * Anonymous on purpose: a labeled placeholder would advertise the private
 * Dad group to unauthorized visitors before the server says "skipped". */
function SkeletonResultGroup() {
  return (
    <div aria-hidden data-search-skeleton="" className="px-1.5 py-1">
      <div className="px-3 py-1.5">
        <div className="h-2.5 w-16 animate-pulse rounded bg-muted-foreground/20" />
      </div>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="flex animate-pulse items-center gap-3 px-3 py-2"
        >
          <div className="size-[18px] shrink-0 rounded bg-muted-foreground/15" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="h-3.5 w-2/5 rounded bg-muted-foreground/15" />
            <div className="h-3 w-3/5 rounded bg-muted-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultGroup({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="px-1.5 py-1 text-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </Command.Group>
  );
}

/**
 * The palette shell deliberately reuses the composition every working ⌘K on
 * this machine uses: Radix Dialog owns the portal, focus trap, Escape, and
 * outside-dismiss; cmdk owns the input, arrow-key selection, and Enter. The
 * input is a plain controlled `Command.Input` — no keydown interception, no
 * manual caret bookkeeping. The previous hand-rolled shell re-implemented
 * text editing per keystroke and corrupted typing in real browsers.
 */
export function UniversalSearchPaletteContent({
  open,
  onOpenChange,
  dependencies,
}: UniversalSearchPaletteProps & {
  dependencies: UniversalSearchPaletteDependencies;
}) {
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<RecentResult[]>(() =>
    readRecentResults(dependencies.storage),
  );
  const zeroReportedQueryRef = useRef<string | null>(null);
  const captureAnalytics = dependencies.capture;
  const visualEffects = useSyncExternalStore(
    universalSearchVisualEffects.subscribe,
    universalSearchVisualEffects.getSnapshot,
    () => universalSearchVisualEffects.defaultSnapshot,
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    captureAnalytics(
      "universal_search_opened",
      universalSearchOpenedProperties(),
    );
  }, [captureAnalytics, open]);

  const normalizedQuery = normalizeSearchText(query);
  const matchingEntries = useMemo(
    () => (normalizedQuery ? commandMatches(normalizedQuery) : []),
    [normalizedQuery],
  );
  const destinations = normalizedQuery
    ? matchingEntries.filter((entry) => entry.kind === "destination")
    : COMMAND_ENTRIES.filter(
        (entry) => entry.kind === "destination" && entry.promoted,
      );
  const actions = normalizedQuery
    ? matchingEntries.filter((entry) => entry.kind === "action")
    : COMMAND_ENTRIES.filter((entry) => entry.kind === "action");

  const handleProviderSettled = useCallback(
    (settlement: ProgressiveProviderSettlement) => {
      captureAnalytics(
        "universal_search_provider_settled",
        universalSearchProviderSettledProperties(settlement),
      );
    },
    [captureAnalytics],
  );
  const progressive = useProgressiveSearch({
    query,
    enabled: open,
    searchPublic: dependencies.searchPublic,
    searchServer: dependencies.searchServer,
    onProviderSettled: handleProviderSettled,
  });
  const providerAnnouncement = useMemo(() => {
    if (progressive.normalizedQuery.length < 2) return "";
    const states = Object.values(progressive.groups);
    const loadingCount = states.filter(
      (state) => state.status === "loading",
    ).length;
    if (loadingCount > 0) {
      return `Searching ${loadingCount} ${loadingCount === 1 ? "source" : "sources"}`;
    }
    const resultCount = progressive.results.length;
    const errorCount = states.filter(
      (state) => state.status === "error",
    ).length;
    return `${resultCount} search ${resultCount === 1 ? "result" : "results"} loaded${
      errorCount > 0
        ? `; ${errorCount} ${errorCount === 1 ? "source" : "sources"} unavailable`
        : ""
    }`;
  }, [
    progressive.groups,
    progressive.normalizedQuery,
    progressive.results.length,
  ]);

  useEffect(() => {
    if (!progressive.isSettledZero || !progressive.normalizedQuery) return;
    if (destinations.length > 0 || actions.length > 0) return;
    if (zeroReportedQueryRef.current === progressive.normalizedQuery) return;
    zeroReportedQueryRef.current = progressive.normalizedQuery;
    captureAnalytics(
      "universal_search_zero_results",
      universalSearchZeroResultsProperties(
        progressive.groups.dad.status === "skipped" ? 3 : 4,
      ),
    );
  }, [
    actions.length,
    captureAnalytics,
    destinations.length,
    progressive.isSettledZero,
    progressive.normalizedQuery,
    progressive.groups.dad.status,
  ]);

  const close = () => onOpenChange(false);

  const selectRecent = (recent: RecentResult, rank: number) => {
    const next = recordRecentResult(dependencies.storage, {
      ...recent,
      group: "destinations",
      matchKind: "exact",
      score: 1_000,
    });
    setRecents(next);
    dependencies.capture(
      "universal_search_result_selected",
      universalSearchResultSelectedProperties({
        group: "destinations",
        kind: recent.kind,
        rank,
        matchKind: "exact",
      }),
    );
    close();
    dependencies.navigate(recent.href);
  };

  const selectCommand = (entry: CommandEntry, rank: number) => {
    const match = normalizedQuery
      ? matchingEntries.find((candidate) => candidate.id === entry.id)
      : undefined;
    const matchKind = match?.matchKind ?? "exact";
    if (entry.kind === "action") {
      runCommandAction(entry.actionId, {
        setTheme: dependencies.setTheme,
        setFont: dependencies.setFont,
        clearRecents: () => {
          clearRecentResults(dependencies.storage);
          setRecents([]);
        },
      });
      dependencies.capture(
        "universal_search_result_selected",
        universalSearchResultSelectedProperties({
          group: "actions",
          kind: "action",
          rank,
          matchKind,
        }),
      );
      close();
      return;
    }

    const href = resolveRegistryDestination(entry.id, dependencies.location);
    const next = recordRecentResult(dependencies.storage, {
      id: entry.id,
      kind: "destination",
      group: "destinations",
      label: entry.label,
      href,
      matchKind,
      score: match?.score ?? 1_000,
    });
    setRecents(next);
    dependencies.capture(
      "universal_search_result_selected",
      universalSearchResultSelectedProperties({
        group: "destinations",
        kind: "destination",
        rank,
        matchKind,
      }),
    );
    close();
    dependencies.navigate(href);
  };

  const selectSearchResult = (result: SearchResult, rank: number) => {
    if (!result.href) return;
    const next = recordRecentResult(dependencies.storage, result);
    setRecents(next);
    dependencies.capture(
      "universal_search_result_selected",
      universalSearchResultSelectedProperties({
        group: result.group,
        kind: result.kind,
        rank,
        matchKind: result.matchKind,
      }),
    );
    close();
    dependencies.navigate(result.href);
  };

  // The homepage's 3D world stamps `data-world` on the root element. Over
  // the scene the palette keeps its heavy placard-glass material; on flat
  // pages (Books, Weightlifting, Manual, Routine) it reads as a plain
  // frosted panel instead.
  const onWorldScene =
    typeof document !== "undefined" &&
    document.documentElement.hasAttribute("data-world");

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-universal-search-overlay=""
          className={cn(
            "fixed inset-0 z-[1000] bg-stone-950/20 dark:bg-black/35",
            "motion-safe:duration-150 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0",
            visualEffects.backdropBlur && onWorldScene && "backdrop-blur-[10px]",
          )}
        />
        <Dialog.Content
          data-universal-search-material=""
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            // The controller restores focus to the element that was focused
            // before the palette opened; Radix would otherwise focus body.
            event.preventDefault();
          }}
          className={cn(
            // Top-anchored like the AIC palettes: the input and the top of
            // the results stay at a fixed Y while the panel grows downward,
            // so loading/settling never moves what the visitor is reading.
            "fixed left-1/2 top-4 z-[1001] w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border text-foreground outline-none [translate:-50%_0] sm:top-[16vh]",
            !visualEffects.backdropBlur
              ? "border-border/80 bg-background shadow-2xl"
              : onWorldScene
                ? "border-stone-600/20 bg-[rgb(242_239_233_/_0.5)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.78),inset_0_-1px_0_rgb(255_255_255_/_0.14),0_24px_80px_-24px_rgb(28_25_23_/_0.55)] [backdrop-filter:blur(80px)_saturate(0.42)_brightness(1.5)] dark:border-white/20 dark:bg-[rgb(0_0_0_/_0.32)] dark:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.28),inset_0_-1px_0_rgb(255_255_255_/_0.08),0_24px_80px_-20px_rgb(0_0_0_/_0.88)] dark:[backdrop-filter:blur(80px)_saturate(0.34)_brightness(0.52)]"
                : "border-border/70 bg-background/85 shadow-2xl [backdrop-filter:blur(24px)_saturate(1.05)] dark:bg-background/80",
            "motion-safe:duration-150 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:zoom-out-95",
          )}
        >
          <Dialog.Title className="sr-only">Universal Search</Dialog.Title>
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {providerAnnouncement}
          </div>
          <Command shouldFilter={false} label="Universal Search">
            <div className="flex items-center gap-3 border-b border-border/70 px-4">
              <MagnifyingGlassIcon
                aria-hidden
                className="size-5 shrink-0 text-muted-foreground"
              />
              {/* No autoFocus: Radix's FocusScope must perform the initial
                  focus itself, or it never records a last-focused element and
                  its trap cannot reclaim focus from the scene later. */}
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Search Chappy's site or type a command"
                className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              />
              <Keycap width="fit" className="hidden sm:inline-flex">
                esc
              </Keycap>
            </div>
            <Command.List
              data-stacks-scrollable=""
              className="max-h-[min(62vh,32rem)] overflow-y-auto overscroll-contain px-1 py-1"
            >
              {!normalizedQuery && recents.length > 0 && (
                <ResultGroup heading="Recent">
                  {recents.map((recent, index) => (
                    <RecentRow
                      key={recent.id}
                      recent={recent}
                      onSelect={() => selectRecent(recent, index)}
                    />
                  ))}
                </ResultGroup>
              )}
              {destinations.length > 0 && (
                <ResultGroup heading="Destinations">
                  {destinations.map((entry, index) => (
                    <CommandRow
                      key={entry.id}
                      entry={entry}
                      onSelect={() => selectCommand(entry, index)}
                    />
                  ))}
                </ResultGroup>
              )}
              {(
                ["books", "public-writing", "weightlifting", "dad"] as const
              ).map((group) => {
                const state = progressive.groups[group];
                // A group earns its heading only with rows to show, or with
                // an error worth reporting. Settled-empty and still-loading
                // groups render nothing here; the shared skeleton below
                // stands in for everything still searching.
                if (state.results.length === 0 && state.status !== "error") {
                  return null;
                }
                return (
                  <ResultGroup
                    key={group}
                    heading={ASYNC_GROUP_PRESENTATION[group].heading}
                  >
                    {state.results.map((result, index) => (
                      <SearchResultRow
                        key={result.id}
                        result={result}
                        query={normalizedQuery}
                        onSelect={() => selectSearchResult(result, index)}
                      />
                    ))}
                    {state.status === "error" && state.results.length === 0 && (
                      <ProviderErrorRow group={group} />
                    )}
                  </ResultGroup>
                );
              })}
              {Object.values(progressive.groups).some(
                (state) => state.status === "loading",
              ) && <SkeletonResultGroup />}
              {actions.length > 0 && (
                <ResultGroup heading="Actions">
                  {actions.map((entry, index) => (
                    <CommandRow
                      key={entry.id}
                      entry={entry}
                      onSelect={() => selectCommand(entry, index)}
                    />
                  ))}
                </ResultGroup>
              )}
              {normalizedQuery &&
                destinations.length === 0 &&
                actions.length === 0 &&
                progressive.isSettledZero && (
                  <div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center text-sm text-muted-foreground">
                    <MagnifyingGlassIcon
                      aria-hidden
                      weight="duotone"
                      className="size-7 opacity-40"
                    />
                    <span>No results for “{query.trim()}”</span>
                  </div>
                )}
            </Command.List>
            <div className="flex items-center justify-between border-t border-border/70 px-4 py-1.5 font-sans text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <KeycapSequence keys={["↑", "↓"]} label="Up and down arrows" />
                Navigate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Keycap aria-hidden="true">↵</Keycap>
                Open
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function UniversalSearchPalette(props: UniversalSearchPaletteProps) {
  const { setTheme } = useTheme();
  const { setFont } = useFont();
  const router = useRouter();
  const dependencies = useMemo<UniversalSearchPaletteDependencies>(
    () => ({
      storage: window.localStorage,
      location: window.location,
      navigate: (href) =>
        navigateUniversalSearchResult(href, {
          location: window.location,
          notifySameDocument: () =>
            window.dispatchEvent(new PopStateEvent("popstate")),
          // Same-origin jumps on interceptor-free hosts stay in-app.
          softNavigate: (path) => router.push(path),
        }),
      setTheme: (theme) => setTheme(theme),
      setFont,
      capture,
      searchPublic: (query, signal) =>
        queryPublicSearchIndex(query, {
          location: window.location,
          signal,
        }),
      searchServer: queryServerSearch,
    }),
    [router, setFont, setTheme],
  );

  return <UniversalSearchPaletteContent {...props} dependencies={dependencies} />;
}
