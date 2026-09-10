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
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-800">
      <main className="ph-no-capture ph-mask mx-auto max-w-7xl p-6 font-sans md:p-8">
        {children}
      </main>
    </div>
  );
}
