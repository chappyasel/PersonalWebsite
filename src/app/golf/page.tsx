import RoomHomePage from "../RoomHomePage";
import { roomStopMetadata, roomViewport } from "../homeMetadata";
import { type Metadata, type Viewport } from "next";

// The room, opened on the hidden golf green between Books and Weightlifting.
// The scene reads the pathname (src/lib/site/roomRoutes.ts) and opens there.

export const revalidate = 86400;

export const metadata: Metadata = roomStopMetadata({
  path: "/golf",
  title: "Golf",
  description: "A hidden four-ball golf green in Chappy Asel's 3D world.",
  index: false,
});

export const viewport: Viewport = roomViewport;

export default function GolfPage() {
  return <RoomHomePage initialUnit={1.52} />;
}
