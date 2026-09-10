import { ImageResponse } from "next/og";

import { NIGHT, nightSky } from "~/lib/og/daylight";
import { SITE_PAGES } from "~/lib/site/pages";
import { getSectionPreview } from "~/lib/site/sectionPreviews.server";
import { isSectionSharePage } from "~/lib/site/sectionShare";

import { loadGeorgiaProBold } from "~/app/books/[bookId]/fonts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = params.get("page") ?? "";
  const ids = params.getAll("section");
  const section = isSectionSharePage(page)
    ? getSectionPreview(page, ids.length === 1 ? ids[0] : undefined)
    : null;
  if (!section || !isSectionSharePage(page)) {
    return new Response("Section not found", { status: 404 });
  }

  const font = await loadGeorgiaProBold();
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          fontFamily: "Georgia Pro",
        }}
      >
        {nightSky(1200, 630)}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: 460,
            padding: "40px 70px",
            gap: 28,
          }}
        >
          <div
            style={{
              fontSize: 23,
              color: NIGHT.inkMuted,
              letterSpacing: "0.34em",
              textTransform: "uppercase",
            }}
          >
            Chappy Asel
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              textAlign: "center",
              fontSize:
                section.title.length > 80
                  ? 42
                  : section.title.length > 40
                    ? 56
                    : 76,
              lineHeight: 1.15,
              color: NIGHT.ink,
              maxWidth: "100%",
            }}
          >
            {section.title}
          </div>
          <div
            style={{
              width: 68,
              height: 3,
              backgroundColor: NIGHT.ember,
              borderRadius: 2,
            }}
          />
          <div style={{ fontSize: 29, color: NIGHT.inkMuted }}>
            {SITE_PAGES[page].label}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Georgia Pro", data: font, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
