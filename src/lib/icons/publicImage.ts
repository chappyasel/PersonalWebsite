import { readFile } from "fs/promises";
import { join } from "path";
import "server-only";

import { ROOT_PRODUCTION_ORIGIN } from "~/lib/site/origin";

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const cache = new Map<string, Promise<string>>();

/**
 * A file under public/ as a data URI, read once per process. `publicPath`
 * is the URL path (`/images/about/profile.jpg`). Falls back to the
 * production URL when the file is not in the deployed bundle, which satori
 * can fetch just as well.
 */
export function loadPublicImage(publicPath: string): Promise<string> {
  let pending = cache.get(publicPath);
  if (!pending) {
    pending = (async () => {
      try {
        const buffer = await readFile(
          join(process.cwd(), "public", ...publicPath.split("/").filter(Boolean)),
        );
        const ext = publicPath.slice(publicPath.lastIndexOf(".")).toLowerCase();
        return `data:${MIME[ext] ?? "application/octet-stream"};base64,${buffer.toString("base64")}`;
      } catch {
        return `${ROOT_PRODUCTION_ORIGIN}${publicPath}`;
      }
    })();
    cache.set(publicPath, pending);
  }
  return pending;
}
