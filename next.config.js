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
