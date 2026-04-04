import type { Metadata } from "next";

import { GrainientBackground } from "~/components/ui/grainient-background";
import { PageTransition } from "./components/PageTransition";

export const metadata: Metadata = {
  title: "Dad's Journal",
  robots: "noindex, nofollow",
};

export default function DadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GrainientBackground className="min-h-screen">
      <main className="mx-auto max-w-[680px] px-6 pb-28 font-serif sm:px-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </GrainientBackground>
  );
}
