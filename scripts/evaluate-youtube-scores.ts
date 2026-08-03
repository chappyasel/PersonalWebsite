/** Compare completed calibration runs with permanent manual overrides. */
import { evaluateScores } from "../src/lib/youtube/evaluation";
import "dotenv/config";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
const connection = postgres(databaseUrl, { max: 1 });

async function main() {
  const rows = await connection.unsafe(`
    SELECT
      run.id AS run_id,
      run.dimension,
      run.model,
      run.prompt_version,
      classification.score AS predicted,
      override.score AS actual
    FROM yt_classifier_runs run
    JOIN yt_classifications classification ON classification.run_id = run.id
    JOIN yt_calibration_members member ON member.video_id = classification.video_id
    JOIN yt_manual_overrides override
      ON override.video_id = classification.video_id
      AND override.dimension = run.dimension
    WHERE run.status IN ('complete', 'active')
      AND classification.status = 'scored'
    ORDER BY run.id, classification.video_id
  `);
  const grouped = new Map<
    number,
    {
      dimension: string;
      model: string;
      promptVersion: string;
      pairs: Array<{ predicted: number; actual: number }>;
    }
  >();
  for (const row of rows) {
    const runId = Number(row.run_id);
    const group = grouped.get(runId) ?? {
      dimension: String(row.dimension),
      model: String(row.model),
      promptVersion: String(row.prompt_version),
      pairs: [],
    };
    group.pairs.push({
      predicted: Number(row.predicted),
      actual: Number(row.actual),
    });
    grouped.set(runId, group);
  }
  if (grouped.size === 0) {
    console.log("No reviewed calibration scores yet.");
    return;
  }
  for (const [runId, group] of grouped) {
    const metrics = evaluateScores(group.pairs);
    const pass =
      metrics.count >= 180 &&
      metrics.mae !== null &&
      metrics.mae <= 1 &&
      metrics.bias !== null &&
      Math.abs(metrics.bias) <= 0.3;
    console.log(
      [
        `Run ${runId} · ${group.dimension} · ${group.model} · ${group.promptVersion}`,
        `${metrics.count} labels`,
        `MAE ${metrics.mae?.toFixed(2) ?? "—"}`,
        `bias ${metrics.bias?.toFixed(2) ?? "—"}`,
        `within ±1 ${metrics.withinOne == null ? "—" : `${Math.round(metrics.withinOne * 100)}%`}`,
        `correlation ${metrics.correlation?.toFixed(2) ?? "—"}`,
        pass ? "PASS" : "NOT YET PASSING",
      ].join(" | "),
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => connection.end());
