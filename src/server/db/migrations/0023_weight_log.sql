CREATE TABLE IF NOT EXISTS "weight_log_body_fat_recollections" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"body_fat_low" double precision NOT NULL,
	"body_fat_high" double precision NOT NULL,
	"note" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weight_log_phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" varchar(16) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weight_log_planned_weeks" (
	"week_start" date PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"target" double precision,
	"original_target" double precision
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weight_log_scans" (
	"date" date PRIMARY KEY NOT NULL,
	"weight" double precision NOT NULL,
	"lean_mass" double precision,
	"fat_mass" double precision,
	"bone_mineral_content" double precision,
	"body_fat_percent" double precision,
	"arms_fat" double precision,
	"arms_lean" double precision,
	"arms_bone_mineral_content" double precision,
	"legs_fat" double precision,
	"legs_lean" double precision,
	"legs_bone_mineral_content" double precision,
	"trunk_fat" double precision,
	"trunk_lean" double precision,
	"trunk_bone_mineral_content" double precision,
	"android_fat" double precision,
	"android_lean" double precision,
	"android_bone_mineral_content" double precision,
	"gynoid_fat" double precision,
	"gynoid_lean" double precision,
	"gynoid_bone_mineral_content" double precision,
	"bone_mineral_density" double precision,
	"t_score" double precision,
	"z_score" double precision,
	"android_gynoid_ratio" double precision,
	"visceral_fat" double precision,
	"conditions" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weight_log_set_points" (
	"position" integer PRIMARY KEY NOT NULL,
	"pounds" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weight_log_strength_history" (
	"date" date NOT NULL,
	"lift" varchar(100) NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "weight_log_strength_history_date_lift_pk" PRIMARY KEY("date","lift")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weight_log_weigh_ins" (
	"date" date PRIMARY KEY NOT NULL,
	"pounds" double precision NOT NULL,
	"excluded" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weight_log_planned_weeks" ADD CONSTRAINT "weight_log_planned_weeks_phase_id_weight_log_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."weight_log_phases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "weight_log_phase_start_idx" ON "weight_log_phases" ("start_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weight_log_planned_week_phase_idx" ON "weight_log_planned_weeks" ("phase_id");
--> statement-breakpoint
-- drizzle-kit 0.21 does not emit check() constraints; these mirror schema.ts.
ALTER TABLE "weight_log_weigh_ins" ADD CONSTRAINT "weight_log_weigh_ins_pounds_check" CHECK ("pounds" > 0 AND "pounds" <= 1500);
--> statement-breakpoint
ALTER TABLE "weight_log_phases" ADD CONSTRAINT "weight_log_phases_kind_check" CHECK ("kind" IN ('bulk', 'cut', 'maintenance'));
--> statement-breakpoint
ALTER TABLE "weight_log_phases" ADD CONSTRAINT "weight_log_phases_weeks_check" CHECK (EXTRACT(ISODOW FROM "start_date") = 1 AND ("end_date" IS NULL OR ("end_date" > "start_date" AND EXTRACT(ISODOW FROM "end_date") = 7)));
--> statement-breakpoint
ALTER TABLE "weight_log_planned_weeks" ADD CONSTRAINT "weight_log_planned_weeks_monday_check" CHECK (EXTRACT(ISODOW FROM "week_start") = 1);
--> statement-breakpoint
ALTER TABLE "weight_log_body_fat_recollections" ADD CONSTRAINT "weight_log_body_fat_recollections_range_check" CHECK ("body_fat_low" >= 0 AND "body_fat_low" <= "body_fat_high" AND "body_fat_high" <= 100);