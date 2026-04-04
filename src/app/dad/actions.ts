"use server";

import { cookies } from "next/headers";

export async function setDadAccessCookie() {
  (await cookies()).set("dad-access", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}
