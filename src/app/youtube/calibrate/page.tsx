import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { isValidYoutubeAccessToken } from "~/lib/youtube/access";

import { CalibrationSpreadsheet } from "./CalibrationSpreadsheet";
import { env } from "~/env";

export default async function YouTubeCalibrationPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const cookieStore = await cookies();
  if (
    !isValidYoutubeAccessToken(
      cookieStore.get("youtube-access")?.value,
      env.DAD_CONTENT_PASSWORD,
    )
  ) {
    redirect("/youtube");
  }
  return <CalibrationSpreadsheet />;
}
