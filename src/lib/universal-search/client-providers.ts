import type { ServerSearchPayload } from "./useProgressiveSearch";

type SearchFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function isServerSearchPayload(value: unknown): value is ServerSearchPayload {
  if (!value || typeof value !== "object" || !("groups" in value)) return false;
  const groups = (value as { groups?: unknown }).groups;
  if (!groups || typeof groups !== "object") return false;

  return (["books", "weightlifting", "dad"] as const).every((name) => {
    const group = (groups as Record<string, unknown>)[name];
    if (!group || typeof group !== "object") return false;
    const candidate = group as { status?: unknown; results?: unknown };
    return (
      ["success", "error", "skipped"].includes(String(candidate.status)) &&
      Array.isArray(candidate.results)
    );
  });
}

export async function queryServerSearch(
  query: string,
  signal: AbortSignal,
  fetcher: SearchFetcher = fetch,
): Promise<ServerSearchPayload> {
  const response = await fetcher(`/api/search?q=${encodeURIComponent(query)}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Search provider unavailable");

  const payload: unknown = await response.json();
  if (!isServerSearchPayload(payload)) {
    throw new Error("Search provider unavailable");
  }
  return payload;
}
