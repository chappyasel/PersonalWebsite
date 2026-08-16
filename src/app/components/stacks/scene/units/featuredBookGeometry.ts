/** Translate library length metadata into a readable but restrained physical
 * fore-edge. Audiobooks use a conservative runtime-to-page equivalent when
 * the source has no printed page count. */
export function featuredBookThickness(
  pages: number | null,
  audioMin: number | null,
): number {
  const equivalentPages = pages ?? (audioMin ? audioMin / 2.25 : 320);
  const normalized = Math.max(0, Math.min(1, (equivalentPages - 120) / 780));
  return 0.036 + normalized * 0.054;
}
