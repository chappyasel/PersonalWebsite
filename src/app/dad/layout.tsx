import type { Metadata } from "next";
import { cookies } from "next/headers";

import { GrainientBackground } from "~/components/ui/grainient-background";
import { PasswordGate } from "./components/PasswordGate";
import { PageTransition } from "./components/PageTransition";

export const metadata: Metadata = {
  title: "Dad's Journal",
  robots: "noindex, nofollow",
};

export default async function DadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side access gate for the entire /dad/* subtree. Reading cookies()
  // here also opts all dad routes out of static prerendering, so no journal
  // content is ever baked into public static HTML.
  const hasAccess = (await cookies()).get("dad-access")?.value;

  return (
    <GrainientBackground className="min-h-screen">
      <main className="mx-auto max-w-[680px] px-6 pb-28 font-serif sm:px-8">
        {hasAccess ? (
          <PageTransition>{children}</PageTransition>
        ) : (
          <PasswordGate />
        )}
      </main>
    </GrainientBackground>
  );
}
