import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import type postgres from "postgres";

export const personalityTables = [
  "personality_sites",
  "personality_people",
  "personality_assessments",
  "personality_sessions",
  "personality_rate_limits",
  "personality_shares",
] as const;
const columns = {
  personality_sites: ["id", "created_at"],
  personality_people: [
    "id",
    "site_id",
    "name",
    "group_name",
    "created_at",
    "import_key",
  ],
  personality_assessments: [
    "id",
    "person_id",
    "taken_on",
    "date_estimated",
    "added_at",
    "source",
    "external_result_id",
    "source_reference",
    "test_version",
    "score_kind",
    "score_max",
    "scores",
    "facet_scores",
    "notes",
    "import_key",
  ],
} as const;
type ImportTable = keyof typeof columns;
type Row = Record<string, unknown>;
type Library = Record<ImportTable, Row[]>;
const importTables = Object.keys(columns) as ImportTable[];

export async function applyPersonalitySchema(sql: postgres.Sql) {
  const migration = await readFile(
    new URL(
      "../../src/server/db/migrations/0019_personalities.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(719202601)`;
    await tx.unsafe(migration).simple();
    await tx
      .unsafe(
        await readFile(
          new URL(
            "../../src/server/db/migrations/0020_personality_shares.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      )
      .simple();
  });
}

export function readLegacyLibrary(filename: string): Library {
  const sqlite = new DatabaseSync(filename, { readOnly: true });
  try {
    sqlite.exec("BEGIN");
    const version = sqlite.prepare("PRAGMA user_version").get()?.user_version;
    if (version !== 2)
      throw new Error("Expected personality SQLite schema version 2.");
    return {
      personality_sites: sqlite
        .prepare("SELECT id,created_at FROM private_sites ORDER BY id")
        .all(),
      personality_people: sqlite
        .prepare("SELECT * FROM people ORDER BY id")
        .all(),
      personality_assessments: sqlite
        .prepare("SELECT * FROM assessments ORDER BY id")
        .all()
        .map((row) => ({
          ...row,
          scores: JSON.parse(String(row.scores)) as unknown,
          facet_scores:
            row.facet_scores === null
              ? null
              : (JSON.parse(String(row.facet_scores)) as unknown),
          date_estimated: row.date_estimated === 1,
        })),
    };
  } finally {
    sqlite.close();
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonical(record[key])]),
    );
  }
  return value;
}
export function fingerprint(library: unknown) {
  return JSON.stringify(canonical(library));
}

async function verifyRows(sql: postgres.Sql, library: Library) {
  const counts = {} as Record<ImportTable, number>;
  for (const table of importTables) {
    const rows = [...library[table]].sort((a, b) =>
      String(a.id).localeCompare(String(b.id)),
    );
    const actual = rows.length
      ? await sql`SELECT * FROM ${sql(table)} WHERE id IN ${sql(rows.map((row) => String(row.id)))} ORDER BY id`
      : [];
    // Sort in JS on both sides to avoid database collation differences.
    actual.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (fingerprint(actual) !== fingerprint(rows))
      throw new Error(
        `Verification failed for ${table}; existing rows differ. No values were logged.`,
      );
    counts[table] = rows.length;
  }
  return counts;
}

export async function verifyLibrary(sql: postgres.Sql, library: Library) {
  return sql.begin("isolation level repeatable read read only", (tx) =>
    verifyRows(tx, library),
  );
}

export async function importLibrary(sql: postgres.Sql, library: Library) {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(719202601)`;
    for (const table of importTables) {
      const fields = columns[table];
      const placeholders = fields.map(
        (field, i) =>
          `$${i + 1}${field === "scores" || field === "facet_scores" ? "::text::jsonb" : ""}`,
      );
      // All identifiers come from the fixed table/column definitions above.
      const query = `INSERT INTO "${table}" (${fields.map((field) => `"${field}"`).join(",")}) VALUES (${placeholders.join(",")}) ON CONFLICT (id) DO NOTHING`;
      for (const row of library[table]) {
        const values = fields.map((field) => {
          const value = row[field];
          if (field === "scores" || field === "facet_scores")
            return value === null ? null : JSON.stringify(value);
          if (
            value === null ||
            typeof value === "string" ||
            typeof value === "boolean" ||
            typeof value === "number"
          )
            return value;
          throw new Error(`Invalid source field in ${table}.`);
        });
        await tx.unsafe(query, values);
      }
    }
    // Any differing pre-existing record rolls back the entire import.
    return verifyRows(tx, library);
  });
}
