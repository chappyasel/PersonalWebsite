const COVER_PROBE_TIMEOUT_MS = 5_000;

function isImageResponse(response: Response): boolean {
  return (
    response.headers.get("content-type")?.toLowerCase().startsWith("image/") ===
    true
  );
}

/**
 * Return true for cover values that are certainly web pages rather than image
 * resources. This check is deliberately conservative because Google Books
 * serves valid cover images from extensionless URLs.
 */
export function shouldRepairCover(coverUrl: string | null): boolean {
  if (!coverUrl) return false;

  try {
    const url = new URL(coverUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return true;

    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();
    const isAmazonStorefront =
      hostname === "amazon.com" ||
      hostname === "www.amazon.com" ||
      hostname.endsWith(".amazon.com");

    return (
      (isAmazonStorefront &&
        /\/(?:dp|gp\/product|gp\/aw\/d)\/[a-z0-9]{10}(?:\/|$)/i.test(
          pathname,
        )) ||
      /\.(?:html?|php|pdf)$/i.test(pathname)
    );
  } catch {
    return true;
  }
}

/**
 * Verify that a remote cover URL resolves to an image without downloading the
 * full file. Some image hosts reject HEAD, so retry with a one-byte ranged GET.
 */
export async function isCoverImageUrl(
  coverUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const url = new URL(coverUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const headResponse = await fetchImpl(coverUrl, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(COVER_PROBE_TIMEOUT_MS),
    });
    if (headResponse.ok) return isImageResponse(headResponse);

    const getResponse = await fetchImpl(coverUrl, {
      headers: { Range: "bytes=0-0" },
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(COVER_PROBE_TIMEOUT_MS),
    });
    const isImage = getResponse.ok && isImageResponse(getResponse);
    await getResponse.body?.cancel();
    return isImage;
  } catch {
    return false;
  }
}
