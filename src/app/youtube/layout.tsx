import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "YouTube Watch History",
  robots: "noindex, nofollow",
};

export default function YouTubeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <main className="px-6 py-12">{children}</main>;
}
