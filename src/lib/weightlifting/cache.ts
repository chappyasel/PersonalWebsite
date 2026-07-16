/**
 * Cache tags/TTL for weightlifting data. Kept in a separate module so the
 * cron route can revalidate without importing the tRPC router.
 */
export const WEIGHTLIFTING_TAG = "weightlifting";
export const WEIGHTLIFTING_ACTIVITY_TAG = "weightlifting-activity";
export const WEIGHTLIFTING_REVALIDATE = 60 * 60 * 6; // 6 hours
