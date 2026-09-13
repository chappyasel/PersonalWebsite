CREATE TABLE IF NOT EXISTS "personality_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"taken_on" text,
	"date_estimated" boolean DEFAULT false NOT NULL,
	"added_at" text NOT NULL,
	"source" text NOT NULL,
	"external_result_id" text,
	"source_reference" text,
	"test_version" text NOT NULL,
	"score_kind" text NOT NULL,
	"score_max" integer NOT NULL,
	"scores" jsonb NOT NULL,
	"facet_scores" jsonb,
	"notes" text DEFAULT '' NOT NULL,
	"import_key" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personality_people" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"name" text NOT NULL,
	"group_name" text NOT NULL,
	"created_at" text NOT NULL,
	"import_key" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personality_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personality_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"password_version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personality_sites" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personality_assessments" ADD CONSTRAINT "personality_assessments_person_id_personality_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."personality_people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personality_people" ADD CONSTRAINT "personality_people_site_id_personality_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."personality_sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personality_sessions" ADD CONSTRAINT "personality_sessions_site_id_personality_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."personality_sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personality_assessments_person_date" ON "personality_assessments" ("person_id","taken_on");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personality_assessment_external" ON "personality_assessments" ("source","external_result_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personality_assessment_import" ON "personality_assessments" ("import_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personality_people_site" ON "personality_people" ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personality_people_import" ON "personality_people" ("site_id","import_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personality_rate_limit_expiry" ON "personality_rate_limits" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personality_sessions_expiry" ON "personality_sessions" ("expires_at");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personality_people" ADD CONSTRAINT "personality_people_group" CHECK (group_name in ('You','Friends','Family'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personality_assessments" ADD CONSTRAINT "personality_assessment_scale" CHECK (score_max in (100,120));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personality_assessments" ADD CONSTRAINT "personality_assessment_kind" CHECK (score_kind in ('raw','percentile','percentage'));
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personality_assessments" ADD CONSTRAINT "personality_assessment_scores_object" CHECK (jsonb_typeof(scores) = 'object');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personality_assessments" ADD CONSTRAINT "personality_assessment_facets_array" CHECK (facet_scores is null or jsonb_typeof(facet_scores) = 'array');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
