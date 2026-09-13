export type MusingEmbed =
  | { provider: "x"; id: string; url: string }
  | { provider: "youtube"; id: string; url: string; src: string };

/** Only explicit media blocks use this. Links in prose stay ordinary links. */
export function musingEmbed(value: string): MusingEmbed | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) {
    const match =
      /^\/(?:[A-Za-z0-9_]+\/status|i\/web\/status)\/(\d+)(?:\/|$)/.exec(
        url.pathname,
      );
    if (match?.[1])
      return {
        provider: "x",
        id: match[1],
        url: `https://x.com/i/web/status/${match[1]}`,
      };
    return null;
  }
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0] ?? null;
  else if (
    ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)
  ) {
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (/^\/(?:embed|shorts|live)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ??
          null);
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
  const src = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  const start = url.searchParams.get("start") ?? url.searchParams.get("t");
  if (start && /^\d+$/.test(start)) src.searchParams.set("start", start);
  return {
    provider: "youtube",
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    src: src.href,
  };
}
