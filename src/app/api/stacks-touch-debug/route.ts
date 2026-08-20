import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as unknown;
  const serialized = JSON.stringify(payload).slice(0, 2_000);
  console.info(`[DEBUG-touch-focus] ${serialized}`);
  return NextResponse.json({ ok: true });
}
