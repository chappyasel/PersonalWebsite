// Prove the imported Weight Log tables match the old encrypted snapshot.
//
//   node --env-file=.env --import tsx scripts/weight-log/parity.ts \
//     --snapshot data/weight-log/snapshot.enc --workbook "$WEIGHT_WORKBOOK"
//
// Read-only. DATABASE_URL picks the database; NEXTAUTH_SECRET decrypts the
// snapshot in memory. It also runs import_workbook.py on --workbook to check
// the added scan columns, which the snapshot never held. Output names dates, phases, and fields, never
// measurements. Exits 1 when anything other than decision 26's intended
// differences turns up.
import { loadWeightLogRecords } from "../../src/lib/weight-log/database";
import { drizzle } from "drizzle-orm/postgres-js";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import postgres from "postgres";

import { compareParity } from "./parity-check";
import { readLegacySnapshot, workbookExportSchema } from "./sources";

const { values } = parseArgs({
  options: {
    snapshot: { type: "string" },
    workbook: { type: "string" },
  },
});

let connection: ReturnType<typeof postgres> | undefined;
try {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL");
  if (!values.snapshot)
    throw new Error("Pass --snapshot with the old snapshot");
  if (!values.workbook)
    throw new Error("Pass --workbook to check the added scan columns");
  console.log(`Database host (read-only): ${new URL(url).host}`);
  const snapshot = await readLegacySnapshot(
    values.snapshot,
    process.env.NEXTAUTH_SECRET ?? "",
  );
  let workbook;
  {
    const exported = spawnSync(
      "python3",
      ["scripts/weight-log/import_workbook.py", values.workbook],
      { encoding: "utf8", maxBuffer: 5_000_000 },
    );
    if (exported.status !== 0)
      throw new Error("Workbook export failed; run the importer tests");
    workbook = workbookExportSchema.parse(JSON.parse(exported.stdout));
  }
  connection = postgres(url, { max: 1, connect_timeout: 15 });
  const records = await loadWeightLogRecords(drizzle(connection));
  const report = compareParity({ snapshot, records, workbook });

  console.log(
    Object.entries(report.counts)
      .map(([name, count]) => `${name} ${count}`)
      .join(", "),
  );
  const sections = [
    ["Trimmed weeks", report.intended.trimmedWeeks],
    ["Derived phase names", report.intended.derivedPhaseNames],
    ["Removed other kind", report.intended.removedOtherKind],
    [
      `Added scan columns${workbook ? " (checked against the workbook)" : ""}`,
      report.intended.addedScanColumns,
    ],
  ] as const;
  console.log("\nIntended differences (decision 26):");
  for (const [name, items] of sections) {
    console.log(`- ${name}: ${items.length}`);
    for (const item of items) console.log(`    ${item}`);
  }
  console.log(`\nUnexpected differences: ${report.unexpected.length}`);
  for (const item of report.unexpected) console.log(`  ${item}`);
  if (report.unexpected.length) process.exitCode = 1;
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  console.error(
    /^(Set DATABASE_URL|Pass --snapshot|Workbook export|Decrypting|Invalid encrypted|Input too large)/.test(
      message,
    )
      ? message
      : "Parity check failed to run. Check the snapshot, secret, and database access.",
  );
  process.exitCode = 1;
} finally {
  await connection?.end();
}
