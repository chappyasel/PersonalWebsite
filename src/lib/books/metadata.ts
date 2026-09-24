import type { BaseBook } from "./types";

export type MetadataInput = Pick<
  BaseBook,
  | "title"
  | "author"
  | "coverUrl"
  | "publicationYear"
  | "pageCount"
  | "audioLengthMin"
  | "audibleUrl"
>;
export type MetadataPatch = Partial<Omit<MetadataInput, "title">>;
export type MetadataCandidate = {
  source: "google" | "audible";
  id: string;
  title: string;
  authors: string[];
  coverUrl?: string;
  publicationYear?: number;
  pageCount?: number;
  audioLengthMin?: number;
};
export type MetadataFailure = {
  source: MetadataCandidate["source"];
  code: "http" | "invalid_response" | "truncated" | "request_failed";
  httpStatus?: number;
};
export type MetadataEvidence = {
  candidates: MetadataCandidate[];
  failures: MetadataFailure[];
};
export type MetadataDecision = {
  status:
    | "matched"
    | "ambiguous"
    | "conflict"
    | "not_found"
    | "insufficient_evidence"
    | "upstream_error";
  reason: string;
  patch: MetadataPatch;
  unresolved: string[];
  evidence: MetadataCandidate[];
  failures: MetadataFailure[];
};

const fields = [
  "author",
  "coverUrl",
  "publicationYear",
  "pageCount",
  "audioLengthMin",
  "audibleUrl",
] as const;
export function needsMetadata(book: MetadataInput): boolean {
  return fields.some((field) => blank(book[field]));
}
function blank(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}
function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
function titleMatches(wanted: string, found: string): boolean {
  // A missing subtitle is allowed, but word prefixes and removed articles are not.
  return (
    !!normalize(wanted) &&
    (normalize(wanted) === normalize(found) ||
      (!wanted.includes(":") &&
        normalize(wanted) === normalize(found.split(":")[0] ?? "")))
  );
}
export function audibleAsin(value: string | null): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (
      !/^(www\.)?audible\.(com|co\.uk|com\.au|ca|de|fr|co\.jp|in|it|es)$/.test(
        url.hostname,
      )
    )
      return;
    return /\/pd\/(?:[^/]+\/)?([A-Z0-9]{10})(?:\/|$)/i
      .exec(url.pathname)?.[1]
      ?.toUpperCase();
  } catch {
    return;
  }
}

