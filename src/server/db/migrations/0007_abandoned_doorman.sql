ALTER TABLE "yt_watch_history" ADD COLUMN "llm_model" varchar(64);--> statement-breakpoint
ALTER TABLE "yt_watch_history" ADD COLUMN "llm_prompt_version" varchar(16);