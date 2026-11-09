import { ArrowLeft, GoogleLogo, SignOut } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { auth } from "~/server/auth";
import { isOwnerEmail, isOwnerSignInConfigured } from "~/server/owner";
import { TRPCReactProvider } from "~/trpc/react";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

import { WeightLogEditor } from "./WeightLogEditor";
import { signInWithGoogle, signOutOwner } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Auth.js sends refusals here as `?error=` (the `pages` option in auth.ts). */
function signInError(error: string | string[] | undefined) {
  const code = Array.isArray(error) ? error[0] : error;
  if (!code) return null;
  return code === "AccessDenied"
    ? "That Google account can't sign in here."
    : "Sign-in didn't finish. Try again.";
}

/**
 * The owner's Weight Log page. It reads the session on the server before it
 * renders anything (ADR 0003): only the owner's session gets past the first
 * branch, and everyone else sees the sign-in button and nothing else.
 */
export default async function WeightLogEditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();

  if (isOwnerEmail(session?.user?.email)) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-12">
        <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
          <h1 className="min-w-0 text-xl font-semibold tracking-tight md:text-2xl">
            <Link
              href="/weight-log"
              prefetch={false}
              aria-label="Weight Log chart"
              className="group flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <ArrowLeft
                aria-hidden
                weight="bold"
                className="h-6 w-6 shrink-0 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
              />
              <span className="truncate font-rounded">Weight Log</span>
            </Link>
          </h1>
          <form action={signOutOwner}>
            <Button type="submit" variant="ghost" size="sm">
              <SignOut aria-hidden />
              Sign out
            </Button>
          </form>
        </header>
        <TRPCReactProvider>
          <WeightLogEditor />
        </TRPCReactProvider>
      </div>
    );
  }

  const error = signInError((await searchParams).error);

  return (
    <div className="flex min-h-[70svh] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-rounded text-2xl">
            <h1>Weight Log</h1>
          </CardTitle>
          <CardDescription>Sign in to add weigh-ins.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="text-center text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {isOwnerSignInConfigured() ? (
            <form action={signInWithGoogle}>
              <Button type="submit" className="w-full">
                <GoogleLogo aria-hidden weight="bold" />
                Sign in with Google
              </Button>
            </form>
          ) : (
            <p
              role="status"
              className="text-center text-sm text-muted-foreground"
            >
              Sign-in isn&apos;t available on this deployment.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
