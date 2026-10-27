import { brandImageResponse } from "~/lib/icons/brandImage";

export const runtime = "nodejs";

export const alt = "Chappy Asel";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

/** Companion's share card: the handle in SF Mono beside the orange block
 * cursor, on the dark ground's dot grid. */
export default function Image() {
  return brandImageResponse("home-og.png");
}
