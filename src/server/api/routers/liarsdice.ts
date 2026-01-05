import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import * as LiarsDice from "~/lib/liarsdice";

export const liarsdiceRouter = createTRPCRouter({
  calculateOdds: publicProcedure
    .input(
      z.object({
        myDice: z.array(z.number()).length(6),
        totalDice: z.number(),
        countOnes: z.boolean(),
        minProbability: z.number().optional().default(0.01),
      }),
    )
    .mutation(({ input }) => {
      return LiarsDice.play(input);
    }),
});
