import { type Metadata, type Viewport } from "next";

import HomeStructuredData from "./HomeStructuredData";
import RoomHomePage from "./RoomHomePage";
import { homepageMetadata, roomViewport } from "./homeMetadata";

export const revalidate = 86400;
export const metadata: Metadata = homepageMetadata;
export const viewport: Viewport = roomViewport;

export default function HomePage() {
  return (
    <>
      <HomeStructuredData />
      <RoomHomePage initialUnit={0} />
    </>
  );
}
