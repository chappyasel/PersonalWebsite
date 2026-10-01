import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs";

export const searchParamsParsers = {
  // Filters
  tags: parseAsArrayOf(parseAsString).withDefault([]),
  minRating: parseAsInteger,
  hasNotes: parseAsBoolean,
  hasSummary: parseAsBoolean,
  isReread: parseAsBoolean,
  // Abandoned books are hidden by default; true includes them in the shelf
  abandoned: parseAsBoolean,

  // Search. The key is `q` because `search` belongs to the Command palette
  // (UNIVERSAL_SEARCH_PARAM): sharing it opened the palette on every
  // keystroke, and closing the palette deleted the filter.
  q: parseAsString.withDefault(""),

  // Sort — `sort` is the field, `order` the direction (absent = field default).
  // Legacy combined values ("finished-desc") are still accepted by resolveSort.
  sort: parseAsString.withDefault("finished"),
  order: parseAsString,

  // Size
  size: parseAsString.withDefault("M"),
};
