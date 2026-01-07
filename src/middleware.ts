import { type NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get("host") ?? req.nextUrl.hostname;
  const isSubdomain =
    hostname.startsWith("books.localhost") ||
    hostname.endsWith("books.chappyasel.com");

  if (isSubdomain) {
    const url = req.nextUrl.clone();

    // If accessing /books/* on subdomain, redirect to /* (remove /books prefix)
    if (url.pathname.startsWith("/books")) {
      // Preserve query params and hash
      const newPath = url.pathname.replace(/^\/books/, "") || "/";
      url.pathname = newPath;
      return NextResponse.redirect(url);
    }

    // Rewrite all other paths to /books/* for Next.js routing
    url.pathname = `/books${url.pathname === "/" ? "" : url.pathname}`;

    // Set header to indicate subdomain context for client-side detection
    const response = NextResponse.rewrite(url);
    response.headers.set("x-books-subdomain", "true");
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
