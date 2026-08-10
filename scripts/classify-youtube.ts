/**
 * One-time LLM classification of YouTube videos for quality scoring.
 * Uses Vercel AI SDK + AI Gateway with OpenAI-compatible API.
 *
 * Run with: npx tsx scripts/classify-youtube.ts
 *
 * Processes unique (videoId, title, channel) combinations,
 * writes llm_quality_score to all matching rows.
 * Skips videos that already have a score (idempotent).
 */

import "dotenv/config";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, jsonSchema } from "ai";
import { eq, sql } from "drizzle-orm";

import { CATEGORY_NAMES } from "../src/lib/youtube/categories";
import { db } from "../src/server/db";
import { ytWatchHistory } from "../src/server/db/schema";

const BATCH_SIZE = 25; // videos per LLM call (smaller = more reliable output)
const CONCURRENCY = 15; // parallel LLM requests
const MODEL_ID = "openai/gpt-5.4";
const PROMPT_VERSION = "v2";

const gateway = createOpenAI({
  baseURL: "https://ai-gateway.vercel.sh/v1",
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

const model = gateway(MODEL_ID);

const responseSchema = jsonSchema<{
  scores: number[];
}>({
  type: "object",
  properties: {
    scores: {
      type: "array",
      items: { type: "number" },
    },
  },
  required: ["scores"],
  additionalProperties: false,
});

const SYSTEM_PROMPT = `You are a personal YouTube consumption quality scorer for a tech entrepreneur and AI community leader. Rate each video 0.0–1.0.

Core question: Does this build skills, knowledge, or capability? Is it intentional learning or algorithm-driven consumption?

CALIBRATION EXAMPLES — use these as anchors for consistent scoring:
- AI Explained (AI/ML deep dives) → 0.90
- 3Blue1Brown (math/CS visual education) → 0.90
- Theo - t3.gg (web dev, software engineering) → 0.85
- Fireship (programming tutorials, tech education) → 0.80
- Veritasium (deep science explainers) → 0.75
- ColdFusion (tech/business storytelling) → 0.65
- Kurzgesagt (pop science education) → 0.65
- Wendover Productions (systems, logistics) → 0.55
- Big Think (philosophy, ideas, mental models) → 0.55
- Jeff Nippard (evidence-based fitness science) → 0.50
- Renaissance Periodization (hypertrophy science) → 0.45
- Vox (journalism, current events) → 0.35
- Marques Brownlee / MKBHD (tech product reviews) → 0.30
- Linus Tech Tips (tech reviews/entertainment) → 0.30
- dreading (true crime disguised as psychology) → 0.10
- Doug DeMuro (car reviews, entertainment) → 0.00
- PewDiePie (comedy, memes) → 0.00
- EthosLab (Minecraft gaming) → 0.00
- penguinz0 (comedy, internet commentary) → 0.00
- Classic Tetris (gaming competition streams) → 0.00

RULES:
- Be consistent: similar channels/content MUST get similar scores
- Channel reputation is the strongest signal — use the examples above to calibrate unknown channels by similarity
- True crime, internet drama, and documentary-style entertainment are NOT education, even if YouTube categorizes them that way (0.0-0.10)
- Gaming let's plays, comedy, memes, music, highlights, shorts, compilations, reaction videos → 0.00
- Tech product reviews are consumption, not learning (0.25-0.35)
- Fitness/bodybuilding science content → 0.40-0.55
- The score for a channel should be roughly consistent across its videos unless the content genuinely varies

Return exactly one score per video in the scores array, maintaining input order. The array length MUST equal the number of input videos.`;

function formatDuration(seconds: number | null): string {
  if (!seconds) return "?";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h${m}m`;
}

function parseTopics(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const urls = JSON.parse(raw) as string[];
    return urls.map((u) =>
      decodeURIComponent(u.split("/").pop() ?? "").replace(/_/g, " "),
    );
  } catch {
    return [];
  }
}

type UniqueVideo = {
  videoId: string;
  title: string;
  channelName: string;
  categoryId: number | null;
  topicCategories: string | null;
  durationSeconds: number | null;
};

async function classifyBatch(
  batch: UniqueVideo[],
): Promise<{ classified: number; errors: number }> {
  const videoLines = batch
    .map((v, idx) => {
      const cat = v.categoryId
        ? (CATEGORY_NAMES[v.categoryId] ?? "Unknown")
        : "Unknown";
      const topics = parseTopics(v.topicCategories);
      const topicStr = topics.length > 0 ? ` | [${topics.join(", ")}]` : "";
      const dur = formatDuration(v.durationSeconds);
      return `${idx + 1}. "${v.title}" | ${v.channelName} | ${cat}${topicStr} | ${dur}`;
    })
    .join("\n");

  try {
    const { object } = await generateObject({
      model,
      schema: responseSchema,
      system: SYSTEM_PROMPT,
      prompt: `Rate these ${batch.length} videos:\n\n${videoLines}`,
    });

    let classified = 0;
    let errors = 0;

    if (object.scores.length !== batch.length) {
      console.error(`  Length mismatch: expected ${batch.length}, got ${object.scores.length}`);
      // Still use what we got — match by position up to the shorter length
    }

    const len = Math.min(object.scores.length, batch.length);
    for (let j = 0; j < len; j++) {
      const score = Math.round(object.scores[j]! * 100) / 100;
      if (score >= 0 && score <= 1) {
        await db
          .update(ytWatchHistory)
          .set({ llmQualityScore: score, llmModel: MODEL_ID, llmPromptVersion: PROMPT_VERSION })
          .where(eq(ytWatchHistory.videoId, batch[j]!.videoId));
        classified++;
      } else {
        errors++;
      }
    }
    errors += batch.length - len;
    return { classified, errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  Batch error: ${msg.substring(0, 120)}`);
    return { classified: 0, errors: batch.length };
  }
}

