import { type NextRequest, NextResponse } from "next/server";

import { env } from "./env";

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get("host") ?? req.nextUrl.hostname;
  if (hostname.endsWith(env.BOOKS_ROOT_DOMAIN)) {
    return NextResponse.redirect("https://chappyasel.notion.site/", 302);
  }
  return NextResponse.next();
}
