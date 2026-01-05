import { type NextRequest, NextResponse } from "next/server";

import { env } from "./env";

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get("host") ?? req.nextUrl.hostname;
  if (hostname.endsWith(env.BOOKS_ROOT_DOMAIN)) {
    const url = req.nextUrl.clone();
    url.pathname = `/books${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|robots.txt).*)",
  ],
};
