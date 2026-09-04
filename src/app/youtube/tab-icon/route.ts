import { sectionIconSvgResponse } from "~/lib/icons/sectionIconRoute";

export const dynamic = "force-static";

/** The favicon Chrome and Firefox use: a light or dark tile by colour scheme. */
export function GET() {
  return sectionIconSvgResponse("youtube");
}
