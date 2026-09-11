CREATE TABLE `assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`taken_on` text,
	`added_at` text NOT NULL,
	`source` text NOT NULL,
	`external_result_id` text,
	`source_reference` text,
	`test_version` text NOT NULL,
	`score_kind` text NOT NULL,
	`score_max` integer NOT NULL,
	`scores` text NOT NULL,
	`facet_scores` text,
	`notes` text DEFAULT '' NOT NULL,
	`import_key` text,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "assessment_json" CHECK(json_valid("assessments"."scores")),
	CONSTRAINT "assessment_scale" CHECK("assessments"."score_max" in (100,120))
);
--> statement-breakpoint
CREATE INDEX `assessments_person_date` ON `assessments` (`person_id`,`taken_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_external_result` ON `assessments` (`source`,`external_result_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_import` ON `assessments` (`import_key`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`group_name` text NOT NULL,
	`created_at` text NOT NULL,
	`import_key` text,
	FOREIGN KEY (`site_id`) REFERENCES `private_sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `people_site` ON `people` (`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `people_import` ON `people` (`site_id`,`import_key`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limit_expiry` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`password_version` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `private_sites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `private_sites` (
	`id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
