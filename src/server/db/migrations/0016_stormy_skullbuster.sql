ALTER TABLE "books" ADD COLUMN "abandoned" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "abandoned_at_min" integer;