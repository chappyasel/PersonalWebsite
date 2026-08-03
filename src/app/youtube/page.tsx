import { cookies } from "next/headers";

import { isValidYoutubeAccessToken } from "~/lib/youtube/access";

import { YouTubeDashboard } from "./components/YouTubeDashboard";
import { YouTubePasswordGate } from "./components/YouTubePasswordGate";

import { env } from "~/env";

export default async function YouTubePage() {
  const cookieStore = await cookies();
  const hasAccess = isValidYoutubeAccessToken(
    cookieStore.get("youtube-access")?.value,
    env.DAD_CONTENT_PASSWORD,
  );

  if (!hasAccess) {
    return <YouTubePasswordGate />;
  }

  return <YouTubeDashboard />;
}
