import type { MetadataRoute } from "next";

import { getRootOrigin } from "~/lib/site/origin";
import { THEME_COLOR } from "~/lib/theme";

/**
 * Served at /manifest.webmanifest on every host: the dotted path is exempt
 * from the subdomain proxy, so the icon URLs are absolute to the main host.
 */
export default function manifest(): MetadataRoute.Manifest {
  const origin = getRootOrigin();
  return {
    name: "Chappy Asel",
    short_name: "Chappy Asel",
    start_url: "/",
    display: "standalone",
    background_color: THEME_COLOR.light,
    theme_color: THEME_COLOR.light,
    icons: [192, 512].map((px) => ({
      src: `${origin}/apple-icon/${px}`,
      sizes: `${px}x${px}`,
      type: "image/png",
      purpose: "any",
    })),
  };
}
