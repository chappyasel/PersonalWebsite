import { renderPersonalityOg } from "~/lib/personalities/og";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Personalities: Big Five results and comparisons";

export default function Image() {
  return renderPersonalityOg();
}
