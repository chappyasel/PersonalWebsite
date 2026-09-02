/**
 * Versioned, resumable YouTube scoring through Vercel AI Gateway.
 *
 * Safe defaults: without --execute this only prints a preflight estimate.
 *
 *   npx tsx scripts/score-youtube.ts --prepare-calibration --execute
 *   npx tsx scripts/score-youtube.ts --prepare-edge-calibration --execute
 *   npx tsx scripts/score-youtube.ts --prepare-high-learning-calibration --execute
 *   npx tsx scripts/score-youtube.ts --prepare-tone-value-calibration --execute
 *   npx tsx scripts/score-youtube.ts --prepare-near-ten-calibration --execute
 *   npx tsx scripts/score-youtube.ts --scope calibration --execute
 *   npx tsx scripts/score-youtube.ts --scope all --execute --activate
 *   npx tsx scripts/score-youtube.ts --scope all --top-up --execute --activate
 */
import {
  calibrationEdgeBuckets,
  isLikelyHighLearning,
  isLikelyNearTen,
  selectCalibrationVideos,
  selectEdgeCalibrationVideos,
  selectNearTenStressVideos,
  selectToneValueStressVideos,
  toneValueStressBucket,
} from "../src/lib/youtube/calibration";
import {
  type ScoreDimension,
  learningValueScore,
  positivityScore,
} from "../src/lib/youtube/scoring";
import {
  ytCalibrationMembers,
  ytChannels,
  ytClassifications,
  ytClassifierRuns,
  ytVideos,
} from "../src/server/db/schema";
import { Output, gateway, generateText } from "ai";
import "dotenv/config";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { z } from "zod";

const MODEL_ID = process.env.YOUTUBE_SCORING_MODEL ?? "openai/gpt-5.6-luna";
const PROMPT_VERSIONS: Record<ScoreDimension, string> = {
  learning_value: "v5",
  positivity: "v1",
};
const FORMULA_VERSION = "v1";
const INPUT_VERSION = "metadata-v1";
const CALIBRATION_SIZE = 20;
const BATCH_SIZE = 10;
const CONCURRENCY = 16;
const MAX_BATCH_ATTEMPTS = 3;
const DEFAULT_MAX_COST_USD = 15;
// Conservative preflight only. During execution Gateway-reported cost is used.
const PREFLIGHT_COST_PER_VIDEO_DIMENSION_USD = 0.00015;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
const connection = postgres(databaseUrl, { max: 1 });
const db = drizzle(connection);

type Scope = "calibration" | "all";
type Options = {
  execute: boolean;
  prepareCalibration: boolean;
  edgeCalibration: boolean;
  highLearningCalibration: boolean;
  toneValueCalibration: boolean;
  nearTenCalibration: boolean;
  activate: boolean;
  topUp: boolean;
  scope: Scope;
  dimensions: ScoreDimension[];
  limit: number | null;
  maxCostUsd: number;
};

function optionValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseOptions(args: string[]): Options {
  const scope = optionValue(args, "--scope") ?? "calibration";
  if (scope !== "calibration" && scope !== "all") {
    throw new Error("--scope must be calibration or all");
  }
  const dimension = optionValue(args, "--dimension") ?? "both";
  const dimensions: ScoreDimension[] =
    dimension === "both"
      ? ["learning_value", "positivity"]
      : dimension === "learning_value" || dimension === "positivity"
        ? [dimension]
        : (() => {
            throw new Error(
              "--dimension must be learning_value, positivity, or both",
            );
          })();
  const rawLimit = optionValue(args, "--limit");
  const rawMaxCost = optionValue(args, "--max-cost");
  const limit = rawLimit === undefined ? null : Number(rawLimit);
  const maxCostUsd =
    rawMaxCost === undefined ? DEFAULT_MAX_COST_USD : Number(rawMaxCost);
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit must be a positive integer");
  }
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    throw new Error("--max-cost must be a positive number");
  }
  return {
    execute: args.includes("--execute"),
    prepareCalibration:
      args.includes("--prepare-calibration") ||
      args.includes("--prepare-edge-calibration") ||
      args.includes("--prepare-high-learning-calibration") ||
      args.includes("--prepare-tone-value-calibration") ||
      args.includes("--prepare-near-ten-calibration"),
    edgeCalibration: args.includes("--prepare-edge-calibration"),
    highLearningCalibration: args.includes(
      "--prepare-high-learning-calibration",
    ),
    toneValueCalibration: args.includes("--prepare-tone-value-calibration"),
    nearTenCalibration: args.includes("--prepare-near-ten-calibration"),
    activate: args.includes("--activate"),
    topUp: args.includes("--top-up"),
    scope,
    dimensions,
    limit,
    maxCostUsd,
  };
}

