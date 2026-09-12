import { roomStopMetadata, roomViewport } from "../homeMetadata";
import HomePage from "../page";
import { type Metadata, type Viewport } from "next";

// The room, opened on the Projects shelf.
// The scene reads the pathname (src/lib/site/roomRoutes.ts) and opens there.

export const revalidate = 86400;

export const metadata: Metadata = roomStopMetadata({
  path: "/projects",
  title: "Projects",
  description:
    "Apps and open source by Chappy Asel, with a year of GitHub activity.",
});

export const viewport: Viewport = roomViewport;

export default function ProjectsPage() {
  return <HomePage />;
}
