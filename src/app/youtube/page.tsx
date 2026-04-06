import { cookies } from "next/headers";

import { YouTubeDashboard } from "./components/YouTubeDashboard";
import { YouTubePasswordGate } from "./components/YouTubePasswordGate";

export default async function YouTubePage() {
  const cookieStore = await cookies();
  const hasAccess = cookieStore.get("youtube-access")?.value;

  if (!hasAccess) {
    return <YouTubePasswordGate />;
  }

  return <YouTubeDashboard />;
}
