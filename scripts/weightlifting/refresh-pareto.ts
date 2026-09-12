import { getWeightLog } from "../../src/lib/weight-log/data";
import {
  decryptWeightLog,
  encryptWeightLog,
} from "../../src/lib/weight-log/encryption";
import {
  buildParetoPayload,
  dominates,
} from "../../src/lib/weightlifting/pareto/analysis";
import { getParetoConfig } from "../../src/lib/weightlifting/pareto/config";
import {
  loadParetoAttempts,
  loadParetoExerciseNames,
} from "../../src/lib/weightlifting/pareto/database";
import { drizzle } from "drizzle-orm/postgres-js";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import postgres from "postgres";

// Only aggregates and verification outcomes go to stdout. The database is read-only.
const { values } = parseArgs({
  options: {
    workbook: { type: "string" },
    production: { type: "boolean" },
    "check-reference": { type: "boolean" },
  },
});
let connection: ReturnType<typeof postgres> | undefined;
try {
  if (values.production && values.workbook)
    throw new Error("Production verification cannot import a local workbook");
  if (values.production && process.env.NODE_ENV !== "production")
    throw new Error("Production verification requires NODE_ENV=production");
  if (!values.production && process.env.NODE_ENV === "production")
    throw new Error("Use --production for production sources");
  if (values.workbook) {
    const imported = spawnSync(
      "python3",
      ["scripts/weight-log/import_workbook.py", values.workbook],
      { encoding: "utf8", maxBuffer: 5_000_000 },
    );
    if (imported.status !== 0)
      throw new Error(
        "Workbook validation failed; run the importer tests and inspect the workbook locally",
      );
    const stored = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/weight-log/store.ts"],
      { input: imported.stdout, encoding: "utf8", maxBuffer: 5_000_000 },
    );
    if (stored.status !== 0)
      throw new Error("Encrypted local snapshot import failed");
    console.log(
      "Workbook validated and imported into encrypted local storage.",
    );
  }
  const log = await getWeightLog();
  connection = postgres(process.env.DATABASE_URL!, {
    connect_timeout: 15,
    max: 1,
  });
  const database = drizzle(connection);
  const refreshedAt = new Date().toISOString();
  const payloads = [];
  const exerciseNames = await loadParetoExerciseNames(database);
  for (const displayName of exerciseNames) {
    const config = getParetoConfig(displayName);
    const lifting = await loadParetoAttempts(database, config.displayName);
    const payload = buildParetoPayload(
      lifting.attempts,
      log,
      config,
      lifting.liftingSyncedAt,
      refreshedAt,
    );
    // Independent strict-dominance oracle catches algorithm and serialization regressions.
    for (const point of payload.points) {
      if (
        point.frontier !==
        !payload.points.some((other) => dominates(other, point))
      )
        throw new Error("Frontier verification failed");
    }
    if (config.id === "bench" && values["check-reference"]) {
      const latest = payload.points.find(
        (point) =>
          point.date === "2026-09-12" &&
          point.weight === 320 &&
          point.reps === 14,
      );
      const earlier = payload.points.find(
        (point) =>
          point.date === "2026-01-14" &&
          point.weight === 343 &&
          point.reps === 11,
      );
      if (
        !latest ||
        !earlier ||
        latest.oneRM !== 473 ||
        earlier.oneRM !== 473 ||
        Math.abs(latest.bodyweight - 217.34) > 0.01 ||
        Math.abs(earlier.bodyweight - 213.29) > 0.01 ||
        latest.frontier ||
        !dominates(earlier, latest)
      )
        throw new Error("September 12 reference regression failed");
      console.log("September 12 reference regression passed.");
    }
    payloads.push(payload);
    console.log(
      `${config.id}: ${payload.evaluatedCount} attempts evaluated, ${payload.unestimatedCount} unestimated, ${payload.points.filter((point) => point.frontier).length} frontier attempts; strict dominance verified.`,
    );
  }
  const plain = JSON.stringify({
    version: 1,
    source: values.production ? "production" : "local",
    payloads,
  });
  const destination = "data/weight-log/pareto.enc";
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  await mkdir("data/weight-log", { recursive: true, mode: 0o700 });
  await writeFile(`${destination}.tmp`, encryptWeightLog(plain, secret), {
    mode: 0o600,
  });
  if (decryptWeightLog(await readFile(`${destination}.tmp`), secret) !== plain)
    throw new Error("Materialization readback failed");
  await rename(`${destination}.tmp`, destination);
  console.log(
    "Encrypted analysis materialized and readback verified. No database writes or uploads.",
  );
} catch (error) {
  // Do not print provider errors, connection URLs, workbook paths, or source records.
  console.error(
    error instanceof Error &&
      /^(Production verification|Use --production|Workbook validation|Encrypted local snapshot|Frontier verification|September 12 reference|Materialization readback)/.test(
        error.message,
      )
      ? error.message
      : "Pareto refresh failed. Check database read access, encrypted weight-log availability, and server environment locally.",
  );
  process.exitCode = 1;
} finally {
  await connection?.end();
}
