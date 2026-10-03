import type { Metadata } from "next";

import { hasDadAccess } from "./lib/access";
import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";
import { TRPCReactProvider } from "~/trpc/react";

import { PageTransition } from "./components/PageTransition";
import { PasswordGate } from "./components/PasswordGate";
import { GrainientBackground } from "~/components/ui/grainient-background";

export const metadata: Metadata = {
  title: "Dad's Journal",
  robots: "noindex, nofollow",
  icons: siteIconMetadata("/dad"),
};

export default async function DadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Chooses between the password gate and the section. Reading cookies() here
  // also opts all dad routes out of static prerendering, so no journal content
  // is ever baked into public static HTML. It does not stop a page's payload
  // from being sent. Pages read content through dadContent(), which checks the
  // cookie itself (ADR 0003).
  const hasAccess = await hasDadAccess();

  return (
    <TRPCReactProvider>
      <GrainientBackground className="min-h-screen">
        <main className="mx-auto max-w-[680px] px-6 pb-28 font-serif sm:px-8">
          {hasAccess ? (
            <PageTransition>{children}</PageTransition>
          ) : (
            <PasswordGate />
          )}
        </main>
      </GrainientBackground>
    </TRPCReactProvider>
  );
}
