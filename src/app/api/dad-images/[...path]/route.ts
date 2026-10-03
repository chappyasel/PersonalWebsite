import fs from "fs";
import { type NextRequest, NextResponse } from "next/server";
import path from "path";

import {
  DAD_ACCESS_COOKIE_NAME,
  DAD_ACCESS_MAX_AGE_SECONDS,
  isValidDadAccessToken,
} from "~/lib/dad/access";

import { env } from "~/env";

// Journal images are as private as the journal text. A reader's browser may
// keep one for as long as their access cookie lasts, but `private` keeps it
// out of every shared cache, Vercel's CDN included.
const IMAGE_CACHE_CONTROL = `private, max-age=${DAD_ACCESS_MAX_AGE_SECONDS}, immutable`;

function refuse(status: 401 | 404) {
  return new NextResponse(status === 401 ? "Unauthorized" : "Not found", {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  // The proxy matcher skips /api, so this route checks the same signed
  // token as the Dad layout before it looks at the filename.
  if (
    !isValidDadAccessToken(
      request.cookies.get(DAD_ACCESS_COOKIE_NAME)?.value,
      env.DAD_CONTENT_PASSWORD,
    )
  ) {
    return refuse(401);
  }

  const { path: segments } = await params;
  const filename = segments.join("/");

  // Only allow image extensions
  if (!/\.(jpe?g|png)$/i.test(filename)) {
    return refuse(404);
  }

  // Prevent path traversal
  const safeName = path.normalize(filename);
  if (safeName.includes("..")) {
    return refuse(404);
  }

  // Build path dynamically to prevent Turbopack from statically analyzing the symlink
  const contentDir = ["content", "dad", "Journal", "images"].join(path.sep);
  const imagePath = path.join(process.cwd(), contentDir, safeName);

  if (!fs.existsSync(imagePath)) {
    return refuse(404);
  }

  const buffer = fs.readFileSync(imagePath);
  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": IMAGE_CACHE_CONTROL,
    },
  });
}
