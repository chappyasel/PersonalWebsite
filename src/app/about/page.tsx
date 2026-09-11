import {
  HOMEPAGE_DESCRIPTION,
  roomStopMetadata,
  roomViewport,
} from "../homeMetadata";
import HomePage from "../page";
import { type Metadata, type Viewport } from "next";

// The room, opened on the About shelf. That stop's URL is the homepage itself; this path exists so a link to it unfurls as About.
// The scene reads the pathname (src/lib/site/roomRoutes.ts) and opens there.

export const revalidate = 86400;

export const metadata: Metadata = roomStopMetadata({
  path: "/about",
  title: "About",
  description: HOMEPAGE_DESCRIPTION,
  canonical: "/",
});

export const viewport: Viewport = roomViewport;

export default function AboutPage() {
  return <HomePage />;
}
