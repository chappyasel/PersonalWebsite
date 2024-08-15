import { type NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest) {
  try {
    // TODO: implement
    return NextResponse.json({ items: [] });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
