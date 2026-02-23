CREATE TABLE IF NOT EXISTS "wl_exercise_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(255) NOT NULL,
	"style" varchar(255) NOT NULL,
	"iterations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"favorite" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wl_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"workout_id" integer NOT NULL,
	"exercise_order" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"category" varchar(255) NOT NULL,
	"style" varchar(255) NOT NULL,
	"iteration" varchar(255)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wl_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"exercise_id" integer NOT NULL,
	"set_order" integer NOT NULL,
	"reps" integer,
	"weight" double precision,
	"volume" double precision,
	"one_rm" double precision,
	"duration_seconds" double precision,
	"distance" double precision,
	"calories" double precision,
	"custom" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wl_sync_metadata" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_started_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"sync_completed_at" timestamp with time zone,
	"status" varchar(50) NOT NULL,
	"file_hash" varchar(64),
	"total_workouts" integer,
	"total_exercises" integer,
	"total_sets" integer,
	"total_exercise_types" integer,
	"errors" text,
	"triggered_by" varchar(50) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wl_workouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"date_modified" boolean DEFAULT false NOT NULL,
	"duration_seconds" integer NOT NULL,
	"supersets" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wl_exercises" ADD CONSTRAINT "wl_exercises_workout_id_wl_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."wl_workouts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wl_sets" ADD CONSTRAINT "wl_sets_exercise_id_wl_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."wl_exercises"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wl_exercise_type_name_idx" ON "wl_exercise_types" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wl_exercise_type_category_idx" ON "wl_exercise_types" ("category");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wl_exercise_workout_order_idx" ON "wl_exercises" ("workout_id","exercise_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wl_exercise_workout_id_idx" ON "wl_exercises" ("workout_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wl_exercise_name_idx" ON "wl_exercises" ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wl_set_exercise_id_idx" ON "wl_sets" ("exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wl_workout_uuid_idx" ON "wl_workouts" ("uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wl_workout_date_idx" ON "wl_workouts" ("date");