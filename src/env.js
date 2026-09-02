import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
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
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_POSTHOG_KEY: z.string(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
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
