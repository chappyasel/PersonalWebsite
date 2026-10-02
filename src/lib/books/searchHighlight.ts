/**
 * The search a visitor arrived with, marked in the book's notes for a few
 * seconds. Links from a notes match (the shelf's "Mentioned in notes" rows,
 * the Command palette) carry the query as `?hl=`; the book page marks every
 * word it names, then fades the marks out.
 */
export const SEARCH_HIGHLIGHT_PARAM = "hl";

/** The CSS Custom Highlight names, strongest first; searchArrival.ts styles each. */
export const SEARCH_HIGHLIGHT_STEPS = [
  "book-search-arrival",
  "book-search-arrival-fade-1",
  "book-search-arrival-fade-2",
  "book-search-arrival-fade-3",
  "book-search-arrival-fade-4",
] as const;

// The words Postgres's English search drops, the ones a visitor typing a
// phrase does not mean to find.
const STOPWORDS = new Set(
  (
    "a about above after again against all am an and any are as at be because " +
    "been before being below between both but by can did do does doing down " +
    "during each few for from further had has have having he her here hers " +
    "herself him himself his how i if in into is it its itself just me more " +
    "most my myself no nor not now of off on once only or other our ours " +
    "ourselves out over own same she should so some such than that the their " +
    "theirs them themselves then there these they this those through to too " +
    "under until up very was we were what when where which while who whom " +
    "why will with you your yours yourself yourselves"
  ).split(" "),
);

/**
 * The words of a query worth marking, each cut to a stem so the marks
 * follow the search's stemming closely enough: "habits" marks "habit" and
 * "habitual", "trust" marks "trusted" but not "mistrust".
 */
export function highlightTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = words
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map((word) => {
      const stem = word.replace(/(?:ing|ed|es|s)$/, "");
      return stem.length >= 3 ? stem : word;
    });
  return [...new Set(terms)];
}

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A Range over every word under `root` that starts with one of the terms.
 * Screen-reader-only text (a copy-link button's label) is skipped.
 */
export function findTermRanges(root: Node, terms: string[]): Range[] {
  if (!terms.length) return [];
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRegExp).join("|")})[\\p{L}\\p{N}]*`,
    "giu",
  );
  const document = root.ownerDocument ?? (root as Document);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(".sr-only, script, style")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const match of (node.nodeValue ?? "").matchAll(pattern)) {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      ranges.push(range);
    }
  }
  return ranges;
}
