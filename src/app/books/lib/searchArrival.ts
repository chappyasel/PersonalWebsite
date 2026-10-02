import {
  SEARCH_HIGHLIGHT_PARAM,
  findTermRanges,
  highlightTerms,
} from "~/lib/books/searchHighlight";

/**
 * The marks' strength over time: the shelf's SearchMark amber at 25% while
 * the reader lands, then a fade. Highlights cannot transition, so each step
 * is its own named highlight, styled once by `ensureHighlightStyles`.
 * Every step re-reads the notes, so a re-render that replaces text nodes
 * cannot leave the marks pointing at detached ones.
 */
const STEPS: ReadonlyArray<{ at: number; alpha: number }> = [
  { at: 0, alpha: 0.25 },
  // Re-reads at full strength while the page settles (layout, the scroll
  // to the chapter, a takeaway opening).
  { at: 150, alpha: 0.25 },
  { at: 800, alpha: 0.25 },
  ...[0.22, 0.19, 0.16, 0.13, 0.1, 0.07, 0.04, 0.02].map((alpha, index) => ({
    at: 3500 + index * 75,
    alpha,
  })),
];
const CLEAR_AT = 3500 + 8 * 75;

const stepName = (alpha: number) =>
  `book-search-arrival-${Math.round(alpha * 100)}`;
const NAMES = [...new Set(STEPS.map((step) => stepName(step.alpha)))];

// The keys Next's router keeps in a history entry's state.
const NEXT_HISTORY_KEYS = new Set([
  "__NA",
  "_N",
  "__PRIVATE_NEXTJS_INTERNALS_TREE",
]);

// Nothing to undo when nothing was marked.
const unmarked = () => undefined;

/**
 * The marks' colours, added to the page the first time one is drawn. They
 * live here rather than in globals.css because the build's CSS parser
 * rejects `::highlight()` and fails the stylesheet.
 */
function ensureHighlightStyles() {
  if (document.querySelector("style[data-book-search-arrival]")) return;
  const style = document.createElement("style");
  style.dataset.bookSearchArrival = "";
  style.textContent = STEPS.flatMap(({ alpha }) => [
    `::highlight(${stepName(alpha)}) { background-color: rgb(245 158 11 / ${alpha}); }`,
    `.dark ::highlight(${stepName(alpha)}) { background-color: rgb(252 211 77 / ${alpha}); }`,
  ]).join("\n");
  document.head.append(style);
}

/**
 * The search this arrival should mark, read once from `?hl=` and then
 * removed from the address, so a reload, a link copied from the bar, or a
 * later book opened from this view (tag links and read switching copy the
 * query string) does not mark it again. The history entry's own state is
 * kept, and the router learns the new address.
 */
export function takeSearchArrivalQuery(): string | null {
  const url = new URL(window.location.href);
  const query = url.searchParams.get(SEARCH_HIGHLIGHT_PARAM);
  if (query === null) return null;
  url.searchParams.delete(SEARCH_HIGHLIGHT_PARAM);
  // Without Next's own markers: its patched replaceState passes a state
  // that carries them straight through, and the router (useSearchParams,
  // the links built from it) would keep `hl`. Given a plain state it copies
  // its markers back and moves the router to the new address.
  const state = Object.fromEntries(
    Object.entries(
      (window.history.state ?? {}) as Record<string, unknown>,
    ).filter(([key]) => !NEXT_HISTORY_KEYS.has(key)),
  );
  window.history.replaceState(
    state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
  return query;
}

/**
 * Mark the arriving search's words under `root` with the CSS Custom
 * Highlight API, hold them, then step them down to nothing. Nothing in the
 * rendered notes changes, so React never sees the marks, and text inside a
 * folded takeaway is marked too and shows when the takeaway opens. Without
 * the API (older browsers) the notes stay unmarked. Returns a cleanup.
 */
export function markSearchArrival(
  root: Element | null,
  query: string | null,
): () => void {
  if (!root || !query?.trim() || typeof CSS === "undefined") return unmarked;
  if (!("highlights" in CSS) || typeof Highlight === "undefined")
    return unmarked;
  const stems = highlightTerms(query);
  if (!findTermRanges(root, stems).length) return unmarked;

  ensureHighlightStyles();
  const registry = CSS.highlights;
  const clear = () => NAMES.forEach((name) => registry.delete(name));
  const show = (alpha: number) => {
    clear();
    const ranges = findTermRanges(root, stems);
    if (ranges.length) registry.set(stepName(alpha), new Highlight(...ranges));
  };

  show(STEPS[0]!.alpha);
  const timers = [
    ...STEPS.slice(1).map(({ at, alpha }) =>
      window.setTimeout(() => show(alpha), at),
    ),
    window.setTimeout(clear, CLEAR_AT),
  ];
  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    clear();
  };
}
