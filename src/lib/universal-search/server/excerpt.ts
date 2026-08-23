const MAX_EXCERPT_CODE_POINTS = 220;

function stripMarkup(value: string) {
  return value
    .replace(/&(?:lt|#0*60|#x0*3c);/gi, "<")
    .replace(/&(?:gt|#0*62|#x0*3e);/gi, ">")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)[#>*_~`-]+(?=\s|$)/g, " ")
    .replace(/[*_~`]/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function clipCodePoints(value: string, start: number, length: number) {
  return Array.from(value)
    .slice(start, start + length)
    .join("");
}

export function createServerExcerpt(body: string, rawQuery: string) {
  const plain = stripMarkup(body);
  const points = Array.from(plain);
  if (points.length <= MAX_EXCERPT_CODE_POINTS) return plain;

  const query = rawQuery.trim().toLocaleLowerCase();
  const matchIndex = plain.toLocaleLowerCase().indexOf(query);
  const codeUnitPrefix = matchIndex < 0 ? "" : plain.slice(0, matchIndex);
  const matchPointIndex = Array.from(codeUnitPrefix).length;
  const desiredStart = Math.max(
    0,
    matchPointIndex - Math.floor((MAX_EXCERPT_CODE_POINTS - query.length) / 2),
  );
  const maxStart = Math.max(0, points.length - MAX_EXCERPT_CODE_POINTS);
  const start = Math.min(desiredStart, maxStart);
  const clipped = clipCodePoints(plain, start, MAX_EXCERPT_CODE_POINTS);

  return `${start > 0 ? "…" : ""}${clipCodePoints(
    clipped,
    start > 0 ? 1 : 0,
    MAX_EXCERPT_CODE_POINTS -
      (start > 0 ? 1 : 0) -
      (start + MAX_EXCERPT_CODE_POINTS < points.length ? 1 : 0),
  )}${start + MAX_EXCERPT_CODE_POINTS < points.length ? "…" : ""}`;
}
