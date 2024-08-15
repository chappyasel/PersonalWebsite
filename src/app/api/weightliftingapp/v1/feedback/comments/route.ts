import { type NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const feedbackId = req.nextUrl.searchParams.get("feedback_id");
    // TODO: implement
    return NextResponse.json({ items: feedbackId });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
