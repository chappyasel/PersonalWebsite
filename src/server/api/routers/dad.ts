import { z } from "zod";

import { isValidDadPassword } from "~/lib/dad/access";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

import { env } from "~/env";

export const dadRouter = createTRPCRouter({
  verifyPassword: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(({ input }) => {
      const valid = isValidDadPassword(
        input.password,
        env.DAD_CONTENT_PASSWORD,
      );
      return { valid };
    }),
});
