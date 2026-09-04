import { devBaseUrl } from "~/lib/util";

export const ROOT_PRODUCTION_ORIGIN = "https://www.chappyasel.com";

/**
 * Origin for absolute links to the main host: production's www, or the
 * plain localhost the dev server listens on. Subdomain sites use it for
 * assets that only the main host serves, such as the manifest icons.
 */
export function getRootOrigin(): string {
  return process.env.NODE_ENV === "production"
    ? ROOT_PRODUCTION_ORIGIN
    : devBaseUrl();
}
