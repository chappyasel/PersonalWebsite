import { type NextRequest, NextResponse } from "next/server";

import {
  DAD_ACCESS_COOKIE_NAME,
  isValidDadAccessToken,
} from "~/lib/dad/access";
import { isValidYoutubeAccessToken } from "~/lib/youtube/access";

import { env } from "~/env";

/**
 * A section's own icon routes (/dad/icon/tab, /youtube/tab-icon). They are
 * public: the browser asks for them from the password gate itself.
 */
const SECTION_ICON_PATH = /^\/[a-z]+\/(?:icon\/[a-z]+|tab-icon)$/;

export async function proxy(req: NextRequest) {
  // Protect Dad and YouTube sub-routes with the same signed tokens their pages
  // and tRPC procedures check. The section roots (/dad, /youtube) are the
  // password gates, so those pages check the token themselves.
  const { pathname } = req.nextUrl;
  const isSectionIcon = SECTION_ICON_PATH.test(pathname);
  if (pathname.startsWith("/dad/") && !isSectionIcon) {
    const token = req.cookies.get(DAD_ACCESS_COOKIE_NAME)?.value;
    if (!isValidDadAccessToken(token, env.DAD_CONTENT_PASSWORD)) {
      return NextResponse.redirect(new URL("/dad", req.url));
    }
  }
  if (pathname.startsWith("/youtube/") && !isSectionIcon) {
    const token = req.cookies.get("youtube-access")?.value;
    if (!isValidYoutubeAccessToken(token, env.DAD_CONTENT_PASSWORD)) {
      return NextResponse.redirect(new URL("/youtube", req.url));
    }
  }

  const hostname = req.headers.get("host") ?? req.nextUrl.hostname;

  // Metadata files normally bypass section rewrites. Each standalone host
  // must serve its own sitemap at the endpoint advertised in robots.txt.
  if (pathname === "/sitemap.xml") {
    const site = ["books", "weightlifting"].find(
      (site) =>
        hostname === `${site}.chappyasel.com` ||
        hostname === `${site}.localhost` ||
        hostname.startsWith(`${site}.localhost:`),
    );
    if (!site) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = `/${site}/sitemap.xml`;
    return NextResponse.rewrite(url);
  }

  // Keep old entry links working while giving full-page visits the public
  // subdomain address. RSC and deep path aliases still support inline sheets.
  if (
    process.env.NODE_ENV === "production" &&
    ["www.chappyasel.com", "chappyasel.com"].includes(hostname) &&
    req.headers.get("rsc") !== "1" &&
    (req.method === "HEAD" ||
      (req.method === "GET" &&
        req.headers.get("accept")?.includes("text/html")))
  ) {
    const site = ["books", "weightlifting"].find(
      (site) => pathname === `/${site}` || pathname === `/${site}/`,
    );
    if (site) {
      const url = req.nextUrl.clone();
      url.protocol = "https:";
      url.hostname = `${site}.chappyasel.com`;
      url.port = "";
      url.pathname = "/";
      return NextResponse.redirect(url, 308);
    }
  }

  // Local site entry points share one document once opened. This lets the
  // room/page transition controller survive navigation in either direction.
  // Manual and Routine use main-host paths in production. Books and
  // Weightlifting retain their standalone hosts.
  const localSite = ["books", "weightlifting", "manual", "routine"].find(
    (site) =>
      hostname === `${site}.localhost` ||
      hostname.startsWith(`${site}.localhost:`),
  );
  const productionSite = ["manual", "routine"].find(
    (site) =>
      hostname === `${site}.chappyasel.com` &&
      (pathname === "/" || pathname === `/${site}` || pathname === `/${site}/`),
  );
  const sharedSite =
    process.env.NODE_ENV === "development" ? localSite : productionSite;
  if (
    sharedSite &&
    req.method === "GET" &&
    req.headers.get("accept")?.includes("text/html") &&
    req.headers.get("rsc") !== "1" &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/_next/") &&
    !pathname.split("/").at(-1)?.includes(".")
  ) {
    const url = req.nextUrl.clone();
    // Use an explicit loopback origin. The dev server's outer routing layer
    // also makes redirects to its own internal localhost origin relative,
    // even when proxy URL normalization is disabled.
    url.hostname = productionSite ? "www.chappyasel.com" : "127.0.0.1";
    if (productionSite) {
      url.protocol = "https:";
      url.port = "";
    }
    const prefix = `/${sharedSite}`;
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
      url.pathname = `${prefix}${pathname === "/" ? "" : pathname}`;
    }
    return NextResponse.redirect(url);
  }

  // books.chappyasel.com → /books/*
  const isBooksSubdomain =
    hostname === "books.localhost" ||
    hostname.startsWith("books.localhost:") ||
    hostname === "books.chappyasel.com";

  if (isBooksSubdomain) {
    const url = req.nextUrl.clone();

    if (url.pathname === "/books" || url.pathname.startsWith("/books/")) {
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
    hostname === "weightlifting.localhost" ||
    hostname.startsWith("weightlifting.localhost:") ||
    hostname === "weightlifting.chappyasel.com";

  if (isWeightliftingSubdomain) {
    const url = req.nextUrl.clone();

    if (
      url.pathname === "/weightlifting" ||
      url.pathname.startsWith("/weightlifting/")
    ) {
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
    "/sitemap.xml",
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
