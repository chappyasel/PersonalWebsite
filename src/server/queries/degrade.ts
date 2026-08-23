/**
 * Run a data loader and, if it throws, log it and return a neutral value
 * instead of propagating. The page renders without that data.
 *
 * Only for data a page can stand without: covers on a shelf, thumbnails
 * beside prose, counts on a placard. A route whose whole subject is the query
 * should let the error through and say so on its own error screen. Silently
 * degrading there would show an empty page that looks like the real answer.
 *
 * Failures are logged rather than swallowed. An outage that renders a
 * plausible-looking page and leaves nothing behind is worse than one that
 * breaks loudly.
 */
export async function orEmpty<T>(
  label: string,
  load: () => Promise<T>,
  empty: T,
): Promise<T> {
  try {
    return await load();
  } catch (error) {
    console.error(`[${label}] failed, rendering without it:`, error);
    return empty;
  }
}
