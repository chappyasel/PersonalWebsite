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
  year: parseAsInteger,
  hasNotes: parseAsBoolean,

  // Search
  search: parseAsString.withDefault(""),

  // Sort
  sort: parseAsString.withDefault("finished-desc"),

  // Modal (existing)
  book: parseAsString,
};
