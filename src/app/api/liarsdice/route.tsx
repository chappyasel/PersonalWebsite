import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import * as LiarsDice from "~/lib/liarsdice";

const inputSchema = z.object({
  myDice: z.array(z.number()).length(6),
  totalDice: z.number(),
  countOnes: z.boolean(),
  minProbability: z.number().optional().default(0.01),
});

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as z.infer<typeof inputSchema>;
    const input = inputSchema.parse(body);
    const result = LiarsDice.play(input);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error }, { status: 400 });
  }
}
