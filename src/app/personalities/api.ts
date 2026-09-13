export async function api<T = unknown>(
  path: string,
  body?: unknown,
  method?: string,
) {
  const response = await fetch(`/api/personalities/${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    cache: "no-store",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Personality-Request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = new Error(
      (value as { error?: string }).error ?? "Request failed.",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return value as T;
}
