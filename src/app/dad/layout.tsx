import type { Metadata } from "next";
import { cookies } from "next/headers";

import {
  DAD_ACCESS_COOKIE_NAME,
  isValidDadAccessToken,
} from "~/lib/dad/access";
import { siteIconMetadata } from "~/lib/icons/siteIconMetadata";
import { TRPCReactProvider } from "~/trpc/react";

import { PageTransition } from "./components/PageTransition";
import { PasswordGate } from "./components/PasswordGate";
import { GrainientBackground } from "~/components/ui/grainient-background";

import { env } from "~/env";

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
  // Server-side access gate for the entire /dad/* subtree. Reading cookies()
  // here also opts all dad routes out of static prerendering, so no journal
  // content is ever baked into public static HTML.
  const hasAccess = isValidDadAccessToken(
    (await cookies()).get(DAD_ACCESS_COOKIE_NAME)?.value,
    env.DAD_CONTENT_PASSWORD,
  );

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
