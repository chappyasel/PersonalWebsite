/**
 * Re-export auth helpers from the root auth.ts file for backwards compatibility
 * and to maintain consistent import paths throughout the app.
 */
export { auth, signIn, signOut } from "@/auth";
