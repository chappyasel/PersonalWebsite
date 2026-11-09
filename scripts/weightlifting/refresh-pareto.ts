import { loadWeightLogRecords } from "../../src/lib/weight-log/database";
import { buildWeightLog } from "../../src/lib/weight-log/records";
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
import { parseArgs } from "node:util";
import postgres from "postgres";

// Only aggregates and verification outcomes go to stdout. The database is
// read-only: weigh-ins come from the Weight Log tables, lifting from wl_ tables.
const { values } = parseArgs({
  options: {
    production: { type: "boolean" },
    "check-reference": { type: "boolean" },
  },
});
let connection: ReturnType<typeof postgres> | undefined;
try {
  if (values.production && process.env.NODE_ENV !== "production")
    throw new Error("Production verification requires NODE_ENV=production");
  if (!values.production && process.env.NODE_ENV === "production")
    throw new Error("Use --production for production sources");
  connection = postgres(process.env.DATABASE_URL!, {
    connect_timeout: 15,
    max: 1,
  });
  const database = drizzle(connection);
  const log = buildWeightLog(await loadWeightLogRecords(database));
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
  console.log(
    `Verified ${payloads.length} exercise analyses from ${values.production ? "production" : "local"} sources. No database writes or uploads.`,
  );
} catch (error) {
  // Do not print provider errors, connection URLs, workbook paths, or source records.
  console.error(
    error instanceof Error &&
      /^(Production verification|Use --production|Frontier verification|September 12 reference)/.test(
        error.message,
      )
      ? error.message
      : "Pareto refresh failed. Check database read access, the Weight Log tables, and server environment locally.",
  );
  process.exitCode = 1;
} finally {
  await connection?.end();
}