type VideoInput = {
  videoId: string;
  title: string | null;
  channelName: string | null;
  description: string | null;
  durationSeconds: number | null;
};

const baseOutputSchema = {
  videoId: z.string(),
  evidence: z.enum(["rich", "sparse", "insufficient"]),
  confidence: z.number().int().min(0).max(10),
};

const learningOutputSchema = z.object({
  ...baseOutputSchema,
  depth: z.number().int().min(0).max(10),
  relevance: z.number().int().min(0).max(10),
  durability: z.number().int().min(0).max(10),
});

const positivityOutputSchema = z.object({
  ...baseOutputSchema,
  positiveAffect: z.number().int().min(0).max(10),
  negativeAffect: z.number().int().min(0).max(10),
  optimism: z.number().int().min(0).max(10),
  arousal: z.number().int().min(0).max(10),
});

const RELEVANCE_PROFILE = `Personally relevant topics include AI, agents, software, data systems, product development, startups, investing, company-building, leadership, organizations, relationships, communication, psychology, decision-making, learning, health, fitness, and human performance. They also include consequential current affairs such as economics, geopolitics, governance, institutions, and technology policy. Relevance is only one component and must not rescue shallow content.`;

const LEARNING_PROMPT = `You independently score Learning Value for a private personal YouTube information-diet tracker.

Learning Value is the expected improvement in knowledge, understanding, capability, or decision quality, whether durable or meaningfully time-sensitive. Do not judge positivity, entertainment, production quality, or whether choosing the video was intentional.

Return whole-number 0-10 components:
- depth: rigor, substance, specificity, and explanatory value
- relevance: likely usefulness to this viewer now
- durability: how long the knowledge remains useful

The default for entertainment is zero Learning Value. Gaming sessions, let's plays, Minecraft builds or update coverage, game challenges, comedy, reactions, music, sports highlights, creator drama, and similar entertainment receive depth=0, relevance=0, durability=0—even when the activity is skillful, strategic, descriptive, or complex. Only depart from zero when the individual video is explicitly instructional or analytical and teaches substantive transferable knowledge beyond playing that game. Depth means depth of explanation, not complexity of gameplay.

Do not confuse scientific or technical simulations with video games. Commentary that uses a simulation to explore a real scientific, mathematical, or systems concept can have meaningful Learning Value even when it is casual or unedited. Conversely, food, craft, or build spectacle and recreations inspired by fiction are entertainment by default; merely showing the making process is not transferable instruction. Score them above zero only when the metadata indicates deliberate teaching of reusable techniques.

Calibrate the components so the locally derived score (45% depth + 30% relevance + 25% durability) follows these ranges:
- 0: entertainment or no meaningful learning
- 1-3: shallow commentary, routine consumer-product coverage, speculation, or a few minor facts
- 3-5: competent general-interest journalism or pop explanation with limited personal relevance or rigor
- 6-8: substantive analysis, instruction, or decision-useful current information
- 9-10: unusually rigorous, transformative, or capability-building material

Consumer hardware reviews are normally 1-3 unless they contain unusually deep technical analysis or directly support an important decision. This does not apply mechanically to new AI model reviews: those can score highly when they substantively explain capabilities, workflows, limitations, or implications relevant to the viewer. A polished general-interest explainer is not automatically deep or personally relevant.

Niche factual catalogs outside the relevance profile—especially “every X explained” lists—are normally 1-3. Claims of research or comprehensiveness do not establish rigorous explanation, transferability, or personal relevance. Topics outside the relevance profile should receive low relevance unless the metadata shows a clear connection to the viewer's known interests, capabilities, or decisions.

Reserve 9-10 for content with clear evidence of exceptional rigor, structured explanation, and substantial transferable understanding or capability. A prestigious speaker, institution, technical topic, long runtime, or interview format does not by itself justify 9-10. Interviews, podcasts, and informal expert conversations should normally remain at 8 or below unless the supplied metadata demonstrates unusually systematic teaching or analysis.

New AI model reviews, rigorous geopolitical analysis, and consequential current affairs can score highly even when durability is low. Generic hype, shallow commentary, and familiar channels do not receive automatic credit.

${RELEVANCE_PROFILE}

Use evidence=insufficient when metadata cannot support a real judgment. Confidence describes confidence in the classification from supplied evidence. Return exactly one keyed record per video and no prose.`;

