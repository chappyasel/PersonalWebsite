import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const feedbackSchema = z.object({
  ftype: z.number(),
  user_id: z.string(),
  email: z.string(),
  title: z.string(),
  body: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const parsedBody = feedbackSchema.parse(body);

    const feedback = {
      ftype: parsedBody.ftype,
      id: crypto.randomUUID(),
      user_id: parsedBody.user_id,
      device_id: req.headers.get("device-id") ?? "",
      app_version: req.headers.get("app-version") ?? "",
      email: parsedBody.email,
      ftimestamp: new Date().toISOString(),
      title: parsedBody.title,
      body: parsedBody.body,
      fstatus: "OPEN",
      upvotes: 1,
      upvote_device_ids: new Set([req.headers.get("device-id") ?? ""]),
    };

    return NextResponse.json({ item: feedback });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
