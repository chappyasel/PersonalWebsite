CREATE TABLE IF NOT EXISTS "accounts" (
	"user_id" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255),
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" varchar(255) NOT NULL,
	"tag_name" varchar(256) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "books" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"title" varchar(512) NOT NULL,
	"author" varchar(512) NOT NULL,
	"publication_year" integer,
	"started" timestamp with time zone,
	"finished" timestamp with time zone,
	"rating" integer,
	"has_notes" boolean DEFAULT false NOT NULL,
	"has_summary" boolean DEFAULT false NOT NULL,
	"cover_url" text,
	"notion_url" text NOT NULL,
	"notes" text,
	"last_edited_time" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(256),
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"session_token" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sync_completed_at" timestamp with time zone,
	"status" varchar(50) NOT NULL,
	"total_books_in_notion" integer,
	"books_added" integer DEFAULT 0 NOT NULL,
	"books_updated" integer DEFAULT 0 NOT NULL,
	"books_unchanged" integer DEFAULT 0 NOT NULL,
	"full_content_fetched" integer DEFAULT 0 NOT NULL,
	"full_content_skipped" integer DEFAULT 0 NOT NULL,
	"errors" text,
	"error_count" integer DEFAULT 0 NOT NULL,
	"triggered_by" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"email_verified" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"image" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_tokens" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "book_tags" ADD CONSTRAINT "book_tags_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_book_tag_idx" ON "book_tags" ("book_id","tag_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tag_name_idx" ON "book_tags" ("tag_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_tag_book_id_idx" ON "book_tags" ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_finished_idx" ON "books" ("finished");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_rating_idx" ON "books" ("rating");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_last_edited_idx" ON "books" ("last_edited_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_title_idx" ON "books" ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "created_by_idx" ON "posts" ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "name_idx" ON "posts" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "sessions" ("user_id");