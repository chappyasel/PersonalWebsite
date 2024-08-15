import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const voteSchema = z.object({
  feedbackID: z.string(),
  voteType: z.enum(["upvote", "clear"]),
});

export async function POST(req: NextRequest) {
  try {
    const { feedbackID, voteType } = voteSchema.parse({
      feedbackID: req.nextUrl.searchParams.get("feedbackID"),
      voteType: req.nextUrl.searchParams.get("voteType"),
    });
    // TODO: implement
    return NextResponse.json({ feedbackID, voteType });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
