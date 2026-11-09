// List the migrations `pnpm db:migrate:prod` would apply, before cutover day's
// migrate step.
//
//   node --env-file=.env --import tsx scripts/weight-log/pending-migrations.ts
//
// Read-only. drizzle reads only the newest `created_at` in
// drizzle.__drizzle_migrations and applies every journal entry whose `when` is
// later. Exits 1 unless 0023_weight_log is the only one pending.
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const EXPECTED = ["0023_weight_log"];

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL");
console.log(`Database host (read-only): ${new URL(url).host}`);

const journal = JSON.parse(
  await readFile("src/server/db/migrations/meta/_journal.json", "utf8"),
) as { entries: { tag: string; when: number }[] };

const sql = postgres(url, { max: 1, connect_timeout: 15 });
try {
  const [row] = await sql.begin(
    "read only",
    (tx) => tx<{ latest: string | null }[]>`
      SELECT MAX(created_at)::text AS latest FROM drizzle.__drizzle_migrations
    `,
  );
  const latest = Number(row?.latest ?? 0);
  const applied = journal.entries.filter((entry) => entry.when <= latest);
  const pending = journal.entries
    .filter((entry) => entry.when > latest)
    .map((entry) => entry.tag);
  console.log(`Latest applied: ${applied.at(-1)?.tag ?? "none"}`);
  console.log(`Pending: ${pending.join(", ") || "none"}`);
  if (pending.join() !== EXPECTED.join()) {
    console.log(`Expected only ${EXPECTED.join(", ")} to be pending.`);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
