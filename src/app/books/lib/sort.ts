export const SORT_FIELDS = [
  "finished",
  "title",
  "rating",
  "publicationYear",
  "runtime",
  "pageCount",
  "color",
] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = "asc" | "desc";

/** Natural direction applied when a field is first selected */
export const DEFAULT_SORT_ORDER: Record<SortField, SortOrder> = {
  finished: "desc",
  title: "asc",
  rating: "desc",
  publicationYear: "desc",
  runtime: "desc",
  pageCount: "desc",
  // Red through violet, then the earth tones and neutrals
  color: "asc",
};

function isSortField(value: string): value is SortField {
  return (SORT_FIELDS as readonly string[]).includes(value);
}

/**
 * Resolve the active sort from the `sort` + `order` params.
 * Also accepts the legacy combined format (`?sort=finished-desc`) so old
 * shared links keep working; an explicit `order` param wins over the suffix.
 */
export function resolveSort(
  sort: string | null,
  order: string | null,
): [SortField, SortOrder] {
  let fieldPart = sort ?? "finished";
  let orderPart = order;

  if (fieldPart.includes("-")) {
    const [legacyField, legacyOrder] = fieldPart.split("-");
    fieldPart = legacyField ?? "finished";
    orderPart ??= legacyOrder ?? null;
  }

  const field = isSortField(fieldPart) ? fieldPart : "finished";
  const resolvedOrder =
    orderPart === "asc" || orderPart === "desc"
      ? orderPart
      : DEFAULT_SORT_ORDER[field];
  return [field, resolvedOrder];
}
