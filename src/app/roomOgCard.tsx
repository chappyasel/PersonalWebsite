import { readFile } from "fs/promises";
import { ImageResponse } from "next/og";
import { join } from "path";

import {
  HOME_OG_BOTTOM_FADE,
  HOME_OG_SIGNATURE_TEXT,
} from "./homeOgPresentation";
import { loadGeorgiaProBold } from "~/app/books/[bookId]/fonts";

const PROD_URL = "https://www.chappyasel.com";

export const ROOM_OG_SIZE = { width: 1200, height: 630 };

/** The scene stills behind the room cards, by route. Each is screenshot
 * mode's capture of one shelf (scripts/generate/room-og-config.mjs), checked
 * by `pnpm check:home-og` and refreshed by `pnpm generate:room-og:local`. */
export const ROOM_OG_SCENES = {
  home: "images/stacks/home-og-scene.jpg",
  projects: "images/stacks/og/projects.jpg",
  musings: "images/stacks/og/musings.jpg",
  talks: "images/stacks/og/talks.jpg",
  golf: "images/stacks/og/golf.jpg",
} as const;

export type RoomOgScene = keyof typeof ROOM_OG_SCENES;

async function loadSceneImage(scene: RoomOgScene): Promise<string> {
  const file = ROOM_OG_SCENES[scene];
  try {
    const buffer = await readFile(join(process.cwd(), "public", file));
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch {
    return `${PROD_URL}/${file}`;
  }
}

/** A room's share card: the captured still with the etched signature over a
 * fade, the same on every card so the set reads as one. The page title names
 * the shelf, and the picture shows it. */
export async function roomOgCard(scene: RoomOgScene) {
  const [fontBold, sceneSrc] = await Promise.all([
    loadGeorgiaProBold(),
    loadSceneImage(scene),
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
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
      ...ROOM_OG_SIZE,
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