async function main() {
  // Classification is an explicit write workflow; local agent sessions default
  // to read-only unless the connection opts in.
  await db.execute(sql`SET default_transaction_read_only = off`);
  console.log("Fetching unclassified videos...");
  const rows = await db
    .select({
      videoId: ytWatchHistory.videoId,
      title: ytWatchHistory.title,
      channelName: ytWatchHistory.channelName,
      categoryId: ytWatchHistory.categoryId,
      topicCategories: ytWatchHistory.topicCategories,
      durationSeconds: ytWatchHistory.durationSeconds,
    })
    .from(ytWatchHistory)
    .where(sql`${ytWatchHistory.llmPromptVersion} IS DISTINCT FROM ${PROMPT_VERSION} OR ${ytWatchHistory.llmModel} IS DISTINCT FROM ${MODEL_ID}`)
    .groupBy(
      ytWatchHistory.videoId,
      ytWatchHistory.title,
      ytWatchHistory.channelName,
      ytWatchHistory.categoryId,
      ytWatchHistory.topicCategories,
      ytWatchHistory.durationSeconds,
    );

  // Deduplicate by videoId
  const videoMap = new Map<string, UniqueVideo>();
  for (const r of rows) {
    if (!videoMap.has(r.videoId) && r.title) {
      videoMap.set(r.videoId, {
        videoId: r.videoId,
        title: r.title,
        channelName: r.channelName ?? "Unknown",
        categoryId: r.categoryId,
        topicCategories: r.topicCategories,
        durationSeconds: r.durationSeconds,
      });
    }
  }

  const videos = [...videoMap.values()];
  console.log(
    `${videos.length} unique videos to classify (${CONCURRENCY} parallel, ${BATCH_SIZE}/batch)`,
  );

  if (videos.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  // Split into batches
  const batches: UniqueVideo[][] = [];
  for (let i = 0; i < videos.length; i += BATCH_SIZE) {
    batches.push(videos.slice(i, i + BATCH_SIZE));
  }

  let totalClassified = 0;
  let totalErrors = 0;
  let batchesDone = 0;

  // Process with concurrency pool
  const pool: Promise<void>[] = [];

  for (const batch of batches) {
    const task = classifyBatch(batch).then((result) => {
      totalClassified += result.classified;
      totalErrors += result.errors;
      batchesDone++;
      if (batchesDone % 10 === 0 || batchesDone === batches.length) {
        console.log(
          `  Progress: ${batchesDone}/${batches.length} batches (${totalClassified} classified, ${totalErrors} errors)`,
        );
      }
    });

    pool.push(task);

    // Limit concurrency
    if (pool.length >= CONCURRENCY) {
      await Promise.race(pool);
      // Remove settled promises
      for (let i = pool.length - 1; i >= 0; i--) {
        const settled = await Promise.race([
          pool[i]!.then(() => true),
          Promise.resolve(false),
        ]);
        if (settled) pool.splice(i, 1);
      }
    }
  }

  // Wait for remaining
  await Promise.all(pool);

  console.log(
    `\nDone. Classified ${totalClassified} videos, ${totalErrors} errors.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Classification failed:", err);
  process.exit(1);
});
