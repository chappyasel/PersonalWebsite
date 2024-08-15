import { type NextRequest, NextResponse } from "next/server";

import data from "./data";

export async function GET(_: NextRequest) {
  return NextResponse.json({ items: data.items });
}
