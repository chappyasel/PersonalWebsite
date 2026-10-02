import {
  SEARCH_HIGHLIGHT_STEPS,
  findTermRanges,
  highlightTerms,
} from "~/lib/books/searchHighlight";

// Nothing to undo when nothing was marked.
const unmarked = () => undefined;

/** Each step's strength, the shelf's SearchMark amber at 25% stepping down. */
const STEP_ALPHAS = [0.25, 0.19, 0.13, 0.07, 0.03];

/**
 * The marks' colours, added to the page the first time one is drawn. They
 * live here rather than in globals.css because the build's CSS parser
 * rejects `::highlight()` and fails the stylesheet.
 */
function ensureHighlightStyles() {
  if (document.querySelector("style[data-book-search-arrival]")) return;
  const style = document.createElement("style");
  style.dataset.bookSearchArrival = "";
  style.textContent = SEARCH_HIGHLIGHT_STEPS.flatMap((name, index) => [
    `::highlight(${name}) { background-color: rgb(245 158 11 / ${STEP_ALPHAS[index]}); }`,
    `.dark ::highlight(${name}) { background-color: rgb(252 211 77 / ${STEP_ALPHAS[index]}); }`,
  ]).join("\n");
  document.head.append(style);
}

/** How long the marks stay at full strength once the notes are in. */
const HOLD_MS = 3500;
/** Highlights cannot transition, so the fade is steps this far apart. */
const FADE_STEP_MS = 150;

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
  const ranges = findTermRanges(root, highlightTerms(query));
  if (!ranges.length) return unmarked;

  ensureHighlightStyles();
  const registry = CSS.highlights;
  const highlight = new Highlight(...ranges);
  const clear = () =>
    SEARCH_HIGHLIGHT_STEPS.forEach((name) => registry.delete(name));
  const show = (name: string) => {
    clear();
    registry.set(name, highlight);
  };

  show(SEARCH_HIGHLIGHT_STEPS[0]);
  const timers = [
    ...SEARCH_HIGHLIGHT_STEPS.slice(1).map((name, index) =>
      window.setTimeout(() => show(name), HOLD_MS + index * FADE_STEP_MS),
    ),
    window.setTimeout(
      clear,
      HOLD_MS + (SEARCH_HIGHLIGHT_STEPS.length - 1) * FADE_STEP_MS,
    ),
  ];
  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    clear();
  };
}
