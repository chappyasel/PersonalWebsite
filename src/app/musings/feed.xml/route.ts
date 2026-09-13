import { musings } from "~/lib/musings/content";
import { musingsFeed } from "~/lib/musings/feed";

export const dynamic = "force-static";
export function GET() {
  return new Response(musingsFeed(musings), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
