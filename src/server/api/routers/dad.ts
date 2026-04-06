import { z } from "zod";
import { env } from "~/env";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const dadRouter = createTRPCRouter({
  verifyPassword: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(({ input }) => {
      const valid = input.password === env.DAD_CONTENT_PASSWORD;
      return { valid };
    }),
});
