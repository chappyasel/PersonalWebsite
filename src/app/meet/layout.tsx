import type { Viewport } from "next";

import { TRPCReactProvider } from "~/trpc/react";

import "./meet.css";

// Each page names its own title, description, and share card (metadata.ts).
// Browser chrome follows the page's grey or black, not the site's sand.
// The page draws to the screen's edges, under Safari's toolbar and the home
// indicator, so no strip of the browser's own grey shows below it; the
// floating booking bar and the page's top keep clear by the safe areas.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0f" },
  ],
};

export default function MeetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
