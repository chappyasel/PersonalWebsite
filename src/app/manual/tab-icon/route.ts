import { sectionIconSvgResponse } from "~/lib/icons/sectionIconRoute";

export const dynamic = "force-static";

/** The favicon Chrome and Firefox use: day sky or night sky by colour scheme. */
export function GET() {
  return sectionIconSvgResponse("manual");
}
