import {
  CASES,
  type CaptureCase,
  UNITS,
  type Unit,
  getSummary,
  readAsset,
} from "../data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  const query = new URL(request.url).searchParams;
  if (query.get("summary") === "1")
    return Response.json(await getSummary(), {
      headers: { "Cache-Control": "no-store" },
    });
  const unit = query.get("unit") as Unit;
  const capture = query.get("case") as CaptureCase;
  const file = query.get("file") ?? "";
  if (
    !UNITS.includes(unit) ||
    !CASES.includes(capture) ||
    !(file === "artwork.svg" || /^[a-zA-Z0-9_.-]+\.(webp|png)$/.test(file))
  )
    return new Response(null, { status: 404 });
  try {
    const content = await readAsset(unit, capture, file);
    return new Response(
      typeof content === "string" ? content : new Uint8Array(content),
      {
        headers: {
          "Content-Type": file.endsWith("svg")
            ? "image/svg+xml"
            : file.endsWith("webp")
              ? "image/webp"
              : "image/png",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return new Response(null, { status: 404 });
  }
}
