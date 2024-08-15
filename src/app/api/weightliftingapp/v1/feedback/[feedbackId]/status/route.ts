import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const statusSchema = z.object({
  feedbackID: z.string(),
  status: z.number(),
});

export async function POST(req: NextRequest) {
  try {
    const { feedbackID, status } = statusSchema.parse({
      feedbackID: req.nextUrl.searchParams.get("feedbackID")!,
      status: ((await req.json()) as { status: number }).status,
    });
    // TODO: implement
    return NextResponse.json({ feedbackID, status });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
