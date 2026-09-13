import { unstable_cache } from "next/cache";
import "server-only";

import { getWeightLog } from "~/lib/weight-log/data";
import { WEIGHTLIFTING_TAG } from "~/lib/weightlifting/cache";
import { buildParetoPayload } from "~/lib/weightlifting/pareto/analysis";
import { getParetoConfig } from "~/lib/weightlifting/pareto/config";
import { loadParetoAttempts } from "~/lib/weightlifting/pareto/database";
import { db } from "~/server/db";

export const getCachedWeightliftingPareto = unstable_cache(
  async (displayName: string) => {
    const config = getParetoConfig(displayName);
    try {
      const [log, lifting] = await Promise.all([
        getWeightLog(),
        loadParetoAttempts(db, config.displayName),
      ]);
      return buildParetoPayload(
        lifting.attempts,
        log,
        config,
        lifting.liftingSyncedAt,
        new Date().toISOString(),
      );
    } catch {
      throw new Error("Bodyweight analysis is temporarily unavailable");
    }
  },
  ["wl-bodyweight-pareto-v2"],
  { revalidate: 300, tags: [WEIGHTLIFTING_TAG] },
);
