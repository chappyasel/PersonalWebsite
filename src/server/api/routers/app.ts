import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { getAppWidget } from "~/server/queries/appWidget";

/** Endpoints the native iOS app reads (`ios/`). */
export const nativeAppRouter = createTRPCRouter({
  /** Home Screen widget payload: GET /api/trpc/app.widget */
  widget: publicProcedure.query(getAppWidget),
});
