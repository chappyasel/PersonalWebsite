ALTER TABLE "yt_sync_metadata" ADD COLUMN "export_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "yt_sync_metadata" ADD COLUMN "latest_watch_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "yt_sync_metadata" ADD COLUMN "source_file" varchar(256);