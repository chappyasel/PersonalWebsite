import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const feedbackSchema = z.object({
  ftype: z.string(),
  limit: z.string().optional(),
  start_key: z.any().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const parsedBody = feedbackSchema.parse(body);

    return NextResponse.json(parsedBody);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
