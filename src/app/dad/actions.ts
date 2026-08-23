"use server";

import { cookies, headers } from "next/headers";

import {
  DAD_ACCESS_COOKIE_NAME,
  dadAccessCookieOptions,
  dadAccessToken,
  isValidDadPassword,
} from "~/lib/dad/access";

import { env } from "~/env";

export async function setDadAccessCookie(password: string) {
  if (!isValidDadPassword(password, env.DAD_CONTENT_PASSWORD)) return false;

  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const options = dadAccessCookieOptions(
    requestHeaders.get("host"),
    env.NODE_ENV === "production",
  );
  if (options.domain) {
    const hostOnlyOptions = {
      httpOnly: options.httpOnly,
      secure: options.secure,
      sameSite: options.sameSite,
      path: options.path,
    } as const;
    cookieStore.set(DAD_ACCESS_COOKIE_NAME, "", {
      ...hostOnlyOptions,
      maxAge: 0,
    });
  }
  cookieStore.set(
    DAD_ACCESS_COOKIE_NAME,
    dadAccessToken(env.DAD_CONTENT_PASSWORD),
    options,
  );
  return true;
}
