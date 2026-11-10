import { GoogleLogo } from "@phosphor-icons/react/dist/ssr";

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

import { EditorHeader } from "./EditorHeader";
import { WeightLogEditor } from "./WeightLogEditor";
import { signInWithGoogle } from "./actions";
import type { EditorView } from "./headerSlot";

export type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

/** Auth.js sends refusals here as `?error=` (the `pages` option in auth.ts). */
function signInError(error: string | string[] | undefined) {
  const code = Array.isArray(error) ? error[0] : error;
  if (!code) return null;
  return code === "AccessDenied"
    ? "That Google account can't sign in here."
    : "Sign-in didn't finish. Try again.";
}

/**
 * A page of the owner's Weight Log editor. It reads the session on the
 * server before it renders anything (ADR 0003): only the owner's session
 * gets past the first branch, and everyone else sees the sign-in button and
 * nothing else. Weeks, Plan, and Set points each render through here.
 */
export async function OwnerPage({
  searchParams,
  view,
}: {
  searchParams: SearchParams;
  view: EditorView;
}) {
  const session = await auth();

  if (isOwnerEmail(session?.user?.email)) {
    return (
      <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-4 pb-12">
        <EditorHeader view={view} />
        <TRPCReactProvider>
          <WeightLogEditor view={view} />
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
