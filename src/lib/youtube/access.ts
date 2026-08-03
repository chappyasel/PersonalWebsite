import { createHmac, timingSafeEqual } from "node:crypto";

export function youtubeAccessToken(secret: string): string {
  return createHmac("sha256", secret)
    .update("personal-youtube-access-v1")
    .digest("hex");
}

export function isValidYoutubeAccessToken(
  value: string | undefined,
  secret: string,
): boolean {
  if (!value) return false;
  const expected = youtubeAccessToken(secret);
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
