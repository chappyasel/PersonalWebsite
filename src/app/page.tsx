import { type Metadata, type Viewport } from "next";

import RoomHomePage from "./RoomHomePage";
import { homepageMetadata, roomViewport } from "./homeMetadata";

export const revalidate = 86400;
export const metadata: Metadata = homepageMetadata;
export const viewport: Viewport = roomViewport;

export default function HomePage() {
  return <RoomHomePage initialUnit={0} />;
}
