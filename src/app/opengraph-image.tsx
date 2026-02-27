import { readFile } from "fs/promises";
import { join } from "path";
import { ImageResponse } from "next/og";

import { loadGeorgiaProBold } from "~/app/books/[bookId]/fonts";

export const runtime = "nodejs";

export const alt = "Chappy Asel";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const PROD_URL = "https://chappyasel.com";

async function loadProfileImage(): Promise<string> {
  try {
    const imagePath = join(process.cwd(), "public", "images", "about", "profile.jpg");
    const buffer = await readFile(imagePath);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return `${PROD_URL}/images/about/profile.jpg`;
  }
}

export default async function Image() {
  const [fontBold, profileSrc] = await Promise.all([
    loadGeorgiaProBold(),
    loadProfileImage(),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#f5f5f5",
          alignItems: "center",
          justifyContent: "center",
          gap: "48px",
          fontFamily: '"Georgia Pro"',
        }}
      >
        {/* Profile Image */}
        <img
          src={profileSrc}
          width={240}
          height={240}
          style={{
            borderRadius: "50%",
            objectFit: "cover",
          }}
        />
        {/* Name */}
        <div
          style={{
            display: "flex",
            fontSize: "72px",
            fontWeight: 700,
            color: "#737373",
            letterSpacing: "-0.02em",
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
