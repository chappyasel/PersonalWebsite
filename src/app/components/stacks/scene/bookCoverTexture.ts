import { enhanceCoverUrl } from "../../../../lib/books/coverUtils";
import { proxied } from "../theme";

/** Match the clean Google Books artwork used by the library before proxying it. */
export function proxiedBookCover(
  url: string,
  width: 48 | 256 | 384 = 384,
): string {
  return proxied(enhanceCoverUrl(url) ?? url, width);
}
