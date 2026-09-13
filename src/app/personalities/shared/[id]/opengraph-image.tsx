import { headers } from "next/headers";

import { renderPersonalityOg } from "~/lib/personalities/og";
import { getSharePreview } from "~/lib/personalities/server/share-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Shared Big Five personality results";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const share = await getSharePreview(id, await headers());
  if (!share)
    return new Response("Not found.", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  return renderPersonalityOg(share.snapshot);
}
