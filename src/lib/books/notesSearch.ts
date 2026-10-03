import { stripMarkup } from "~/lib/universal-search/server/excerpt";

/** Postgres wraps each matched word in these when it builds a headline.
 * Control characters, because the notes are Markdown and any printable
 * marker could already be in them. */
export const NOTE_MATCH_START = "\u0001";
export const NOTE_MATCH_END = "\u0002";

export const NOTE_SEARCH_MIN_QUERY_LENGTH = 2;
export const NOTE_SEARCH_MAX_QUERY_LENGTH = 80;
/** Above the size of the library, so the server returns every match. The
 * shelf intersects matches with its tag and rating filters afterwards, and
 * a smaller cap dropped most of a filtered search ("people" matches 213
 * books, and only 4 of the 34 tagged Politics were in the top 60). */
export const NOTE_SEARCH_MAX_ROWS = 1000;

const LINE_BREAK = " · ";
const MAX_LEAD_IN = 48;

export type NoteExcerptSegment = { text: string; match: boolean };

export type BookNoteMatch = {
  bookId: string;
  /** One passage from the notes, split so the shelf can set the matched
   * words in a heavier weight. */
  excerpt: NoteExcerptSegment[];
  /** The book page's id for the chapter or takeaway the passage came from,
   * so the row opens there. Null when the match spans passages. */
  anchor: string | null;
};

const ESCAPE_BASE = 0xe000;

/** Notion escapes punctuation it would otherwise read as Markdown (`\~75%`,
 * `\<skipped\>`). Park each escaped character in the private-use range so
 * stripMarkup neither deletes it as emphasis nor reads `\<…\>` as a tag. */
function protectEscapes(value: string) {
  return value.replace(/\\([!-/:-@[-`{-~])/g, (_, char: string) =>
    String.fromCharCode(ESCAPE_BASE + char.charCodeAt(0)),
  );
}

function restoreEscapes(value: string) {
  return value.replace(/[\ue021-\ue07e]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - ESCAPE_BASE),
  );
}

/** Postgres cuts a headline on a word count, which can land inside a link
 * or image. Keep the link text and drop the half that would show as raw
 * Markdown. A cut that holds a match marker is left alone. */
function trimCutLinks(value: string) {
  return value
    .replace(/^[^[\]\u0001\u0002]*\]\([^)\u0001\u0002]*\)?/, "")
    .replace(/!?\[([^\]\u0001\u0002]*)\]\([^)\u0001\u0002]*$/, "$1")
    .replace(/!?\[[^\]\u0001\u0002]*$/, "");
}

/** The query the shelf sends, or null when the box holds too little to
 * search for. One rule for the client's `enabled` and the server's input. */
export function noteSearchQuery(raw: string): string | null {
  // Control characters: Postgres rejects NUL in a text parameter, and the
  // match markers are control characters the caller must not supply.
  const query = raw
    .replace(/\p{Cc}/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (query.length < NOTE_SEARCH_MIN_QUERY_LENGTH) return null;
  return query.slice(0, NOTE_SEARCH_MAX_QUERY_LENGTH);
}

/**
 * Turn a Postgres headline over raw Markdown notes into plain segments.
 *
 * Returns null when the headline carries no marker. The search index also
 * covers title and author, so a book can match the query without its notes
 * mentioning it; Postgres then returns the opening words unmarked, and that
 * book does not belong under "Mentioned in Notes".
 */
export function noteExcerptSegments(
  headline: string,
): NoteExcerptSegment[] | null {
  if (!headline.includes(NOTE_MATCH_START)) return null;

  const plain = restoreEscapes(
    stripMarkup(
      trimCutLinks(protectEscapes(headline))
        // Notes are mostly bullets. Keep the breaks between them visible
        // once the passage is flattened to one run of text.
        .replace(/\\?\s*\n\s*(?:[-*+]\s+|#+\s+|>\s+)?/g, LINE_BREAK),
    ),
  )
    // A trailing backslash is a Markdown hard break.
    .replace(/\\(?=\s|$)/g, "")
    .replace(/(?:\s*·)+\s*/g, " · ")
    .replace(/^ · | · $/g, "")
    .trim();

  const segments: NoteExcerptSegment[] = [];
  const pattern = new RegExp(
    `${NOTE_MATCH_START}([^${NOTE_MATCH_END}]*)${NOTE_MATCH_END}`,
    "g",
  );
  let cursor = 0;
  for (const found of plain.matchAll(pattern)) {
    const before = plain.slice(cursor, found.index);
    if (before) segments.push({ text: before, match: false });
    if (found[1]) segments.push({ text: found[1], match: true });
    cursor = found.index + found[0].length;
  }
  const rest = plain.slice(cursor).replaceAll(NOTE_MATCH_START, "");
  if (rest) segments.push({ text: rest, match: false });
  if (!segments.some((segment) => segment.match)) return null;

  // The shelf clamps a row to two lines, and on a phone that is about
  // seventy characters. Keep the lead-in short so the matched word is on
  // screen, cutting at a word boundary.
  const first = segments[0]!;
  if (!first.match && first.text.length > MAX_LEAD_IN) {
    const tail = first.text.slice(-MAX_LEAD_IN);
    first.text = `…${tail.slice(tail.indexOf(" ") + 1).replace(/^· /, "")}`;
  } else if (/^[a-z]/.test(first.text)) {
    // A passage that opens mid-sentence reads as cut off without a lead-in.
    if (first.match) segments.unshift({ text: "…", match: false });
    else first.text = `…${first.text}`;
  }
  return segments;
}
