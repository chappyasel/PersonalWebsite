// One-time import of the Weight Log workbook into Postgres.
//
//   set -o pipefail
//   python3 scripts/weight-log/import_workbook.py "$WEIGHT_WORKBOOK" \
//     | node --env-file=.env --import tsx scripts/weight-log/import.ts \
//         --history-context data/weight-log/history-context.enc \
//         --expect-host "$DATABASE_HOST"
//
// DATABASE_URL picks the database and --expect-host must name its host, so a
// default .env cannot aim the import somewhere unintended. NEXTAUTH_SECRET
// decrypts an old `.enc` history file in memory. Output is counts, dates, and
// phase names only, never measurements.
//
// --replace deletes the existing rows first, but refuses while the database
// holds weigh-ins the workbook lacks or records differently (site entries),
// unless --discard-site-entries is also passed. A real run locks out weigh-in
// writes from that check until it commits (import-database.ts). --dry-run reads the export and
// the database in a read-only transaction, runs every check, and writes nothing.
import { drizzle } from "drizzle-orm/postgres-js";
import { parseArgs } from "node:util";
import postgres from "postgres";

import { writeImport } from "./import-database";
import { planImport } from "./import-plan";
import {
  readHistoricalContext,
  readStdin,
  workbookExportSchema,
} from "./sources";

const { values } = parseArgs({
  options: {
    "history-context": { type: "string" },
    "expect-host": { type: "string" },
    replace: { type: "boolean", default: false },
    "discard-site-entries": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  },
});

let connection: ReturnType<typeof postgres> | undefined;
try {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL");
  const host = new URL(url).host;
  console.log(`Target database host: ${host}`);
  if (!values["expect-host"] || values["expect-host"] !== host)
    throw new Error("Refusing to write: --expect-host must match that host");
  if (!values["history-context"])
    throw new Error("Pass --history-context with the history companion file");

  const exported = workbookExportSchema.parse(JSON.parse(await readStdin()));
  const history = await readHistoricalContext(
    values["history-context"],
    process.env.NEXTAUTH_SECRET ?? "",
  );
  const plan = planImport(exported, history);

  connection = postgres(url, { max: 1, connect_timeout: 15 });
  const dryRun = values["dry-run"];
  const replacing = await writeImport(drizzle(connection), plan, {
    replace: values.replace,
    discardSiteEntries: values["discard-site-entries"],
    dryRun,
  });
  if (dryRun)
    console.log(
      `Dry run in a read-only transaction: every check passed${replacing ? ", and --replace would delete the existing rows first" : ""}. Nothing was written.`,
    );

  const excluded = plan.weighIns.filter((row) => row.excluded).length;
  const kinds = plan.phases.reduce<Record<string, number>>(
    (counts, phase) => ({
      ...counts,
      [phase.kind]: (counts[phase.kind] ?? 0) + 1,
    }),
    {},
  );
  console.log(
    `${dryRun ? "Would import" : "Imported"} ${plan.weighIns.length} weigh-ins (${excluded} excluded), ${plan.phases.length} phases (${Object.entries(
      kinds,
    )
      .map(([kind, count]) => `${count} ${kind}`)
      .join(
        ", ",
      )}), ${plan.plannedWeeks.length} planned weeks, ${plan.setPoints.length} set points, ${plan.scans.length} scans, 1 recollection, and ${plan.strength.length} strength readings in one transaction.`,
  );
  const running = plan.phases.filter((phase) => phase.endDate === null);
  console.log(
    `Running phase: ${running.map((phase) => phase.name).join(", ") || "none"}.`,
  );
  console.log(`Trimmed ${plan.trimmed.length} empty planned weeks:`);
  for (const week of plan.trimmed)
    console.log(`  ${week.phase}: week of ${week.weekStart}`);
} catch (error) {
  // Zod and database errors can quote input values, so print only known messages.
  const message = error instanceof Error ? error.message : "";
  console.error(
    /^(Set DATABASE_URL|Refusing|Pass --history|Week |Two |Phase |Weigh-in on |Decrypting|Invalid encrypted|Input too large)/.test(
      message,
    )
      ? message
      : "Weight Log import failed. Nothing was written. Check the importer output, history file, secret, and database access.",
  );
  process.exitCode = 1;
} finally {
  await connection?.end();
}
