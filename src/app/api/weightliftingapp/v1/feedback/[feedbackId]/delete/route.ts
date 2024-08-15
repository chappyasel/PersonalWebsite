import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const deleteSchema = z.object({
  feedbackID: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const { feedbackID } = deleteSchema.parse({
      feedbackID: req.nextUrl.searchParams.get("feedbackID"),
    });
    // TODO: implement
    return NextResponse.json({ feedbackID });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