const POSITIVITY_PROMPT = `You independently score the emotional character of YouTube content for a private personal information-diet tracker.

Judge the affective exposure likely during most of the video, considering the subject and framing. Do not judge Learning Value, factuality, importance, productivity, or production quality. A Minecraft, comedy, gaming, or relaxation video can be highly positive. A useful news or technical video can be neutral or negative.

Return independent whole-number 0-10 components:
- positiveAffect: warmth, joy, amusement, hope, affection, calm, wonder, constructive energy
- negativeAffect: anger, fear, sadness, disgust, humiliation, dread, cynicism, doom
- optimism: hopeless/no agency (0) through credible progress, resolution, and agency (10)
- arousal: calm/flat (0) through extremely activating (10); arousal is diagnostic only

Positive and negative affect may both be high. Neutral delivery of distressing events can still be negative exposure. Do not treat clickbait words as proof of positivity.

Use evidence=insufficient when metadata cannot support a real judgment. Confidence describes confidence in the classification from supplied evidence. Return exactly one keyed record per video and no prose.`;

function formatVideo(video: VideoInput): string {
  const description = video.description?.replace(/\s+/g, " ").slice(0, 1200);
  return JSON.stringify({
    videoId: video.videoId,
    title: video.title,
    channel: video.channelName,
    durationSeconds: video.durationSeconds,
    description: description ?? null,
  });
}

function fingerprint(video: VideoInput): string {
  return createHash("sha256").update(formatVideo(video)).digest("hex");
}

