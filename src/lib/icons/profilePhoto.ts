import "server-only";

import { loadPublicImage } from "./publicImage";

/**
 * The About photo as a data URI. The same file the About card and the
 * framed portrait in the scene show, so every icon follows a photo swap
 * for free.
 */
export function loadProfilePhoto(): Promise<string> {
  return loadPublicImage("/images/about/profile.jpg");
}
