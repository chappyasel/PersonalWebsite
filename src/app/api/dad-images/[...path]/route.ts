import fs from "fs";
import { type NextRequest, NextResponse } from "next/server";
import path from "path";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params;
  const filename = segments.join("/");

  // Only allow image extensions
  if (!/\.(jpe?g|png)$/i.test(filename)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Prevent path traversal
  const safeName = path.normalize(filename);
  if (safeName.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Build path dynamically to prevent Turbopack from statically analyzing the symlink
  const contentDir = ["content", "dad", "Journal", "images"].join(path.sep);
  const imagePath = path.join(process.cwd(), contentDir, safeName);

  if (!fs.existsSync(imagePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(imagePath);
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
