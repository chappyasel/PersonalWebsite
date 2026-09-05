import { sectionIconSvgResponse } from "~/lib/icons/sectionIconRoute";

export const dynamic = "force-static";

/** The favicon Chrome and Firefox use: paper by day, dark grain by night. */
export function GET() {
  return sectionIconSvgResponse("dad");
}
