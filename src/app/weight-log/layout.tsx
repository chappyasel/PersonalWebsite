import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Weight Log",
  description: "Password-protected weight history.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
  referrer: "no-referrer",
};

export default function WeightLogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="ph-no-capture ph-mask mx-auto max-w-7xl px-4 py-10 font-sans sm:px-8 sm:py-14">
      {children}
    </main>
  );
}
