import { config } from "dotenv";

export function standardPassword() {
  config({
    path: [".env.development.local", ".env.local", ".env.development", ".env"],
    quiet: true,
  });
  const password = process.env.DAD_CONTENT_PASSWORD;
  if (!password)
    throw new Error("The standard site password is not configured.");
  return password;
}
