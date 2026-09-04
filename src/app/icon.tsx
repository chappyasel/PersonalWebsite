import { profileIconImage } from "~/lib/icons/profileIcon";

export const runtime = "nodejs";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** The main site's tab icon: the whole About photo, rounded like every other tab icon. */
export default function Icon() {
  return profileIconImage(size.width, "rounded");
}
