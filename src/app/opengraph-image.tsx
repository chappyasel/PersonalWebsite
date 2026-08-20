import { readFile } from "fs/promises";
import { ImageResponse } from "next/og";
import { join } from "path";

import {
  HOME_OG_BOTTOM_FADE,
  HOME_OG_SIGNATURE_TEXT,
} from "./homeOgPresentation";
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

        <div style={HOME_OG_BOTTOM_FADE} />

        {/* The letterforms are the glass. Their translucent milk-white body,
            pale upper edge, and darker lower edge suggest etched glass while
            leaving the meadow completely unobstructed. */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 24,
            justifyContent: "center",
          }}
        >
          <div style={HOME_OG_SIGNATURE_TEXT}>Chappy Asel</div>
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
