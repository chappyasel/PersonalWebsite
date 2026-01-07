-- Step 1: Add notion_id column as nullable first
ALTER TABLE "books" ADD COLUMN "notion_id" varchar(255);--> statement-breakpoint

-- Step 2: Populate notion_id with current id values (which are Notion UUIDs)
UPDATE "books" SET "notion_id" = "id" WHERE "notion_id" IS NULL;--> statement-breakpoint

-- Step 3: Make the column NOT NULL
ALTER TABLE "books" ALTER COLUMN "notion_id" SET NOT NULL;--> statement-breakpoint

-- Step 4: Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS "book_notion_id_idx" ON "books" ("notion_id");