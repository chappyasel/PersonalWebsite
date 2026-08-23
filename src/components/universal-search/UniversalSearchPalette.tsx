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
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

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
  preserveSelectedResultId,
  useProgressiveSearch,
} from "~/lib/universal-search/useProgressiveSearch";
import { universalSearchVisualEffects } from "~/lib/universal-search/visualEffects";
import { cn } from "~/lib/util";

import type {
  UniversalSearchPaletteHandle,
  UniversalSearchPaletteProps,
} from "./UniversalSearchController";

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

function fallbackTextEdit(input: HTMLInputElement, key: string) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  let replacement = key;
  let editStart = start;
  let editEnd = end;
  let inputType = "insertText";

  if (key === "Backspace") {
    replacement = "";
    editStart = start === end ? Math.max(0, start - 1) : start;
    inputType = "deleteContentBackward";
  } else if (key === "Delete") {
    replacement = "";
    editEnd = start === end ? Math.min(input.value.length, end + 1) : end;
    inputType = "deleteContentForward";
  }

  input.setRangeText(replacement, editStart, editEnd, "end");
  const nextSelectionStart = input.selectionStart;
  const nextSelectionEnd = input.selectionEnd;
  input.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      inputType,
      data: replacement || null,
    }),
  );
  // Arc resets the caret to zero when the input event synchronously rerenders
  // the result tree. Restore the selection produced by setRangeText after
  // React's input handler returns, or each subsequent character is prepended.
  if (nextSelectionStart !== null && nextSelectionEnd !== null) {
    input.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    queueMicrotask(() => {
      if (input.isConnected) {
        input.setSelectionRange(nextSelectionStart, nextSelectionEnd);
      }
    });
  }
}

export function applyBrowserTextEdit(input: HTMLInputElement, key: string) {
  fallbackTextEdit(input, key);
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
        "group flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none",
        "data-[selected=true]:bg-secondary data-[selected=true]:text-foreground",
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
      className="group flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-secondary"
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
  onSelect,
}: {
  result: SearchResult;
  onSelect: () => void;
}) {
  const IconComponent =
    ASYNC_GROUP_PRESENTATION[result.group as AsyncSearchGroup].icon;
  return (
    <Command.Item
      value={result.id}
      onSelect={onSelect}
      className="group flex cursor-default select-none items-start gap-3 rounded-lg px-3 py-2.5 text-sm outline-none data-[selected=true]:bg-secondary"
    >
      <IconComponent
        aria-hidden
        className="mt-0.5 size-[18px] shrink-0 text-muted-foreground group-data-[selected=true]:text-foreground"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground">{result.label}</span>
        {(result.description ?? result.excerpt) && (
          <span className="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
            {result.description ?? result.excerpt}
          </span>
        )}
      </span>
    </Command.Item>
  );
}

function ProviderStateRow({
  group,
  status,
}: {
  group: AsyncSearchGroup;
  status: "loading" | "error";
}) {
  const heading = ASYNC_GROUP_PRESENTATION[group].heading;
  return (
    <Command.Item
      disabled
      value={`provider-state:${group}:${status}`}
      className="px-3 py-2 text-xs text-muted-foreground"
    >
      {status === "loading"
        ? `Searching ${heading.toLowerCase()}…`
        : `${heading} search unavailable`}
    </Command.Item>
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
      className="px-2 py-1.5 text-foreground [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </Command.Group>
  );
}

export const UniversalSearchPaletteContent = forwardRef<
  UniversalSearchPaletteHandle,
  UniversalSearchPaletteProps & {
    dependencies: UniversalSearchPaletteDependencies;
  }
