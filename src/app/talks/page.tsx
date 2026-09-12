import { roomStopMetadata, roomViewport } from "../homeMetadata";
import HomePage from "../page";
import { type Metadata, type Viewport } from "next";

// The room, opened on the Featured Talks shelf.
// The scene reads the pathname (src/lib/site/roomRoutes.ts) and opens there.

export const revalidate = 86400;

export const metadata: Metadata = roomStopMetadata({
  path: "/talks",
  title: "Featured Talks",
  description: "Featured talks and podcast appearances by Chappy Asel.",
});

export const viewport: Viewport = roomViewport;

export default function TalksPage() {
  return <HomePage />;
}
