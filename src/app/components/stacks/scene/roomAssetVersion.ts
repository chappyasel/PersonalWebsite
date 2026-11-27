import { DefaultLoadingManager } from "three";

/**
 * The room's models and images live in `public/` under fixed names, which
 * Vercel serves with `max-age=0, must-revalidate`, so every visit asked the
 * server again about each of them. three's loaders fetch them with
 * `?v=<hash of their contents>` instead (`roomAssetVersion` in
 * next.config.js), and that query earns a year-long immutable cache. The hash
 * moves only when one of the files does.
 *
 * Only loader fetches change. `<img>` and CSS uses keep their plain URLs, and
 * drei's caches still key on the URL the scene asked for.
 *
 * Importing this module installs the modifier. Any module that starts a load
 * while it is evaluated (a top-level `useGLTF.preload`) must import it too:
 * a module's body runs after its imports, whatever order the sorter gives them.
 */
const VERSIONED_PATH = /^\/(?:models|images\/stacks)\//;

export function versionRoomAssetUrl(
  url: string,
  version: string | undefined = process.env.NEXT_PUBLIC_ROOM_ASSET_VERSION,
): string {
  if (!version || !VERSIONED_PATH.test(url) || url.includes("?")) return url;
  return `${url}?v=${version}`;
}

DefaultLoadingManager.setURLModifier((url) => versionRoomAssetUrl(url));
