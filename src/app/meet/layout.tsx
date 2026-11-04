import type { Viewport } from "next";

import { TRPCReactProvider } from "~/trpc/react";

import "./meet.css";

// Each page names its own title, description, and share card (metadata.ts).
// Browser chrome follows the page's white or near-black, not the site's sand.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1c1e" },
  ],
};

export default function MeetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TRPCReactProvider>{children}</TRPCReactProvider>;
}
