CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_note_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"notion_id" varchar(255) NOT NULL,
	"ordinal" integer NOT NULL,
	"section" text,
	"heading" text,
	"anchor" varchar(255),
	"content" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"source_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_note_chunk_notion_ordinal_idx" ON "book_note_chunks" ("notion_id","ordinal");