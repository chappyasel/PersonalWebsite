import type { SharedSnapshot } from "../sharing";
import "server-only";

import {
  configuredOrigin,
  personalitiesEnabled,
  requestOrigin,
} from "./config";
import { db } from "./database";

// A share's random UUID grants access to its OG card, never the library or
// snapshot API. The separate snapshot capability remains in the URL fragment.
export async function getSharePreview(id: string, requestHeaders: Headers) {
  if (
    !personalitiesEnabled() ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      id,
    )
  )
    return null;
  const host = requestHeaders.get("host");
  if (!host) return null;
  let origin: string | null;
  try {
    origin = requestOrigin(
      new Request(configuredOrigin() ?? `http://${host}`, {
        headers: requestHeaders,
      }),
    );
  } catch {
    return null;
  }
  if (!origin) return null;
  const share = await db()
    .prepare(
      "SELECT snapshot FROM personality_shares WHERE id=$1 AND (expires_at IS NULL OR expires_at>$2)",
    )
    .bind(id, Date.now())
    .first<{ snapshot: SharedSnapshot }>();
  return share ? { snapshot: share.snapshot, origin } : null;
}
