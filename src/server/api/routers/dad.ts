import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const dadRouter = createTRPCRouter({
  verifyPassword: publicProcedure
    .input(z.object({ password: z.string() }))
    .mutation(({ input }) => {
      const valid = input.password === process.env.DAD_CONTENT_PASSWORD;
      return { valid };
    }),
});
