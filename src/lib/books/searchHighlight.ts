/**
 * The search a visitor arrived with, marked in the book's notes for a few
 * seconds. Links from a notes match (the shelf's "Mentioned in Notes" rows,
 * the Command palette) carry the query as `?hl=`; the book page marks every
 * word it names, then fades the marks out.
 */
export const SEARCH_HIGHLIGHT_PARAM = "hl";

/**
 * A query string with the arrival mark taken out. Links built from the
 * current address (a cover, a tag, the next read) carry the shelf's state
 * but never `?hl=`; only a notes match adds it (noteMatchHref).
 */
export function withoutSearchHighlight(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(SEARCH_HIGHLIGHT_PARAM);
  return params.toString();
}

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
 * A word's stem, cut only where the ending is plainly a suffix. Notes and
 * queries are both cut this way and compared whole, so "habits" marks
 * "habit" and "trusting" marks "trusted", while "notes" leaves "not",
 * "string" leaves "strong", and "evening" leaves "even" alone. A stem that
 * would be very short keeps the word whole: missing a mark beats marking
 * the wrong word.
 */
export function wordStem(word: string): string {
  let stem = word.toLowerCase();
  if (stem.endsWith("ies") && stem.length > 4) stem = `${stem.slice(0, -3)}y`;
  else if (/(?:ss|[xz]|ch|sh)es$/.test(stem)) stem = stem.slice(0, -2);
  else if (/[^s]s$/.test(stem) && stem.length > 4) stem = stem.slice(0, -1);
  if (stem.endsWith("ing") && stem.length >= 8) stem = stem.slice(0, -3);
  else if (stem.endsWith("ed") && stem.length >= 7) stem = stem.slice(0, -2);
  return stem;
}

const WORD = /[\p{L}\p{N}]+/gu;

/** A search is a few words; `?hl=` arrives in a URL anyone can write. */
const MAX_QUERY_LENGTH = 200;
const MAX_TERMS = 8;

/** The stems of a query's words worth marking, stopwords dropped. */
export function highlightTerms(query: string): string[] {
  const words =
    query.slice(0, MAX_QUERY_LENGTH).toLowerCase().match(WORD) ?? [];
  const stems = words
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map(wordStem)
    .filter((stem) => !STOPWORDS.has(stem));
  return [...new Set(stems)].slice(0, MAX_TERMS);
}

/**
 * A Range over every word under `root` whose stem is one of `stems`.
 * Screen-reader-only text (a copy-link button's label) is skipped.
 */
export function findTermRanges(root: Node, stems: string[]): Range[] {
  if (!stems.length) return [];
  const wanted = new Set(stems);
  const document = root.ownerDocument ?? (root as Document);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(".sr-only, script, style")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const ranges: Range[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const match of (node.nodeValue ?? "").matchAll(WORD)) {
      if (!wanted.has(wordStem(match[0]))) continue;
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      ranges.push(range);
    }
  }
  return ranges;
}
