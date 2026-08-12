import { readFile } from "fs/promises";
import { ImageResponse } from "next/og";
import { join } from "path";

import { loadGeorgiaProBold } from "~/app/books/[bookId]/fonts";

export const runtime = "nodejs";

export const alt = "Chappy Asel";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const PROD_URL = "https://www.chappyasel.com";

async function loadSceneImage(): Promise<string> {
  try {
    const imagePath = join(
      process.cwd(),
      "public",
      "images",
      "stacks",
      "home-og-scene.jpg",
    );
    const buffer = await readFile(imagePath);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return `${PROD_URL}/images/stacks/home-og-scene.jpg`;
  }
}

export default async function Image() {
  const [fontBold, sceneSrc] = await Promise.all([
    loadGeorgiaProBold(),
    loadSceneImage(),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          backgroundColor: "#e9e6de",
          fontFamily: '"Georgia Pro"',
        }}
      >
        <img
          src={sceneSrc}
          alt=""
          width={1200}
          height={630}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: "auto 0 0",
            height: 145,
            background:
              "linear-gradient(to bottom, rgba(246, 243, 236, 0), rgba(246, 243, 236, 0.96) 72%)",
          }}
        />

        {/* The scene owns the image; the name sits in the clear floor beneath
            the shelves instead of covering any of their contents. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 22,
            justifyContent: "center",
            fontSize: 70,
            fontWeight: 700,
            lineHeight: 1,
            color: "#342f29",
            letterSpacing: "-0.035em",
          }}
        >
          Chappy Asel
        </div>

        <div
          style={{
            display: "flex",
            position: "absolute",
            inset: 14,
            border: "1px solid rgba(52, 47, 41, 0.16)",
            borderRadius: 22,
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Georgia Pro",
          data: fontBold,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
