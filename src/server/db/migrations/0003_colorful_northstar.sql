CREATE TABLE IF NOT EXISTS "yt_sync_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sync_completed_at" timestamp with time zone,
	"status" varchar(50) NOT NULL,
	"total_videos" integer,
	"enriched_videos" integer,
	"deleted_videos" integer,
	"errors" text,
	"triggered_by" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "yt_watch_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" varchar(20) NOT NULL,
	"title" varchar(1024),
	"channel_name" varchar(512),
	"channel_url" text,
	"watched_at" timestamp with time zone NOT NULL,
	"duration_seconds" integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_video_id_idx" ON "yt_watch_history" ("video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_watched_at_idx" ON "yt_watch_history" ("watched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_channel_name_idx" ON "yt_watch_history" ("channel_name");