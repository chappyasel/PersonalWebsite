"use server";

import { signIn, signOut } from "~/server/auth";

const EDIT_PATH = "/weight-log/edit";

/** Starts Google's OAuth flow. The `signIn` callback decides who gets in. A
 * relative path keeps the return on whichever host Auth.js resolves. */
export async function signInWithGoogle() {
  await signIn("google", { redirectTo: EDIT_PATH });
}

export async function signOutOwner() {
  await signOut({ redirectTo: EDIT_PATH });
}
