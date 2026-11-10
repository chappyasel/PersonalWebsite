import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    PERSONALITIES_DATABASE_URL: z.string().url().optional(),
    PERSONALITIES_ORIGIN: z.string().url().optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXTAUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NEXTAUTH_URL: z.preprocess(
      // This makes Vercel deployments not fail if you don't set NEXTAUTH_URL
      // Since NextAuth.js automatically uses the VERCEL_URL if present.
      (str) => process.env.VERCEL_URL ?? str,
      // VERCEL_URL doesn't include `https` so it cant be validated as a URL
      process.env.VERCEL ? z.string() : z.string().url(),
    ),
    NOTION_API_KEY: z.string(),
    NOTION_BOOKS_DATABASE_ID: z.string(),
    GOOGLE_BOOKS_API_KEY: z.string().optional(),
    CRON_SECRET: z.string(),
    AWS_REGION: z.string().default("us-east-1"),
    AWS_BUCKET_NAME: z.string(),
    AWS_KEY_NAME: z.string(),
    YOUTUBE_API_KEY: z.string(),
    DAD_CONTENT_PASSWORD: z.string(),
    /** Optional. Without it the Projects placard shows the committed GitHub
     * snapshot instead of live activity. Needs no scopes for public data;
     * the owner's own token also counts private contributions. */
    GITHUB_TOKEN: z.string().optional(),
    /** Optional. The book-notes-images Blob store. Without it the sync
     * stores note images inline as base64, as it did before the store. */
    BLOB_READ_WRITE_TOKEN: z.string().optional(),
    /** Optional. The Daybreak deployment /meet books through: its
     * `.convex.site` origin, or `fixture` in development for canned open
     * time. Without it /meet says booking isn't open. */
    DAYBREAK_BOOKING_URL: z
      .union([z.literal("fixture"), z.string().url()])
      .optional(),
    /** Optional. The deployment's BOOKING_PROXY_SECRET, so Daybreak limits
     * bookings per visitor instead of counting them all as one caller. */
    BOOKING_PROXY_SECRET: z.string().optional(),
    /** Optional in development. Production refuses to book without it. */
    TURNSTILE_SECRET_KEY: z.string().optional(),
    /** Google sign-in for the owner's pages. All three are set in Vercel
     * Production only. Without all three, the Google provider is left out
     * and `/weight-log/edit` says sign-in is unavailable. */
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),
    /** The one Google address that may sign in (`signIn` callback) and use
     * `ownerProcedure`. Compared trimmed and case-blind. Never commit it.
     * A plain string, so a malformed value refuses sign-in instead of
     * failing the production build. */
    OWNER_EMAIL: z.string().optional(),
    /** The bearer token the owner's Apple Health Shortcuts send to
     * `/api/weight-log/mirror`, and nothing else. Set in Vercel Production
     * and pasted into the Shortcuts. Without it the route refuses every
     * request. At least 32 characters, so a short or mistyped value fails
     * the build instead of guarding the route weakly. */
    WEIGHT_LOG_MIRROR_TOKEN: z.string().min(32).optional(),
    /** The bearer token the owner's Log Weight Shortcut sends to
     * `/api/weight-log/weigh-in` and `/api/weight-log/week-card`, and
     * nothing else. It writes only today's weigh-in (a day either side, by
     * UTC) and never deletes. Set in Vercel Production and pasted into the
     * Shortcut. Without it both routes refuse every request. At least 32
     * characters, as the mirror's. */
    WEIGHT_LOG_ENTRY_TOKEN: z.string().min(32).optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_POSTHOG_KEY: z.string(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string(),
    /** Optional in development. The Turnstile widget /meet shows before booking. */
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    PERSONALITIES_DATABASE_URL: process.env.PERSONALITIES_DATABASE_URL,
    PERSONALITIES_ORIGIN: process.env.PERSONALITIES_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NOTION_API_KEY: process.env.NOTION_API_KEY,
    NOTION_BOOKS_DATABASE_ID: process.env.NOTION_BOOKS_DATABASE_ID,
    GOOGLE_BOOKS_API_KEY: process.env.GOOGLE_BOOKS_API_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    AWS_REGION: process.env.AWS_REGION,
    AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME,
    AWS_KEY_NAME: process.env.AWS_KEY_NAME,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    DAD_CONTENT_PASSWORD: process.env.DAD_CONTENT_PASSWORD,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    DAYBREAK_BOOKING_URL: process.env.DAYBREAK_BOOKING_URL,
    BOOKING_PROXY_SECRET: process.env.BOOKING_PROXY_SECRET,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    WEIGHT_LOG_MIRROR_TOKEN: process.env.WEIGHT_LOG_MIRROR_TOKEN,
    WEIGHT_LOG_ENTRY_TOKEN: process.env.WEIGHT_LOG_ENTRY_TOKEN,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
