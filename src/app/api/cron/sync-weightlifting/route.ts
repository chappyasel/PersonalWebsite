import { type NextRequest, NextResponse } from "next/server";

import { syncWeightlifting } from "~/lib/weightlifting/sync";

import { env } from "~/env";

export const maxDuration = 180;

function verifyAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${env.CRON_SECRET}`;
}

async function handleSync(source: "cron" | "manual") {
  console.log(`${source} triggered: syncing weightlifting data...`);
  const result = await syncWeightlifting(source);

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
    return await handleSync("manual");
  } catch (error) {
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
