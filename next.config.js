/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.js");

/** @type {import("next").NextConfig} */
const config = {
  // React Three Fiber releases an unmounted Canvas on a 500 ms delay. React
  // Strict Mode's development remount reuses that canvas/root before the old
  // cleanup runs, so the cleanup force-loses the live replacement context.
  // Production is unaffected by Strict effects; opting out keeps the local
  // WebGL lifecycle equivalent to production.
  reactStrictMode: false,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
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
