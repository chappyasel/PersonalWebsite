/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

const diagnosticBuildId = (
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  "local"
).slice(0, 12);

/** @type {import("next").NextConfig} */
const config = {
  // Local subdomains redirect into the shared main app. Next's proxy adapter
  // otherwise compares against its internal localhost URL and makes that
  // cross-host Location relative, redirecting books.localhost back to itself.
  skipProxyUrlNormalize: process.env.NODE_ENV === "development",
  env: {
    NEXT_PUBLIC_STACKS_BUILD_ID: diagnosticBuildId,
  },
  // React Three Fiber releases an unmounted Canvas on a 500 ms delay. React
  // Strict Mode's development remount reuses that canvas/root before the old
  // cleanup runs, so the cleanup force-loses the live replacement context.
  // Production is unaffected by Strict effects; opting out keeps the local
  // WebGL lifecycle equivalent to production.
  reactStrictMode: false,
  outputFileTracingIncludes: {
    "/api/search": ["./content/dad-search-index.json"],
  },
  outputFileTracingExcludes: {
    "/*": ["./data/weight-log/**/*", "./**/*.xlsx"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  async rewrites() {
    return [
      // Nothing links /favicon.ico any more, but crawlers and old bookmarks
      // still ask for it. Serve the generated tab icon; the subdomain proxy
      // exempts the path, so every host gets the same face.
      { source: "/favicon.ico", destination: "/icon" },
    ];
  },
  async headers() {
    return [
      {
        source: "/weight-log/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        source: "/fonts/v1/:font*.woff2",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default config;
