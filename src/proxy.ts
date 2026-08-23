import { type NextRequest, NextResponse } from "next/server";

import {
  DAD_ACCESS_COOKIE_NAME,
  isValidDadAccessToken,
} from "~/lib/dad/access";

import { env } from "~/env";

export async function proxy(req: NextRequest) {
  // Protect Dad sub-routes with the same signed token used by the layout and API.
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/dad/") && !pathname.startsWith("/dad/api")) {
    const token = req.cookies.get(DAD_ACCESS_COOKIE_NAME)?.value;
    if (!isValidDadAccessToken(token, env.DAD_CONTENT_PASSWORD)) {
      return NextResponse.redirect(new URL("/dad", req.url));
    }
  }
  if (
    pathname.startsWith("/youtube/") &&
    !pathname.startsWith("/youtube/api")
  ) {
    const token = req.cookies.get("youtube-access")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/youtube", req.url));
    }
  }

  const hostname = req.headers.get("host") ?? req.nextUrl.hostname;

  // books.chappyasel.com → /books/*
  const isBooksSubdomain =
    hostname.startsWith("books.localhost") ||
    hostname.endsWith("books.chappyasel.com");

  if (isBooksSubdomain) {
    const url = req.nextUrl.clone();

    if (url.pathname.startsWith("/books")) {
      const newPath = url.pathname.replace(/^\/books/, "") || "/";
      url.pathname = newPath;
      return NextResponse.redirect(url);
    }

    url.pathname = `/books${url.pathname === "/" ? "" : url.pathname}`;

    const response = NextResponse.rewrite(url);
    response.headers.set("x-books-subdomain", "true");
    return response;
  }

  // manual.chappyasel.com → /manual/*
  const isManualSubdomain =
    hostname.startsWith("manual.localhost") ||
    hostname.endsWith("manual.chappyasel.com");

  if (isManualSubdomain) {
    const url = req.nextUrl.clone();

    if (url.pathname.startsWith("/manual")) {
      const newPath = url.pathname.replace(/^\/manual/, "") || "/";
      url.pathname = newPath;
      return NextResponse.redirect(url);
    }

    url.pathname = `/manual${url.pathname === "/" ? "" : url.pathname}`;

    const response = NextResponse.rewrite(url);
    response.headers.set("x-manual-subdomain", "true");
    return response;
  }

  // routine.chappyasel.com → /routine/*
  const isRoutineSubdomain =
    hostname.startsWith("routine.localhost") ||
    hostname.endsWith("routine.chappyasel.com");

  if (isRoutineSubdomain) {
    const url = req.nextUrl.clone();

    if (url.pathname.startsWith("/routine")) {
      const newPath = url.pathname.replace(/^\/routine/, "") || "/";
      url.pathname = newPath;
      return NextResponse.redirect(url);
    }

    url.pathname = `/routine${url.pathname === "/" ? "" : url.pathname}`;

    const response = NextResponse.rewrite(url);
    response.headers.set("x-routine-subdomain", "true");
    return response;
  }

  // weightlifting.chappyasel.com → /weightlifting/*
  const isWeightliftingSubdomain =
    hostname.startsWith("weightlifting.localhost") ||
    hostname.endsWith("weightlifting.chappyasel.com");

  if (isWeightliftingSubdomain) {
    const url = req.nextUrl.clone();

    if (url.pathname.startsWith("/weightlifting")) {
      const newPath = url.pathname.replace(/^\/weightlifting/, "") || "/";
      url.pathname = newPath;
      return NextResponse.redirect(url);
    }

    url.pathname = `/weightlifting${url.pathname === "/" ? "" : url.pathname}`;

    const response = NextResponse.rewrite(url);
    response.headers.set("x-weightlifting-subdomain", "true");
    return response;
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
