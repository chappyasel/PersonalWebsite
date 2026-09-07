import { ImageResponse } from "next/og";

import { loadProfilePhoto } from "./profilePhoto";
import { TILE_RADIUS } from "./siteIconSizes";

export type ProfileIconShape = "rounded" | "square";

/**
 * The whole About photo, never a crop. `rounded` is the tab icon, with the
 * corner every other tab icon shares; `square` is the full-bleed tile a
 * home screen masks itself. The photo is square, so nothing is cut beyond
 * the corners.
 */
export async function profileIconImage(
  frame: number,
  shape: ProfileIconShape,
): Promise<ImageResponse> {
  const src = await loadProfilePhoto();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          borderRadius:
            shape === "rounded" ? Math.round(frame * TILE_RADIUS) : 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={frame}
          height={frame}
          style={{ width: frame, height: frame, objectFit: "cover" }}
        />
      </div>
    ),
    { width: frame, height: frame },
  );
}