>(function UniversalSearchPaletteContent(
  { open, onOpenChange, dependencies },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSelectionRef = useRef<{
    start: number;
    end: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<RecentResult[]>(() =>
    readRecentResults(dependencies.storage),
  );
  const [selectedValue, setSelectedValue] = useState("");
  const zeroReportedQueryRef = useRef<string | null>(null);
  const captureAnalytics = dependencies.capture;
  const visualEffects = useSyncExternalStore(
    universalSearchVisualEffects.subscribe,
    universalSearchVisualEffects.getSnapshot,
    () => universalSearchVisualEffects.defaultSnapshot,
  );

  useImperativeHandle(ref, () => ({
    focusInput: () => inputRef.current?.focus(),
  }));

  useLayoutEffect(() => {
    const selection = pendingSelectionRef.current;
    const input = inputRef.current;
    if (!selection || !input || document.activeElement !== input) return;
    input.setSelectionRange(selection.start, selection.end);
  });

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    inputRef.current?.focus();
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

  const visibleValues = useMemo(
    () => [
      ...(!normalizedQuery
        ? recents.map((recent) => `recent:${recent.id}`)
        : []),
      ...destinations.map((entry) => entry.id),
      ...progressive.results.map((result) => result.id),
      ...actions.map((entry) => entry.id),
    ],
    [actions, destinations, normalizedQuery, progressive.results, recents],
  );

  useEffect(() => {
    setSelectedValue(
      (current) =>
        preserveSelectedResultId(
          current,
          visibleValues.map((id) => ({ id })),
        ) ?? "",
    );
  }, [visibleValues]);

  useEffect(() => {
    if (!selectedValue) return;
    document
      .querySelector<HTMLElement>(
        '[data-universal-search-material] [cmdk-item][data-selected="true"]',
      )
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedValue]);

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

  const selectVisibleValue = (value: string) => {
    const recentIndex = recents.findIndex(
      (recent) => `recent:${recent.id}` === value,
    );
    if (recentIndex >= 0) {
      selectRecent(recents[recentIndex]!, recentIndex);
      return;
    }
    const destinationIndex = destinations.findIndex(
      (entry) => entry.id === value,
    );
    if (destinationIndex >= 0) {
      selectCommand(destinations[destinationIndex]!, destinationIndex);
      return;
    }
    const resultIndex = progressive.results.findIndex(
      (result) => result.id === value,
    );
    if (resultIndex >= 0) {
      selectSearchResult(progressive.results[resultIndex]!, resultIndex);
      return;
    }
    const actionIndex = actions.findIndex((entry) => entry.id === value);
    if (actionIndex >= 0) selectCommand(actions[actionIndex]!, actionIndex);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      !event.nativeEvent.isComposing &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      (event.key.length === 1 ||
        event.key === "Backspace" ||
        event.key === "Delete")
    ) {
      event.preventDefault();
      const key =
        event.shiftKey && /^[a-z]$/.test(event.key)
          ? event.key.toUpperCase()
          : event.key;
      applyBrowserTextEdit(event.currentTarget, key);
      const start = event.currentTarget.selectionStart;
      const end = event.currentTarget.selectionEnd;
      pendingSelectionRef.current =
        start === null || end === null ? null : { start, end };
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (visibleValues.length === 0) return;
      const currentIndex = visibleValues.indexOf(selectedValue);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        currentIndex < 0
          ? direction > 0
            ? 0
            : visibleValues.length - 1
          : (currentIndex + direction + visibleValues.length) %
            visibleValues.length;
      setSelectedValue(visibleValues[nextIndex]!);
      return;
    }
    if (event.key === "Enter") {
      const value = selectedValue || visibleValues[0];
      if (!value) return;
      event.preventDefault();
      selectVisibleValue(value);
    }
  };

  const rememberInputSelection = () => {
    const input = inputRef.current;
    const start = input?.selectionStart;
    const end = input?.selectionEnd;
    pendingSelectionRef.current =
      start === null || start === undefined || end === null || end === undefined
        ? null
        : { start, end };
  };

  if (!open) return null;

  return createPortal(
    <>
      <div
        data-universal-search-overlay=""
        aria-hidden
        onMouseDown={() => onOpenChange(false)}
        className={cn(
          "fixed inset-0 z-[1000] bg-stone-950/20 motion-safe:duration-150 motion-safe:animate-in motion-safe:fade-in-0 dark:bg-black/35",
          visualEffects.backdropBlur && "backdrop-blur-[10px]",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="universal-search-title"
        data-universal-search-material=""
        className={cn(
          "fixed left-1/2 top-1/2 z-[1001] w-[min(42rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border text-foreground outline-none [translate:-50%_-50%]",
          visualEffects.backdropBlur
            ? "border-stone-600/20 bg-[rgb(235_232_225_/_0.28)] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.78),inset_0_-1px_0_rgb(255_255_255_/_0.14),0_24px_80px_-24px_rgb(28_25_23_/_0.55)] [backdrop-filter:blur(80px)_saturate(0.42)_brightness(1.28)] dark:border-white/20 dark:bg-[rgb(0_0_0_/_0.12)] dark:shadow-[inset_0_1px_0_rgb(255_255_255_/_0.28),inset_0_-1px_0_rgb(255_255_255_/_0.08),0_24px_80px_-20px_rgb(0_0_0_/_0.88)] dark:[backdrop-filter:blur(80px)_saturate(0.34)_brightness(0.64)]"
            : "border-border/80 bg-background shadow-2xl",
          "motion-safe:duration-150 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95",
        )}
      >
        <h2 id="universal-search-title" className="sr-only">
          Universal Search
        </h2>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {providerAnnouncement}
        </div>
        <div className="flex items-center gap-3 border-b border-border/70 px-4">
          <MagnifyingGlassIcon
            aria-hidden
            className="size-5 shrink-0 text-muted-foreground"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="universal-search-results"
            aria-expanded={open}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
              }}
              onKeyDown={handleInputKeyDown}
              onKeyUp={rememberInputSelection}
              onMouseUp={rememberInputSelection}
              onSelect={rememberInputSelection}
            aria-label="Universal Search"
            placeholder="Search Chappy's site or type a command"
            className="h-14 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border border-border bg-secondary/70 px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>
        <Command
          shouldFilter={false}
          label="Universal Search results"
          value={selectedValue}
          onValueChange={setSelectedValue}
        >
          <Command.List
            id="universal-search-results"
            data-stacks-scrollable=""
            className="max-h-[min(62vh,32rem)] overflow-y-auto overscroll-contain px-1 py-1.5"
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
            {(["books", "public-writing", "weightlifting", "dad"] as const).map(
              (group) => {
                const state = progressive.groups[group];
                if (state.status === "idle" || state.status === "skipped") {
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
                        onSelect={() => selectSearchResult(result, index)}
                      />
                    ))}
                    {(state.status === "loading" || state.status === "error") &&
                      state.results.length === 0 && (
                        <ProviderStateRow group={group} status={state.status} />
                      )}
                  </ResultGroup>
                );
              },
            )}
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
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No results
                </div>
              )}
          </Command.List>
          <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 font-sans text-[11px] text-muted-foreground">
            <span>Navigate with ↑↓</span>
            <span>Open with ↵</span>
          </div>
        </Command>
      </div>
    </>,
    document.body,
  );
});

export const UniversalSearchPalette = forwardRef<
  UniversalSearchPaletteHandle,
  UniversalSearchPaletteProps
>(function UniversalSearchPalette(props, ref) {
  const { setTheme } = useTheme();
  const { setFont } = useFont();
  const dependencies = useMemo<UniversalSearchPaletteDependencies>(
    () => ({
      storage: window.localStorage,
      location: window.location,
      navigate: navigateUniversalSearchResult,
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
    [setFont, setTheme],
  );

  return (
    <UniversalSearchPaletteContent
      {...props}
      ref={ref}
      dependencies={dependencies}
    />
  );
});