async function prepareCalibration(
  edgeWeighted: boolean,
  highLearning: boolean,
  toneValue: boolean,
  nearTen: boolean,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      video.video_id,
      COALESCE(video.channel_id::text, video.video_id) AS channel_key,
      MAX(event.watched_at) AS watched_at,
      video.duration_seconds,
      video.title,
      video.description,
      video.category_id,
      AVG(history.llm_quality_score) * 10 AS preliminary_score
    FROM yt_videos video
    JOIN yt_watch_events event ON event.video_id = video.video_id
    LEFT JOIN yt_watch_history history ON history.video_id = video.video_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM yt_calibration_members member
      WHERE member.video_id = video.video_id
    )
      AND video.title IS NOT NULL
      AND video.title !~* '^https?://'
    GROUP BY
      video.video_id, video.channel_id, video.duration_seconds,
      video.title, video.description, video.category_id
  `);
  const candidates = [...result].map((row) => ({
    videoId: String(row.video_id),
    channelKey: String(row.channel_key),
    watchedAt: new Date(String(row.watched_at)),
    durationSeconds:
      row.duration_seconds === null ? null : Number(row.duration_seconds),
    preliminaryScore:
      row.preliminary_score === null ? null : Number(row.preliminary_score),
    edgeBuckets: calibrationEdgeBuckets({
      title: nullableString(row.title),
      description: nullableString(row.description),
      categoryId: row.category_id === null ? null : Number(row.category_id),
    }),
    likelyHighLearning: isLikelyHighLearning({
      title: nullableString(row.title),
      description: nullableString(row.description),
      categoryId: row.category_id === null ? null : Number(row.category_id),
    }),
    toneValueBucket: toneValueStressBucket({
      title: nullableString(row.title),
      description: nullableString(row.description),
      categoryId: row.category_id === null ? null : Number(row.category_id),
    }),
    likelyNearTen: isLikelyNearTen({
      title: nullableString(row.title),
      description: nullableString(row.description),
      categoryId: row.category_id === null ? null : Number(row.category_id),
      durationSeconds:
        row.duration_seconds === null ? null : Number(row.duration_seconds),
      preliminaryScore:
        row.preliminary_score === null ? null : Number(row.preliminary_score),
    }),
  }));
  const selected = nearTen
    ? selectNearTenStressVideos(candidates, CALIBRATION_SIZE)
    : toneValue
      ? selectToneValueStressVideos(candidates, CALIBRATION_SIZE)
      : highLearning
        ? selectCalibrationVideos(
            candidates.filter((candidate) => candidate.likelyHighLearning),
            CALIBRATION_SIZE,
          )
        : edgeWeighted
          ? selectEdgeCalibrationVideos(candidates, CALIBRATION_SIZE)
          : selectCalibrationVideos(candidates, CALIBRATION_SIZE);
  if (selected.length > 0) {
    const positions = await db.execute(sql`
      SELECT COALESCE(MAX(position), -1) + 1 AS next_position
      FROM yt_calibration_members
    `);
    const firstPosition = Number(positions[0]?.next_position ?? 0);
    await db.insert(ytCalibrationMembers).values(
      selected.map((videoId, position) => ({
        videoId,
        position: firstPosition + position,
      })),
    );
  }
  return selected.length;
}

async function loadVideos(options: Options): Promise<VideoInput[]> {
  let query = db
    .select({
      videoId: ytVideos.videoId,
      title: ytVideos.title,
      channelName: ytChannels.name,
      description: ytVideos.description,
      durationSeconds: ytVideos.durationSeconds,
    })
    .from(ytVideos)
    .leftJoin(ytChannels, eq(ytVideos.channelId, ytChannels.id))
    .$dynamic();
  if (options.scope === "calibration") {
    query = query.innerJoin(
      ytCalibrationMembers,
      and(
        eq(ytVideos.videoId, ytCalibrationMembers.videoId),
        sql`${ytCalibrationMembers.position} > COALESCE(
          (SELECT MAX(position) FROM yt_calibration_members), -1
        ) - ${CALIBRATION_SIZE}`,
      ),
    );
  } else {
    query = query.where(
      sql`${ytVideos.title} IS NOT NULL AND ${ytVideos.title} !~* '^https?://'`,
    );
  }
  const rows = await query;
  rows.sort((a, b) => a.videoId.localeCompare(b.videoId));
  return options.limit === null ? rows : rows.slice(0, options.limit);
}

type BatchResult = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  records: Array<{
    videoId: string;
    status: "scored" | "unscored";
    score: number | null;
    components: Record<string, number>;
    confidence: number;
    evidence: "rich" | "sparse" | "insufficient";
    inputFingerprint: string;
  }>;
};

async function gatewayCost(
  providerMetadata: Record<string, Record<string, unknown>> | undefined,
): Promise<number> {
  const generationId = providerMetadata?.gateway?.generationId;
  if (typeof generationId !== "string") return 0;
  try {
    const generation = await gateway.getGenerationInfo({ id: generationId });
    return generation.totalCost;
  } catch {
    return 0;
  }
}

async function classifyBatch(
  dimension: ScoreDimension,
  videos: VideoInput[],
): Promise<BatchResult> {
  const isLearning = dimension === "learning_value";
  const shared = {
    model: gateway(MODEL_ID),
    prompt: videos.map(formatVideo).join("\n"),
    maxOutputTokens: 2200,
  };
  const result = isLearning
    ? await generateText({
        ...shared,
        system: LEARNING_PROMPT,
        output: Output.array({
          element: learningOutputSchema,
          name: "learning_value_scores",
        }),
        providerOptions: {
          openai: {
            serviceTier: "flex",
            reasoningEffort: "minimal",
            textVerbosity: "low",
          },
          gateway: { tags: ["youtube-scoring", dimension] },
        },
      })
    : await generateText({
        ...shared,
        system: POSITIVITY_PROMPT,
        output: Output.array({
          element: positivityOutputSchema,
          name: "positivity_scores",
        }),
        providerOptions: {
          openai: {
            serviceTier: "flex",
            reasoningEffort: "minimal",
            textVerbosity: "low",
          },
          gateway: { tags: ["youtube-scoring", dimension] },
        },
      });
  const output: Array<
    | z.infer<typeof learningOutputSchema>
    | z.infer<typeof positivityOutputSchema>
  > = result.output;
  const expectedIds = new Set(videos.map((video) => video.videoId));
  const returnedIds = new Set(output.map((record) => record.videoId));
  if (
    returnedIds.size !== output.length ||
    returnedIds.size !== expectedIds.size ||
    [...expectedIds].some((videoId) => !returnedIds.has(videoId))
  ) {
    throw new Error(`Invalid keyed ${dimension} response; batch not persisted`);
  }
  const videosById = new Map(videos.map((video) => [video.videoId, video]));
  const records = output.map((record) => {
    const video = videosById.get(record.videoId)!;
    const evidence = record.evidence;
    const status = evidence === "insufficient" ? "unscored" : "scored";
    if (isLearning) {
      const learning = learningOutputSchema.parse(record);
      const components = {
        depth: learning.depth,
        relevance: learning.relevance,
        durability: learning.durability,
      };
      return {
        videoId: learning.videoId,
        status,
        score: status === "scored" ? learningValueScore(components) : null,
        components,
        confidence: learning.confidence,
        evidence,
        inputFingerprint: fingerprint(video),
      } as const;
    }
    const positivity = positivityOutputSchema.parse(record);
    const components = {
      positiveAffect: positivity.positiveAffect,
      negativeAffect: positivity.negativeAffect,
      optimism: positivity.optimism,
      arousal: positivity.arousal,
    };
    return {
      videoId: positivity.videoId,
      status,
      score: status === "scored" ? positivityScore(components) : null,
      components,
      confidence: positivity.confidence,
      evidence,
      inputFingerprint: fingerprint(video),
    } as const;
  });
  return {
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    costUsd:
      (await gatewayCost(result.providerMetadata)) ||
      videos.length * PREFLIGHT_COST_PER_VIDEO_DIMENSION_USD,
    records,
  };
}

async function classifyBatchWithRetry(
  dimension: ScoreDimension,
  videos: VideoInput[],
): Promise<BatchResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_BATCH_ATTEMPTS; attempt++) {
    try {
      return await classifyBatch(dimension, videos);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_BATCH_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  if (videos.length > 1) {
    const middle = Math.ceil(videos.length / 2);
    const results = await Promise.all([
      classifyBatchWithRetry(dimension, videos.slice(0, middle)),
      classifyBatchWithRetry(dimension, videos.slice(middle)),
    ]);
    return {
      inputTokens: results.reduce((sum, result) => sum + result.inputTokens, 0),
      outputTokens: results.reduce(
        (sum, result) => sum + result.outputTokens,
        0,
      ),
      costUsd: results.reduce((sum, result) => sum + result.costUsd, 0),
      records: results.flatMap((result) => result.records),
    };
  }
  throw lastError;
}

async function activateRun(runId: number, dimension: ScoreDimension) {
  await db.transaction(async (tx) => {
    await tx
      .update(ytClassifierRuns)
      .set({ status: "complete", activatedAt: null })
      .where(
        and(
          eq(ytClassifierRuns.dimension, dimension),
          eq(ytClassifierRuns.status, "active"),
        ),
      );
    await tx
      .update(ytClassifierRuns)
      .set({ status: "active", activatedAt: new Date() })
      .where(eq(ytClassifierRuns.id, runId));
  });
}

/**
 * The newest run a fresh pass may append to. Every part of a run's identity has
 * to match what this script would produce today, otherwise appending would mix
 * two models' judgments inside one run. `--top-up` widens the search to the
 * live active run, which is the difference between scoring the few hundred
 * videos that arrived since the last pass and rescoring all 42,000.
 */
async function findReusableRun(
  dimension: ScoreDimension,
  includeActive: boolean,
) {
  const [run] = await db
    .select({
      id: ytClassifierRuns.id,
      status: ytClassifierRuns.status,
      inputTokens: ytClassifierRuns.inputTokens,
      outputTokens: ytClassifierRuns.outputTokens,
      costUsd: ytClassifierRuns.costUsd,
    })
    .from(ytClassifierRuns)
    .where(
      and(
        eq(ytClassifierRuns.dimension, dimension),
        includeActive
          ? inArray(ytClassifierRuns.status, ["running", "active"])
          : eq(ytClassifierRuns.status, "running"),
        eq(ytClassifierRuns.model, MODEL_ID),
        eq(ytClassifierRuns.promptVersion, PROMPT_VERSIONS[dimension]),
        eq(ytClassifierRuns.formulaVersion, FORMULA_VERSION),
        eq(ytClassifierRuns.inputVersion, INPUT_VERSION),
      ),
    )
    .orderBy(desc(ytClassifierRuns.id))
    .limit(1);
  return run;
}

async function scoreDimension(
  dimension: ScoreDimension,
  videos: VideoInput[],
  options: Options,
  spendSoFar: number,
): Promise<number> {
  const resumableRun = await findReusableRun(dimension, options.topUp);
  let run = resumableRun;
  // A resumed run keeps whatever status it had, so a failure mid-top-up
  // restores the live run instead of quietly leaving the dashboard unscored.
  const priorStatus = resumableRun?.status ?? "running";
  if (!run) {
    const [createdRun] = await db
      .insert(ytClassifierRuns)
      .values({
        dimension,
        status: "running",
        model: MODEL_ID,
        promptVersion: PROMPT_VERSIONS[dimension],
        formulaVersion: FORMULA_VERSION,
        inputVersion: INPUT_VERSION,
      })
      .returning({
        id: ytClassifierRuns.id,
        status: ytClassifierRuns.status,
        inputTokens: ytClassifierRuns.inputTokens,
        outputTokens: ytClassifierRuns.outputTokens,
        costUsd: ytClassifierRuns.costUsd,
      });
    run = createdRun;
  } else {
    console.log(`Resuming ${dimension} run ${run.id}.`);
  }
  if (!run) throw new Error("Could not create classifier run");

  const existingRows = await db
    .select({ videoId: ytClassifications.videoId })
    .from(ytClassifications)
    .where(eq(ytClassifications.runId, run.id));
  const existingIds = new Set(existingRows.map((row) => row.videoId));
  const pendingVideos = videos.filter(
    (video) => !existingIds.has(video.videoId),
  );
  let inputTokens = run.inputTokens;
  let outputTokens = run.outputTokens;
  let costUsd = run.costUsd;
  // The run's stored cost is its lifetime ledger. The ceiling governs this
  // invocation, so measure spend from where the resumed run left off; a
  // top-up that costs twelve cents must not inherit the six dollars the
  // original pass spent.
  const costAtStart = costUsd;
  let processed = videos.length - pendingVideos.length;
  console.log(
    `${dimension}: run ${run.id} has ${processed} of ${videos.length} videos; scoring ${pendingVideos.length}.`,
  );
  let nextProgressLog = Math.floor(processed / 400) * 400 + 400;
  try {
    const batches = Array.from(
      { length: Math.ceil(pendingVideos.length / BATCH_SIZE) },
      (_, index) =>
        pendingVideos.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE),
    );
    let nextBatch = 0;
    let workerError: Error | undefined;
    const worker = async () => {
      while (workerError === undefined) {
        const batch = batches[nextBatch++];
        if (!batch) return;
        if (spendSoFar + costUsd - costAtStart >= options.maxCostUsd) {
          workerError = new Error(
            `Cost ceiling reached at $${(spendSoFar + costUsd - costAtStart).toFixed(4)}`,
          );
          return;
        }
        let result: BatchResult;
        try {
          result = await classifyBatchWithRetry(dimension, batch);
        } catch (error) {
          workerError =
            error instanceof Error
              ? error
              : new Error("Unknown batch error", { cause: error });
          return;
        }
        inputTokens += result.inputTokens;
        outputTokens += result.outputTokens;
        costUsd += result.costUsd;
        await db
          .insert(ytClassifications)
          .values(
            result.records.map((record) => ({ ...record, runId: run.id })),
          )
          .onConflictDoNothing();
        processed += result.records.length;
        await db
          .update(ytClassifierRuns)
          .set({ inputTokens, outputTokens, costUsd })
          .where(eq(ytClassifierRuns.id, run.id));
        if (processed === videos.length || processed >= nextProgressLog) {
          console.log(
            `${dimension}: ${processed}/${videos.length}, $${(costUsd - costAtStart).toFixed(4)} this pass`,
          );
          while (nextProgressLog <= processed) nextProgressLog += 400;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker),
    );
    if (workerError !== undefined) {
      throw workerError;
    }
    await db
      .update(ytClassifierRuns)
      .set({
        status: "complete",
        completedAt: new Date(),
        inputTokens,
        outputTokens,
        costUsd,
      })
      .where(eq(ytClassifierRuns.id, run.id));
    if (options.activate) await activateRun(run.id, dimension);
    console.log(
      `${dimension} run ${run.id} complete${options.activate ? " and active" : ""}; spent $${(costUsd - costAtStart).toFixed(4)} this pass`,
    );
    return costUsd - costAtStart;
  } catch (error) {
    await db
      .update(ytClassifierRuns)
      .set({
        status: priorStatus,
        completedAt: null,
        inputTokens,
        outputTokens,
        costUsd,
      })
      .where(eq(ytClassifierRuns.id, run.id));
    throw error;
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const fullCount =
    options.scope === "all"
      ? await db.execute(sql`
          SELECT COUNT(*) AS count
          FROM yt_videos
          WHERE title IS NOT NULL AND title !~* '^https?://'
        `)
      : null;
  const estimatedCount =
    options.limit ??
    (options.scope === "calibration"
      ? CALIBRATION_SIZE
      : Number(fullCount?.[0]?.count ?? 0));
  // Under --top-up most of that corpus is already scored, so quote the work
  // that is actually left rather than the size of the library.
  const perDimensionCounts = await Promise.all(
    options.dimensions.map(async (dimension) => {
      if (!options.topUp) return estimatedCount;
      const run = await findReusableRun(dimension, true);
      if (!run) return estimatedCount;
      const [row] = await db.execute<{ count: string | number }>(sql`
        SELECT COUNT(*) AS count
        FROM yt_videos v
        WHERE v.title IS NOT NULL AND v.title !~* '^https?://'
          AND NOT EXISTS (
            SELECT 1 FROM yt_classifications c
            WHERE c.run_id = ${run.id} AND c.video_id = v.video_id
          )
      `);
      return Math.min(estimatedCount, Number(row?.count ?? 0));
    }),
  );
  const plannedCount = perDimensionCounts.reduce((sum, n) => sum + n, 0);
  const estimate = plannedCount * PREFLIGHT_COST_PER_VIDEO_DIMENSION_USD;
  console.log(
    `Model ${MODEL_ID} via Gateway Flex; ${options.topUp ? "top-up of " : ""}${perDimensionCounts.join(" + ")} videos across ${options.dimensions.length} dimension(s) ≈ $${estimate.toFixed(2)}; hard ceiling $${options.maxCostUsd.toFixed(2)}`,
  );
  if (!options.execute) {
    console.log("Preflight only. Add --execute to write or spend.");
    return;
  }
  await db.execute(sql`SET default_transaction_read_only = off`);
  if (options.prepareCalibration) {
    const selected = await prepareCalibration(
      options.edgeCalibration,
      options.highLearningCalibration,
      options.toneValueCalibration,
      options.nearTenCalibration,
    );
    console.log(
      selected > 0
        ? `Selected ${selected} new ${
            options.nearTenCalibration
              ? "near-10 "
              : options.toneValueCalibration
                ? "tone-vs-value "
                : options.highLearningCalibration
                  ? "high-learning "
                  : options.edgeCalibration
                    ? "edge-weighted "
                    : ""
          }calibration videos.`
        : "No unseen calibration candidates remain.",
    );
    if (!process.argv.includes("--scope")) return;
  }
  const videos = await loadVideos(options);
  if (videos.length === 0) throw new Error("No videos found for this scope");
  let totalSpend = 0;
  for (const dimension of options.dimensions) {
    totalSpend += await scoreDimension(dimension, videos, options, totalSpend);
  }
  console.log(`Finished. Tracked spend: $${totalSpend.toFixed(4)}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => connection.end());
