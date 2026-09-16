/**
 * Read-only access to the mirrored book catalog.
 *
 * The Postgres mirror is a website cache; Notion is the source of truth. This
 * module only ever reads, and says so to the server: every statement runs
 * inside BEGIN TRANSACTION READ ONLY, the same guard the book-notes skill's
 * q.sh wraps around ad-hoc queries, so a stray write would error rather than
 * land. The credential is read from the repo's ignored .env and never printed.
 */
import type { CatalogRow } from "./grouping";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const STATEMENT_TIMEOUT = "30s";

/** DATABASE_URL from the environment, else the one line of the repo .env. */
export function resolveDatabaseUrl(repoRoot: string): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  let raw: string;
  try {
    raw = readFileSync(`${repoRoot}/.env`, "utf8");
  } catch {
    throw new Error(
      "DATABASE_URL is not set and the repository .env could not be read",
    );
  }
  const line = raw
    .split("\n")
    .find((candidate) => candidate.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL is not present in the repository .env");
  return line
    .slice("DATABASE_URL=".length)
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");
}

type Raw = {
  id: string;
  notion_id: string;
  title: string;
  author: string;
  publication_year: number | null;
  finished: Date | null;
  abandoned: Date | null;
  cover_url: string | null;
  cover_color: string | null;
};

function isoDay(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export async function readCatalog(databaseUrl: string): Promise<CatalogRow[]> {
  const sql = postgres(databaseUrl, {
    max: 1,
    connect_timeout: 20,
    idle_timeout: 5,
    prepare: false,
    onnotice: () => undefined,
  });
  try {
    const result = await sql.begin(async (tx) => {
      await tx.unsafe("SET TRANSACTION READ ONLY");
      await tx.unsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
      const rows = await tx.unsafe<Raw[]>(
        `SELECT id, notion_id, title, author, publication_year,
                finished, abandoned, cover_url, cover_color
           FROM books
          ORDER BY notion_id`,
      );
      return { rows };
    });
    return (result as { rows: Raw[] }).rows.map((row) => ({
      id: row.id,
      notionId: row.notion_id,
      title: row.title,
      author: row.author,
      publicationYear: row.publication_year,
      finished: isoDay(row.finished),
      abandoned: isoDay(row.abandoned),
      coverUrl: row.cover_url,
      coverColor: row.cover_color,
    }));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
