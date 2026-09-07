import type { Metadata } from "next";

import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "YouTube Watch History",
  robots: "noindex, nofollow",
  icons: siteIconMetadata("/youtube"),
};

export default function YouTubeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TRPCReactProvider>
      <main className="px-6 py-12">{children}</main>
    </TRPCReactProvider>
  );
}
