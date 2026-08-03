CREATE TABLE IF NOT EXISTS "yt_calibration_members" (
	"video_id" varchar(20) PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"selected_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "yt_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"youtube_channel_id" varchar(32),
	"name" varchar(512) NOT NULL,
	"url" text,
	"thumbnail_url" text,
	"metadata_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "yt_classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"video_id" varchar(20) NOT NULL,
	"status" varchar(16) NOT NULL,
	"score" integer,
	"components" jsonb,
	"confidence" integer,
	"evidence" varchar(16),
	"input_fingerprint" varchar(64),
	"scored_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "yt_classifier_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"dimension" varchar(32) NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"model" varchar(128) NOT NULL,
	"prompt_version" varchar(32) NOT NULL,
	"formula_version" varchar(32) NOT NULL,
	"input_version" varchar(32) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp with time zone,
	"activated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "yt_manual_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" varchar(20) NOT NULL,
	"dimension" varchar(32) NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "yt_videos" (
	"video_id" varchar(20) PRIMARY KEY NOT NULL,
	"channel_id" integer,
	"title" varchar(1024),
	"description" text,
	"thumbnail_url" text,
	"duration_seconds" integer,
	"category_id" integer,
	"topic_categories" text,
	"tags" text,
	"view_count" double precision,
	"like_count" double precision,
	"has_captions" boolean,
	"definition" varchar(4),
	"metadata_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "yt_watch_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"video_id" varchar(20) NOT NULL,
	"watched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "yt_calibration_members" ADD CONSTRAINT "yt_calibration_members_video_id_yt_videos_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."yt_videos"("video_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "yt_classifications" ADD CONSTRAINT "yt_classifications_run_id_yt_classifier_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."yt_classifier_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "yt_classifications" ADD CONSTRAINT "yt_classifications_video_id_yt_videos_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."yt_videos"("video_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "yt_manual_overrides" ADD CONSTRAINT "yt_manual_overrides_video_id_yt_videos_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."yt_videos"("video_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "yt_videos" ADD CONSTRAINT "yt_videos_channel_id_yt_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."yt_channels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "yt_watch_events" ADD CONSTRAINT "yt_watch_events_video_id_yt_videos_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."yt_videos"("video_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "yt_calibration_members_position_uq" ON "yt_calibration_members" ("position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "yt_channels_youtube_id_uq" ON "yt_channels" ("youtube_channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_channels_name_idx" ON "yt_channels" ("name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "yt_classifications_run_video_uq" ON "yt_classifications" ("run_id","video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_classifications_video_idx" ON "yt_classifications" ("video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_classifier_runs_dimension_status_idx" ON "yt_classifier_runs" ("dimension","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "yt_manual_overrides_video_dimension_uq" ON "yt_manual_overrides" ("video_id","dimension");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_videos_channel_idx" ON "yt_videos" ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_watch_events_video_idx" ON "yt_watch_events" ("video_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_watch_events_watched_at_idx" ON "yt_watch_events" ("watched_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "yt_watch_events_event_uq" ON "yt_watch_events" ("video_id","watched_at");
--> statement-breakpoint
ALTER TABLE "yt_classifier_runs" ADD CONSTRAINT "yt_classifier_runs_dimension_check" CHECK ("dimension" IN ('learning_value', 'positivity'));
--> statement-breakpoint
ALTER TABLE "yt_classifications" ADD CONSTRAINT "yt_classifications_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 10));
--> statement-breakpoint
ALTER TABLE "yt_manual_overrides" ADD CONSTRAINT "yt_manual_overrides_dimension_check" CHECK ("dimension" IN ('learning_value', 'positivity'));
--> statement-breakpoint
ALTER TABLE "yt_manual_overrides" ADD CONSTRAINT "yt_manual_overrides_score_check" CHECK ("score" >= 0 AND "score" <= 10);
--> statement-breakpoint
INSERT INTO "yt_channels" ("youtube_channel_id", "name", "url")
SELECT DISTINCT ON (youtube_channel_id)
  youtube_channel_id,
  channel_name,
  channel_url
FROM (
  SELECT
    substring(channel_url FROM '/channel/([^/?]+)') AS youtube_channel_id,
    channel_name,
    channel_url,
    watched_at
  FROM "yt_watch_history"
  WHERE channel_name IS NOT NULL
    AND channel_url ~ '/channel/[^/?]+'
) identified
ORDER BY youtube_channel_id, watched_at DESC;
--> statement-breakpoint
INSERT INTO "yt_channels" ("name", "url")
SELECT channel_name, channel_url
FROM (
  SELECT DISTINCT ON (channel_name, channel_url)
    channel_name,
    channel_url,
    watched_at
  FROM "yt_watch_history"
  WHERE channel_name IS NOT NULL
    AND (channel_url IS NULL OR channel_url !~ '/channel/[^/?]+')
  ORDER BY channel_name, channel_url, watched_at DESC
) unidentified;
--> statement-breakpoint
WITH best_video AS (
  SELECT DISTINCT ON (history.video_id)
    history.*
  FROM "yt_watch_history" history
  ORDER BY
    history.video_id,
    history.youtube_metadata_fetched_at DESC NULLS LAST,
    history.watched_at DESC
)
INSERT INTO "yt_videos" (
  "video_id", "channel_id", "title", "description", "thumbnail_url",
  "duration_seconds", "category_id", "topic_categories", "tags",
  "view_count", "like_count", "has_captions", "definition",
  "metadata_fetched_at"
)
SELECT
  video.video_id,
  channel.id,
  video.title,
  video.description,
  video.thumbnail_url,
  video.duration_seconds,
  video.category_id,
  video.topic_categories,
  video.tags,
  video.view_count,
  video.like_count,
  video.has_captions,
  video.definition,
  video.youtube_metadata_fetched_at
FROM best_video video
LEFT JOIN LATERAL (
  SELECT candidate.id
  FROM "yt_channels" candidate
  WHERE
    (video.channel_url IS NOT NULL AND candidate.url = video.channel_url)
    OR candidate.name = video.channel_name
  ORDER BY (candidate.url = video.channel_url) DESC NULLS LAST, candidate.id
  LIMIT 1
) channel ON TRUE;
--> statement-breakpoint
INSERT INTO "yt_watch_events" ("video_id", "watched_at")
SELECT "video_id", "watched_at"
FROM "yt_watch_history"
ON CONFLICT ("video_id", "watched_at") DO NOTHING;
