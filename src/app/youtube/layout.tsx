import type { Metadata } from "next";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "YouTube Watch History",
  robots: "noindex, nofollow",
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
