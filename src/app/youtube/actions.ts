"use server";

import { cookies } from "next/headers";

import { youtubeAccessToken } from "~/lib/youtube/access";

import { env } from "~/env";

export async function setYoutubeAccessCookie(password: string) {
  if (password !== env.DAD_CONTENT_PASSWORD) return false;
  (await cookies()).set("youtube-access", youtubeAccessToken(password), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return true;
}
