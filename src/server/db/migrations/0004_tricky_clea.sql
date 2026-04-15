ALTER TABLE "yt_watch_history" ADD COLUMN "category_id" integer;--> statement-breakpoint
ALTER TABLE "yt_watch_history" ADD COLUMN "topic_categories" text;--> statement-breakpoint
ALTER TABLE "yt_watch_history" ADD COLUMN "tags" text;--> statement-breakpoint
ALTER TABLE "yt_watch_history" ADD COLUMN "view_count" integer;--> statement-breakpoint
ALTER TABLE "yt_watch_history" ADD COLUMN "like_count" integer;--> statement-breakpoint
ALTER TABLE "yt_watch_history" ADD COLUMN "has_captions" boolean;--> statement-breakpoint
ALTER TABLE "yt_watch_history" ADD COLUMN "definition" varchar(4);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "yt_category_id_idx" ON "yt_watch_history" ("category_id");