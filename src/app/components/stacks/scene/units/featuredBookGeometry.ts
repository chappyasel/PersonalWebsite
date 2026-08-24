/** Length metadata, normalized to 0…1 across the readable shelf range. One
 * function so a face-out fore-edge and a spine-out width cannot disagree
 * about how long a book is. Audiobooks use a conservative runtime-to-page
 * equivalent when the source has no printed page count. */
export function bookLengthFraction(
  pages: number | null,
  audioMin: number | null,
): number {
  const equivalentPages = pages ?? (audioMin ? audioMin / 2.25 : 320);
  return Math.max(0, Math.min(1, (equivalentPages - 120) / 780));
}

/** Translate library length metadata into a readable but restrained physical
 * fore-edge. */
export function featuredBookThickness(
  pages: number | null,
  audioMin: number | null,
): number {
  return 0.036 + bookLengthFraction(pages, audioMin) * 0.054;
}

/**
 * A packed spine's width, from the same length metadata.
 *
 * The range is packRow's own measured 0.046…0.14 — the invented widths this
 * replaces drew from two families (most books 0.048…0.084, a few 0.098…0.14)
 * so the row read as collected rather than extruded. Real page counts already
 * have that shape: a shelf of finished reads is mostly 200–400 pages with the
 * occasional 800-page doorstopper, so mapping length straight onto the same
 * interval keeps the silhouette and makes it TRUE. Squared on purpose — the
 * linear map bunched a real library's mid-range into one indistinguishable
 * width, and the curve pushes the long books out where they can be seen.
 */
export function spineBookWidth(
  pages: number | null,
  audioMin: number | null,
): number {
  return 0.046 + lengthCurve(pages, audioMin) * 0.094;
}

/** One curve, three dimensions. Declared once so width, height and (through
 * height) depth all respond to length in the same shape — a book that is long
 * is bigger everywhere, not just fatter in one axis. */
function lengthCurve(pages: number | null, audioMin: number | null): number {
  return Math.pow(bookLengthFraction(pages, audioMin), 0.72);
}

/**
 * A packed spine's height, from the same length metadata.
 *
 * Height moves far LESS than width — 0.40…0.54 before jitter against width's
 * 0.046…0.14 — and that asymmetry is the point. Real books vary enormously in
 * thickness and only modestly in trim size, so scaling every axis equally to
 * make volume track page count would give an 800-page book a comically tall
 * board. Thickness carries the length; height only leans that way.
 *
 * The jitter (0…1, the caller's own hash) is what keeps a shelf of similar
 * lengths from becoming a flat line, and it is deliberately wider than the
 * length term so two books of the same length are still different objects.
 *
 * This replaces a threshold — books over ~392 pages used to jump a whole
 * height band — which put a visible 25% step between two books a few pages
 * apart and keyed a real difference to an invisible cutoff.
 */
export function spineBookHeight(
  pages: number | null,
  audioMin: number | null,
  jitter: number,
): number {
  return 0.4 + lengthCurve(pages, audioMin) * 0.14 + jitter * 0.12;
}
