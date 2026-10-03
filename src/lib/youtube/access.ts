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
  // Compare byte lengths, not string lengths: a non-ASCII value can match the
  // hex token's length in code units and still make timingSafeEqual throw.
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  if (valueBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(valueBuffer, expectedBuffer);
}
