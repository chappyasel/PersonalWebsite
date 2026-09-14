import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import {
  WEIGHTLIFTING_ACTIVITY_TAG,
  WEIGHTLIFTING_TAG,
} from "~/lib/weightlifting/cache";
import {
  WorkoutSyncBusyError,
  syncWeightlifting,
} from "~/lib/weightlifting/sync";

import { env } from "~/env";

export const maxDuration = 180;

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${env.CRON_SECRET}`;
}

async function handleSync(source: "cron" | "manual" | "s3") {
  console.log(`${source} triggered: syncing weightlifting data...`);
  const result = await syncWeightlifting(source);

  // Purge cached queries when data changed so the dashboard and homepage
  // mosaic refresh. Webhook retries also revalidate in case a previous
  // invocation committed its import but failed during cache invalidation.
  if (!result.skipped || source !== "cron") {
    console.log("Data changed — revalidating weightlifting caches");
    revalidateTag(WEIGHTLIFTING_TAG, "max");
    revalidateTag(WEIGHTLIFTING_ACTIVITY_TAG, "max");
    revalidatePath("/");
  }

  return NextResponse.json({
    success: true,
    result,
  });
}

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await handleSync("cron");
  } catch (error) {
    if (error instanceof WorkoutSyncBusyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
    console.error("Cron sync failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await handleSync(
      request.headers.get("x-workout-sync-source") === "s3" ? "s3" : "manual",
    );
  } catch (error) {
    if (error instanceof WorkoutSyncBusyError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503, headers: { "Retry-After": "30" } },
      );
    }
    console.error("Webhook sync failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
