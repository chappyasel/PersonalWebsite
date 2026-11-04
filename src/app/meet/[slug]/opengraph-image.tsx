import { OG_ALT, OG_SIZE } from "../ogCard";
import { meetOgImage } from "../ogImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  // A slug Daybreak doesn't know reads as closed: the card then names no
  // length, and never the slug.
  return meetOgImage((await params).slug);
}
