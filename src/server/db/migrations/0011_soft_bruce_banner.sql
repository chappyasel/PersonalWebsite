ALTER TABLE "yt_watch_history" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "yt_watch_history" ADD COLUMN "thumbnail_url" text;--> statement-breakpoint
ALTER TABLE "yt_watch_history" ADD COLUMN "youtube_metadata_fetched_at" timestamp with time zone;