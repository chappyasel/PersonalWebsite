import { bookingRouter } from "~/server/api/routers/booking";
import { booksRouter } from "~/server/api/routers/books";
import { dadRouter } from "~/server/api/routers/dad";
import { liarsdiceRouter } from "~/server/api/routers/liarsdice";
import { postRouter } from "~/server/api/routers/post";
import { weightLogRouter } from "~/server/api/routers/weightLog";
import { weightliftingRouter } from "~/server/api/routers/weightlifting";
import { youtubeRouter } from "~/server/api/routers/youtube";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  booking: bookingRouter,
  books: booksRouter,
  dad: dadRouter,
  liarsdice: liarsdiceRouter,
  weightLog: weightLogRouter,
  weightlifting: weightliftingRouter,
  youtube: youtubeRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
