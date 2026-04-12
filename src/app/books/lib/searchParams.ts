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

  // Search
  search: parseAsString.withDefault(""),

  // Sort
  sort: parseAsString.withDefault("finished-desc"),

  // Size
  size: parseAsString.withDefault("M"),
};
