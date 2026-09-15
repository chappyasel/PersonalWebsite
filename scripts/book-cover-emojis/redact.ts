/**
 * Keep credentials out of stdout.
 *
 * Notion errors quote the request that failed, and a request carries an
 * Authorization header. Printing one straight to a terminal puts a workspace
 * token in scrollback, and from there into whatever the operator pastes into
 * an issue. Every log line this tool writes goes through here first.
 *
 * Two passes, because neither alone is enough: known secrets from the
 * environment are masked by exact value, and anything shaped like a token is
 * masked even when it came from somewhere we never looked.
 */

export const REDACTED = "[redacted]";

/** A plain bag of variables. Deliberately looser than NodeJS.ProcessEnv, which
 * this repo augments with required keys, so a test can pass two fake values. */
export type EnvLike = Record<string, string | undefined>;

/** Environment variables whose values must never be printed. */
const SECRET_ENV_KEYS = [
  "NOTION_API_KEY",
  "DATABASE_URL",
  "CRON_SECRET",
  "NEXTAUTH_SECRET",
  "AWS_KEY_NAME",
  "GITHUB_TOKEN",
  "GOOGLE_BOOKS_API_KEY",
  "YOUTUBE_API_KEY",
];

const TOKEN_PATTERNS: RegExp[] = [
  // Notion integration tokens, old and current prefixes.
  /\b(?:secret_|ntn_)[A-Za-z0-9]{8,}/g,
  // Bearer headers, however they were quoted.
  /\b[Bb]earer\s+[A-Za-z0-9._~+/-]{8,}=*/g,
  // Anything carrying a password inside a connection string.
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@/g,
  // AWS access key ids.
  /\bAKIA[0-9A-Z]{16}\b/g,
];

/**
 * Values worth masking by exact match. Short values are skipped: masking a
 * two-character secret would blank out unrelated text and make the log
 * useless rather than safe.
 */
function secretValues(env: EnvLike): string[] {
  const values: string[] = [];
  for (const key of SECRET_ENV_KEYS) {
    const value = env[key];
    if (value && value.length >= 8) values.push(value);
  }
  // Longest first, so a secret that contains another is masked whole.
  return values.sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redact(text: string, env: EnvLike = process.env): string {
  let output = text;
  for (const value of secretValues(env)) {
    output = output.replace(new RegExp(escapeRegExp(value), "g"), REDACTED);
  }
  for (const pattern of TOKEN_PATTERNS) {
    output = output.replace(pattern, REDACTED);
  }
  return output;
}

/** Render anything loggable as a redacted single line. */
export function safeMessage(value: unknown, env?: EnvLike): string {
  const raw =
    value instanceof Error
      ? (value.message ?? String(value))
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  return redact(raw ?? "", env).replace(/\s+/g, " ").trim();
}
