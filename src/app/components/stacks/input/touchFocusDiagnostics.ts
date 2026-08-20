"use client";

const DEBUG_QUERY = "touch-debug";

function enabled() {
  return (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has(DEBUG_QUERY)
  );
}

export function publishTouchFocusDiagnostic(
  stage: string,
  details: Record<string, unknown>,
) {
  if (!enabled()) return;
  void fetch("/api/stacks-touch-debug", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ stage, details, at: Date.now() }),
    keepalive: true,
  }).catch(() => undefined);
}
