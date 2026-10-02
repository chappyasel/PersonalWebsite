ALTER TABLE "book_note_chunks" ADD COLUMN IF NOT EXISTS "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("heading", '') || ' ' || "content")) STORED;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_note_chunk_search_idx" ON "book_note_chunks" USING gin ("search_vector");