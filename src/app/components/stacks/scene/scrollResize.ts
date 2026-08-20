export type ScrollResizeSnapshot = Readonly<{
  scrollLeft: number;
  scrollRange: number;
  nextScrollRange: number;
}>;

/** Keep the same normalized scene position when responsive layout changes the
 * horizontal scroll range. Browsers preserve scrollLeft in pixels, while
 * Drei reads it as a fraction of the available range. */
export function scrollLeftAfterResize({
  scrollLeft,
  scrollRange,
  nextScrollRange,
}: ScrollResizeSnapshot): number {
  if (scrollRange <= 0 || nextScrollRange <= 0) return 0;
  const offset = Math.min(1, Math.max(0, scrollLeft / scrollRange));
  return offset * nextScrollRange;
}
