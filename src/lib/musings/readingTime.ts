/** Use the full article, or a saved word count for an externally hosted essay. */
export function musingReadingMinutes(post: {
  searchText?: string;
  readingWordCount?: number;
}): number | null {
  const text = post.searchText?.trim();
  const words = text ? text.split(/\s+/).length : post.readingWordCount;
  if (!words || !Number.isFinite(words) || words < 0) return null;
  return Math.max(1, Math.ceil(words / 230));
}
