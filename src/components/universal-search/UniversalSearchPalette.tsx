"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  BarbellIcon,
  BookOpenTextIcon,
  BooksIcon,
  CaretDownIcon,
  ClockIcon,
  CodeIcon,
  DesktopIcon,
  DiceFiveIcon,
  GearIcon,
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
import { flushSync } from "react-dom";

import {
  type AnalyticsCapture,
  capture,
  universalSearchGroupExpandedProperties,
  universalSearchOpenedProperties,
  universalSearchProviderSettledProperties,
  universalSearchResultSelectedProperties,
  universalSearchZeroResultsProperties,
} from "~/lib/analytics";
import { type FontOption, useFont } from "~/lib/font-provider";
import { SITE_PAGES } from "~/lib/site/pages";
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
import { RESULT_GROUP_PREVIEW } from "~/lib/universal-search/types";
import type {
  CommandDestinationEntry,
  CommandEntry,
  CommandIconKey,
  CommandPage,
  SearchResult,
} from "~/lib/universal-search/types";
import {
  type SearchLocation,
  resolveDestinationTarget,
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

import { Keycap, KeycapSequence } from "~/components/ui/keycap";

import type { UniversalSearchPaletteProps } from "./UniversalSearchController";

const ICONS: Record<CommandIconKey, Icon> = {
  house: HouseIcon,
  books: BooksIcon,
  manual: BookOpenTextIcon,
  routine: ClockIcon,
  weightlifting: BarbellIcon,
  about: UserIcon,
  systems: GearIcon,
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

/** Every row's picture column: one 28px slot. A page's tile fills it, a
 * glyph sits centred in it, a book cover matches its width. One slot, one
 * text column, however the rows are mixed. */
const ICON_SLOT = "flex size-7 shrink-0 items-center justify-center";

/** A glyph centred in the slot, coloured like the row's text state. */
function SlotGlyph({ icon: IconComponent }: { icon: Icon }) {
  return (
    <span aria-hidden className={ICON_SLOT}>
      <IconComponent
        className="size-[18px] text-muted-foreground group-data-[selected=true]:text-foreground"
        weight="regular"
      />
    </span>
  );
}

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

/** The tile a page's browser tab wears, from the page's own icon route: a
 * bare /tab-icon on a subdomain site (the proxy only knows the bare path
 * there), or under the page's path on the main host (/systems/tab-icon). */
function pageTileUrl(entry: CommandDestinationEntry, location: SearchLocation) {
  const prefix = (entry.target.path ?? "").replace(/\/+$/, "");
  return resolveDestinationTarget(
    { kind: "site", site: entry.target.site, path: `${prefix}/tab-icon` },
    location,
  );
}

/** One of the site's own pages as a result: the tile its tab wears in the
 * icon slot, its name, and the one-line description it publishes. The same
 * anatomy as every other row, one line taller. */
function PageRow({
  entry,
  query,
  location,
  onSelect,
}: {
  entry: CommandDestinationEntry & { page: CommandPage };
  query: string;
  location: SearchLocation;
  onSelect: () => void;
}) {
  const { description } = SITE_PAGES[entry.page];
  return (
    <Command.Item
      value={entry.id}
      onSelect={onSelect}
      className={cn(
        "group flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-2 text-sm outline-none",
        ROW_SELECTED,
      )}
    >
      {/* The icon route is an SVG that recolours itself for the colour
          scheme, which next/image cannot optimise; its corners are already
          rounded and transparent. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={pageTileUrl(entry, location)}
        alt=""
        width={28}
        height={28}
        data-search-page-tile=""
        className="size-7 shrink-0"
        draggable={false}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground">
          <HighlightedText text={entry.label} query={query} />
        </span>
        <span className="block truncate text-xs leading-snug text-muted-foreground">
          <HighlightedText text={description} query={query} />
        </span>
      </span>
    </Command.Item>
  );
}

function CommandRow({
  entry,
  query,
  location,
  onSelect,
}: {
  entry: CommandEntry;
  query: string;
  location: SearchLocation;
  onSelect: () => void;
}) {
  if (entry.kind === "destination" && entry.page) {
    return (
      <PageRow
        entry={{ ...entry, page: entry.page }}
        query={query}
        location={location}
        onSelect={onSelect}
      />
    );
  }
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
      <SlotGlyph icon={ICONS[entry.icon]} />
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
      <SlotGlyph icon={ClockIcon} />
      <span className="min-w-0 flex-1 truncate">{recent.label}</span>
    </Command.Item>
  );
}

const ASYNC_GROUP_PRESENTATION: Record<
  AsyncSearchGroup,
  { heading: string; icon: Icon }
> = {
  books: { heading: "Book Notes", icon: BooksIcon },
  "public-writing": { heading: "Site", icon: PenNibIcon },
  weightlifting: { heading: "Weightlifting", icon: BarbellIcon },
  dad: { heading: "Dad's Journal", icon: UserIcon },
};

/** Public-writing results split under the site's own section names, keyed by
 * the stable document-id prefixes the index generator assigns. The grouped
 * "Site" heading survives only as the provider-error label. */
const PUBLIC_SOURCE_PRESENTATION = [
  { prefix: "public:manual:", heading: "Manual", icon: BookOpenTextIcon },
  { prefix: "public:routine:", heading: "Routine", icon: ClockIcon },
  { prefix: "public:systems:", heading: "Systems", icon: GearIcon },
  { prefix: "public:musing:", heading: "Musings", icon: PenNibIcon },
  { prefix: "public:project:", heading: "Projects", icon: CodeIcon },
] as const;

function resultIcon(result: SearchResult): Icon {
  if (result.group === "public-writing") {
    const source = PUBLIC_SOURCE_PRESENTATION.find((candidate) =>
      result.id.startsWith(candidate.prefix),
    );
    if (source) return source.icon;
  }
  return ASYNC_GROUP_PRESENTATION[result.group as AsyncSearchGroup].icon;
}

/** Split public-writing results into per-section groups, keeping each
 * result's provider-wide rank for selection analytics. */
function publicWritingSubgroups(results: SearchResult[]) {
  const subgroups = PUBLIC_SOURCE_PRESENTATION.map((source) => ({
    heading: source.heading,
    entries: [] as { result: SearchResult; rank: number }[],
  }));
  const other = {
    heading: ASYNC_GROUP_PRESENTATION["public-writing"].heading,
    entries: [] as { result: SearchResult; rank: number }[],
  };
  results.forEach((result, rank) => {
    const index = PUBLIC_SOURCE_PRESENTATION.findIndex((source) =>
      result.id.startsWith(source.prefix),
    );
    (index === -1 ? other : subgroups[index]!).entries.push({ result, rank });
  });
  return [...subgroups, other].filter((group) => group.entries.length > 0);
}

/** A result's picture: a book's portrait cover at the slot's width, an
 * article or project's landscape capture at the slot's height, or the
 * group's glyph when there is no picture or the picture never arrives (a
 * cover host that 404s would otherwise leave a blank in the column). */
function ResultPicture({
  result,
  icon: IconComponent,
}: {
  result: SearchResult;
  icon: Icon;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const imageUrl =
    result.imageUrl && failed !== result.imageUrl ? result.imageUrl : null;
  if (!imageUrl) {
    return (
      <span aria-hidden className={cn(ICON_SLOT, "h-5")}>
        <IconComponent className="size-[18px] text-muted-foreground group-data-[selected=true]:text-foreground" />
      </span>
    );
  }
  return result.group === "books" ? (
    <Image
      src={imageUrl}
      alt=""
      width={28}
      height={42}
      className="mt-0.5 h-[42px] w-7 shrink-0 rounded-[3px] object-cover shadow-sm"
      draggable={false}
      onError={() => setFailed(imageUrl)}
    />
  ) : (
    <Image
      src={imageUrl}
      alt=""
      width={42}
      height={28}
      className="mt-0.5 h-7 w-[42px] shrink-0 rounded-[3px] object-cover shadow-sm"
      draggable={false}
      onError={() => setFailed(imageUrl)}
    />
  );
}

function SearchResultRow({
  result,
  query,
  onSelect,
}: {
  result: SearchResult;
  query: string;
  onSelect: () => void;
}) {
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
      <ResultPicture result={result} icon={resultIcon(result)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-foreground">
          <HighlightedText text={result.label} query={query} />
        </span>
        {result.description && (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
            {result.accentColor && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: result.accentColor }}
              />
            )}
            <span className="min-w-0 truncate">
              <HighlightedText text={result.description} query={query} />
            </span>
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

/** The last row of a previewed group: choosing it reveals the group's
 * remaining results in place. */
function ShowMoreRow({
  groupKey,
  count,
  onSelect,
}: {
  groupKey: string;
  count: number;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={`expand:${groupKey}`}
      onSelect={onSelect}
      className={cn(
        "group flex cursor-default select-none items-center gap-3 rounded-lg px-3 py-1.5 text-xs text-muted-foreground outline-none",
        "data-[selected=true]:text-foreground",
        ROW_SELECTED,
      )}
    >
      <span aria-hidden className={ICON_SLOT}>
        <CaretDownIcon className="size-[18px]" />
      </span>
      <span>{`Show ${count} more`}</span>
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
  onCloseAutoFocus,
  dependencies,
}: UniversalSearchPaletteProps & {
  dependencies: UniversalSearchPaletteDependencies;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [recents, setRecents] = useState<RecentResult[]>(() =>
    readRecentResults(dependencies.storage),
  );
  // cmdk's selection, held here so revealing a group's remaining rows can
  // hand the highlight to the first of them.
  const [selectedValue, setSelectedValue] = useState("");
  // Groups the visitor asked to see in full, remembered per query: a new
  // query folds every group back to its preview.
  const [expanded, setExpanded] = useState<{
    query: string;
    groups: readonly string[];
  }>({ query: "", groups: [] });
  // What the live region says after a group is revealed, kept per query.
  const [expansionNotice, setExpansionNotice] = useState<{
    query: string;
    text: string;
  } | null>(null);
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
      // cmdk's selection lives out here now, so it is forgotten with the
      // query: a reopened palette starts at the top, not on the row chosen
      // last time, and Enter cannot open a row the visitor never saw.
      setSelectedValue("");
      setExpanded({ query: "", groups: [] });
      setExpansionNotice(null);
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

  const expandedGroups =
    expanded.query === normalizedQuery ? expanded.groups : [];

  const expandGroup = (
    groupKey: string,
    group: SearchResult["group"],
    heading: string,
    hidden: readonly SearchResult[],
  ) => {
    // Hand the highlight to the first revealed row before the "Show more"
    // row leaves. cmdk sends a vanished selection back to the top of the
    // list, and it decides that from the DOM as the row unmounts, so the
    // selection must already have moved by then.
    const first = hidden[0];
    if (first) flushSync(() => setSelectedValue(first.id));
    setExpanded((current) => ({
      query: normalizedQuery,
      groups: [
        ...(current.query === normalizedQuery ? current.groups : []),
        groupKey,
      ],
    }));
    setExpansionNotice({
      query: normalizedQuery,
      text: `${hidden.length} more ${heading} ${hidden.length === 1 ? "result" : "results"} shown`,
    });
    captureAnalytics(
      "universal_search_group_expanded",
      universalSearchGroupExpandedProperties({
        group,
        hiddenCount: hidden.length,
      }),
    );
  };

  /** A group's rows: the preview and a row offering the rest, or every row
   * once the visitor has asked. `rank` stays the provider-wide position
   * for selection analytics. */
  const groupRows = (
    groupKey: string,
    group: AsyncSearchGroup,
    heading: string,
    entries: readonly { result: SearchResult; rank: number }[],
  ) => {
    const open = expandedGroups.includes(groupKey);
    const shown = open ? entries : entries.slice(0, RESULT_GROUP_PREVIEW);
    const hidden = open ? [] : entries.slice(RESULT_GROUP_PREVIEW);
    return (
      <>
        {shown.map(({ result, rank }) => (
          <SearchResultRow
            key={result.id}
            result={result}
            query={normalizedQuery}
            onSelect={() => selectSearchResult(result, rank)}
          />
        ))}
        {hidden.length > 0 && (
          <ShowMoreRow
            groupKey={groupKey}
            count={hidden.length}
            onSelect={() =>
              expandGroup(
                groupKey,
                group,
                heading,
                hidden.map((entry) => entry.result),
              )
            }
          />
        )}
      </>
    );
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
            "motion-safe:duration-150 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0",
            visualEffects.backdropBlur &&
              onWorldScene &&
              "backdrop-blur-[10px]",
          )}
        />
        <Dialog.Content
          data-universal-search-material=""
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            // Radix's modal default would focus a Dialog.Trigger we don't
            // have, stranding focus on body. The controller restores the
            // pre-open element instead — here, after the trap tears down;
            // restoring any earlier bounces off the still-active trap.
            event.preventDefault();
            onCloseAutoFocus?.();
          }}
          onFocusCapture={(event) => {
            // Radix only stops focus from LEAVING the dialog. cmdk's root
            // and list are tabindex="-1", so a click on a list gap, group
            // heading, or the footer silently moves focus onto a div and
            // typing dies. Only real controls may hold focus.
            const target = event.target;
            if (target === inputRef.current) return;
            if (
              target instanceof HTMLElement &&
              target.closest(
                "input, textarea, select, button, a[href], [contenteditable]:not([contenteditable='false'])",
              )
            ) {
              return;
            }
            inputRef.current?.focus();
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
            "motion-safe:duration-150 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95",
          )}
        >
          <Dialog.Title className="sr-only">Universal Search</Dialog.Title>
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="sr-only"
          >
            {expansionNotice?.query === normalizedQuery
              ? expansionNotice.text
              : providerAnnouncement}
          </div>
          <Command
            shouldFilter={false}
            label="Universal Search"
            value={selectedValue}
            onValueChange={setSelectedValue}
          >
            <div className="flex items-center gap-3 border-b border-border/70 px-4">
              <MagnifyingGlassIcon
                aria-hidden
                className="size-5 shrink-0 text-muted-foreground"
              />
              {/* No autoFocus: Radix's FocusScope must perform the initial
                  focus itself, or it never records a last-focused element and
                  its trap cannot reclaim focus from the scene later. */}
              <Command.Input
                ref={inputRef}
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
                      query={normalizedQuery}
                      location={dependencies.location}
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
                // stands in for everything still searching. Dad never gets
                // an error row: a transport failure marks every group
                // "error" before the server can say "skipped", and an
                // unavailable-row would advertise the private provider to
                // visitors who were never authorized to know it exists.
                if (
                  state.results.length === 0 &&
                  (state.status !== "error" || group === "dad")
                ) {
                  return null;
                }
                if (group === "public-writing" && state.results.length > 0) {
                  return publicWritingSubgroups(state.results).map(
                    (subgroup) => (
                      <ResultGroup
                        key={`${group}:${subgroup.heading}`}
                        heading={subgroup.heading}
                      >
                        {groupRows(
                          `${group}:${subgroup.heading}`,
                          group,
                          subgroup.heading,
                          subgroup.entries,
                        )}
                      </ResultGroup>
                    ),
                  );
                }
                return (
                  <ResultGroup
                    key={group}
                    heading={ASYNC_GROUP_PRESENTATION[group].heading}
                  >
                    {groupRows(
                      group,
                      group,
                      ASYNC_GROUP_PRESENTATION[group].heading,
                      state.results.map((result, rank) => ({ result, rank })),
                    )}
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
                      query={normalizedQuery}
                      location={dependencies.location}
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
                <KeycapSequence
                  keys={["ArrowUp", "ArrowDown"]}
                  label="Up and down arrows"
                />
                Navigate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Keycap aria-hidden="true">Enter</Keycap>
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
          pushSameDocument: (path) => window.history.pushState(null, "", path),
          notifyExplicitDestination: () =>
            window.dispatchEvent(new HashChangeEvent("hashchange")),
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

  return (
    <UniversalSearchPaletteContent {...props} dependencies={dependencies} />
  );
}