/** Pure decision: never select a catalog's first result or infer tags/estimated pages. */
export function identifyMetadata(
  book: MetadataInput,
  evidence: MetadataEvidence,
): MetadataDecision {
  const result: MetadataDecision = {
    status: "not_found",
    reason:
      "No exact title and author evidence. Verify the title or supply Author / Audible in Notion.",
    patch: {},
    unresolved: [],
    evidence: evidence.candidates,
    failures: evidence.failures,
  };
  const stop = (status: MetadataDecision["status"], reason: string) => ({
    ...result,
    status,
    reason,
    unresolved: fields.filter((field) => blank(book[field])),
  });
  // Failure invalidates only that source. Known identity can use healthy sources.
  const unavailable = (source: MetadataCandidate["source"]) =>
    evidence.failures.some((failure) => failure.source === source);
  const available = evidence.candidates.filter((c) => !unavailable(c.source));
  const exact = available.filter(
    (c) => titleMatches(book.title, c.title) && c.authors[0]?.trim(),
  );
  const asin = audibleAsin(book.audibleUrl);
  const anchored = asin
    ? available.find((c) => c.source === "audible" && c.id === asin)
    : undefined;
  if (
    asin &&
    !unavailable("audible") &&
    (!anchored || !exact.includes(anchored))
  )
    return stop(
      "conflict",
      "Existing Audible identifier does not match the title; verify the linked edition.",
    );
  const manualAuthor = normalize(book.author);
  const anchorAuthor = normalize(anchored?.authors[0] ?? "");
  if (manualAuthor && anchorAuthor && manualAuthor !== anchorAuthor)
    return stop(
      "conflict",
      "Author conflicts with the existing Audible identifier; review both Notion fields.",
    );
  const author = manualAuthor || anchorAuthor;
  if (!author && evidence.failures.length)
    return stop(
      "upstream_error",
      "Author discovery needs both catalogs or the linked Audible product; retry unavailable sources.",
    );
  const matches = exact.filter(
    (c) => !author || normalize(c.authors[0] ?? "") === author,
  );
  if (!matches.length)
    return stop(
      exact.length ? "conflict" : "not_found",
      "No candidate matches the recorded title and author; verify Notion identity fields.",
    );
  const authors = new Set(matches.map((c) => normalize(c.authors[0]!)));
  if (authors.size !== 1)
    return stop(
      "ambiguous",
      "Multiple authors share this title; supply Author or a verified Audible URL in Notion.",
    );
  if (!author && new Set(matches.map((c) => c.source)).size < 2)
    return stop(
      "insufficient_evidence",
      "Missing author requires agreement from both catalogs or an existing Audible identifier.",
    );

  const patch = result.patch;
  if (blank(book.author))
    patch.author = matches.map((c) => c.authors[0]!).sort()[0];
  const print = matches.filter(
    (c) =>
      c.source === "google" &&
      (book.pageCount == null || c.pageCount === book.pageCount) &&
      (book.publicationYear == null ||
        c.publicationYear === book.publicationYear),
  );
  const audioMatches = matches.filter(
    (c) => c.source === "audible" && (!asin || c.id === asin),
  );
  const audio = audioMatches.filter(
    (c) =>
      !!anchored ||
      book.audioLengthMin == null ||
      c.audioLengthMin === book.audioLengthMin,
  );
  const runtimeConflict =
    !anchored &&
    book.audioLengthMin != null &&
    audioMatches.length > 0 &&
    audio.length === 0;
  // Nonempty unrecognized links cannot justify a runtime for a different product.
  const audioAllowed = blank(book.audibleUrl) || !!anchored;
  const unique = <T>(values: Array<T | undefined>): T | undefined => {
    const present = new Set(values.filter((v): v is T => v !== undefined));
    return present.size === 1 ? [...present][0] : undefined;
  };
  const cover = unique(print.map((c) => c.coverUrl));
  const pages = unique(print.map((c) => c.pageCount));
  const year = unique(print.map((c) => c.publicationYear));
  const audioId = unique(audio.map((c) => c.id));
  const runtime = unique(audio.map((c) => c.audioLengthMin));
  if (blank(book.coverUrl) && cover) patch.coverUrl = cover;
  if (book.pageCount == null && pages) patch.pageCount = pages;
  if (book.publicationYear == null && year) patch.publicationYear = year;
  if (audioAllowed && audioId) {
    if (blank(book.audibleUrl))
      patch.audibleUrl = `https://www.audible.com/pd/${audioId}`;
    if (book.audioLengthMin == null && runtime) patch.audioLengthMin = runtime;
  }
  result.status = runtimeConflict ? "conflict" : "matched";
  result.unresolved = fields.filter(
    (field) => blank(book[field]) && blank(patch[field]),
  );
  result.reason = result.unresolved.length
    ? "Identity matched; missing or conflicting edition fields remain blank. Verify a specific edition in Notion."
    : "Exact title and recorded author, linked identifier, or independent catalog agreement.";
  if (runtimeConflict)
    result.reason +=
      " Recorded runtime conflicts with the catalog edition; verify an Audible product URL before linking it.";
  return result;
}

/** Rotate over ALL pages, not a shrinking pending prefix. The global sync ordinal persists progress. */
export function selectMetadataBatch<
  T extends MetadataInput & { notionId: string },
>(books: T[], runOrdinal: number, limit = 20): T[] {
  const ordered = [...books].sort((a, b) =>
    a.notionId.localeCompare(b.notionId),
  );
  if (!ordered.length) return [];
  const start = ((runOrdinal - 1) * limit) % ordered.length;
  return Array.from(
    { length: Math.min(limit, ordered.length) },
    (_, i) => ordered[(start + i) % ordered.length]!,
  ).filter(needsMetadata);
}
