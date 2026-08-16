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
          backgroundColor: "#081310",
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
            left: 0,
            right: 0,
            bottom: 0,
            height: 170,
            background:
              "linear-gradient(to bottom, rgba(10, 24, 20, 0), rgba(10, 24, 20, 0.82) 70%)",
          }}
        />

        {/* Reserve the lower meadow as the signature zone. The dark fade
            keeps the centered name stable as flowers and loose props evolve. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 26,
            justifyContent: "center",
            fontSize: 65.28,
            fontWeight: 700,
            lineHeight: 1,
            color: "#ffffff",
            opacity: 0.95,
            letterSpacing: "-0.035em",
            textShadow: "0 2px 14px rgba(0, 0, 0, 0.38)",
          }}
        >
          Chappy Asel
        </div>
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
