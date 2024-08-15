import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const feedbackSchema = z.object({
  feedback_id: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    const parsedBody = feedbackSchema.parse(body);
    // TODO: implement
    return NextResponse.json({ items: parsedBody.feedback_id });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
