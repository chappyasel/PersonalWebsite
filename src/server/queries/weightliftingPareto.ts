import { unstable_cache } from "next/cache";
import "server-only";

import { getWeightLog } from "~/lib/weight-log/data";
import { WEIGHTLIFTING_TAG } from "~/lib/weightlifting/cache";
import { buildParetoPayload } from "~/lib/weightlifting/pareto/analysis";
import { getParetoConfig } from "~/lib/weightlifting/pareto/config";
import { loadParetoAttempts } from "~/lib/weightlifting/pareto/database";
import { db } from "~/server/db";

async function analysisStep<T>(
  stage: "weight_log" | "lifting" | "analysis",
  run: () => T | Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    let reason = stage === "analysis" ? "analysis_failed" : "source_failed";
    if (stage === "weight_log" && error instanceof Error) {
      const code = "code" in error ? error.code : error.name;
      if (code === "ENOENT" || code === "NoSuchKey")
        reason = "snapshot_missing";
      else if (code === "EACCES" || code === "AccessDenied")
        reason = "access_denied";
      else if (error.name === "ZodError" || error instanceof SyntaxError)
        reason = "snapshot_invalid";
    }
    // Never log the error object, cause, provider text, query input, or measurements.
    console.error("[weightlifting-pareto]", { stage, reason });
    throw new Error("Bodyweight analysis is temporarily unavailable");
  }
}

export const getCachedWeightliftingPareto = unstable_cache(
  async (displayName: string, allVariants?: boolean) => {
    const config = getParetoConfig(displayName);
    const [log, lifting] = await Promise.all([
      analysisStep("weight_log", getWeightLog),
      analysisStep("lifting", () =>
        loadParetoAttempts(db, config.displayName, allVariants ?? false),
      ),
    ]);
    return analysisStep("analysis", () =>
      buildParetoPayload(
        lifting.attempts,
        log,
        config,
        lifting.liftingSyncedAt,
        new Date().toISOString(),
      ),
    );
  },
  ["wl-bodyweight-pareto-v3"],
  { revalidate: 300, tags: [WEIGHTLIFTING_TAG] },
);
