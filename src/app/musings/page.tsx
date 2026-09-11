import { roomStopMetadata, roomViewport } from "../homeMetadata";
import HomePage from "../page";
import { type Metadata, type Viewport } from "next";

// The room, opened on the Musings shelf.
// The scene reads the pathname (src/lib/site/roomRoutes.ts) and opens there.

export const revalidate = 86400;

export const metadata: Metadata = roomStopMetadata({
  path: "/musings",
  title: "Musings",
  description: "Essays and blog posts by Chappy Asel.",
});

export const viewport: Viewport = roomViewport;

export default function MusingsPage() {
  return <HomePage />;
}
