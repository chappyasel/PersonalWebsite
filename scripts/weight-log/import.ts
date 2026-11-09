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
import {
  weightLogBodyFatRecollections,
  weightLogPhases,
  weightLogPlannedWeeks,
  weightLogScans,
  weightLogSetPoints,
  weightLogStrengthHistory,
  weightLogWeighIns,
} from "../../src/server/db/schema";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { parseArgs } from "node:util";
import postgres from "postgres";

import { planImport } from "./import-plan";
import {
  readHistoricalContext,
  readStdin,
  workbookExportSchema,
} from "./sources";

const TABLES = [
  weightLogPlannedWeeks,
  weightLogPhases,
  weightLogWeighIns,
  weightLogSetPoints,
  weightLogScans,
  weightLogBodyFatRecollections,
  weightLogStrengthHistory,
];

function chunks<T>(rows: T[], size = 500) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

const { values } = parseArgs({
  options: {
    "history-context": { type: "string" },
    "expect-host": { type: "string" },
    replace: { type: "boolean", default: false },
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
  const db = drizzle(connection);
  await db.transaction(async (tx) => {
    const existing = await tx.execute<{ rows: number }>(sql`
      SELECT (SELECT COUNT(*) FROM weight_log_weigh_ins)
        + (SELECT COUNT(*) FROM weight_log_phases)
        + (SELECT COUNT(*) FROM weight_log_scans)
        + (SELECT COUNT(*) FROM weight_log_set_points)
        + (SELECT COUNT(*) FROM weight_log_body_fat_recollections)
        + (SELECT COUNT(*) FROM weight_log_strength_history) AS rows
    `);
    if (Number(existing[0]?.rows) > 0) {
      if (!values.replace)
        throw new Error(
          "Refusing to import: the Weight Log tables already hold data. Pass --replace to overwrite them.",
        );
      for (const table of TABLES) await tx.delete(table);
      console.log("Replaced the existing Weight Log rows.");
    }

    const phaseIds = new Map<string, number>();
    for (const phase of plan.phases) {
      const [row] = await tx
        .insert(weightLogPhases)
        .values({
          kind: phase.kind,
          startDate: phase.startDate,
          endDate: phase.endDate,
        })
        .returning({ id: weightLogPhases.id });
      phaseIds.set(phase.startDate, row!.id);
    }
    for (const rows of chunks(plan.plannedWeeks))
      await tx.insert(weightLogPlannedWeeks).values(
        rows.map((week) => ({
          weekStart: week.weekStart,
          phaseId: phaseIds.get(week.phaseStart)!,
          target: week.target,
          originalTarget: week.originalTarget,
        })),
      );
    for (const rows of chunks(plan.weighIns))
      await tx.insert(weightLogWeighIns).values(rows);
    if (plan.setPoints.length)
      await tx.insert(weightLogSetPoints).values(plan.setPoints);
    if (plan.scans.length) await tx.insert(weightLogScans).values(plan.scans);
    await tx.insert(weightLogBodyFatRecollections).values(plan.recollection);
    for (const rows of chunks(plan.strength))
      await tx.insert(weightLogStrengthHistory).values(rows);
  });

  const excluded = plan.weighIns.filter((row) => row.excluded).length;
  const kinds = plan.phases.reduce<Record<string, number>>(
    (counts, phase) => ({
      ...counts,
      [phase.kind]: (counts[phase.kind] ?? 0) + 1,
    }),
    {},
  );
  console.log(
    `Imported ${plan.weighIns.length} weigh-ins (${excluded} excluded), ${plan.phases.length} phases (${Object.entries(
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
