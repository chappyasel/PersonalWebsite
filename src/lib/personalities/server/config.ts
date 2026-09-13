const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function configuredOrigin(): string | null {
  const value = process.env.PERSONALITIES_ORIGIN;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return null;
    if (
      url.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        url.protocol === "http:" &&
        localHosts.has(url.hostname)
      )
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function personalitiesEnabled() {
  if (process.env.VERCEL_ENV === "preview") return false;
  return process.env.NODE_ENV !== "production" || configuredOrigin() !== null;
}

export function requestOrigin(request: Request): string | null {
  if (!personalitiesEnabled()) return null;
  const url = new URL(request.url);
  const origin = configuredOrigin();
  // Match the externally supplied Host, never an arbitrary forwarded host.
  const host = request.headers.get("host") ?? url.host;
  if (origin) return host === new URL(origin).host ? origin : null;
  if (process.env.NODE_ENV === "production" || process.env.PERSONALITIES_ORIGIN)
    return null;
  try {
    const external = new URL(`${url.protocol}//${host}`);
    if (
      !localHosts.has(url.hostname) ||
      !localHosts.has(external.hostname) ||
      external.host !== host ||
      external.port !== url.port
    )
      return null;
    return external.origin;
  } catch {
    return null;
  }
}
