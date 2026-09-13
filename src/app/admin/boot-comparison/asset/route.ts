import {
  ASSET_KINDS,
  type AssetKind,
  CAPTURE_CASES,
  type CaptureCase,
  captureAsset,
  comparisonSummary,
} from "../data";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  const search = new URL(request.url).searchParams;
  if (search.get("summary") === "1") {
    return Response.json(await comparisonSummary(), {
      headers: { "Cache-Control": "no-store" },
    });
  }
  const capture = search.get("case") as CaptureCase;
  const kind = search.get("kind") as AssetKind;
  if (!CAPTURE_CASES.includes(capture) || !ASSET_KINDS.includes(kind))
    return new Response(null, { status: 404 });
  try {
    return new Response(new Uint8Array(await captureAsset(capture, kind)), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
