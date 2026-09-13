CREATE TABLE IF NOT EXISTS "personality_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"site_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint,
	CONSTRAINT "personality_shares_snapshot_object" CHECK (jsonb_typeof("snapshot") = 'object')
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personality_shares" ADD CONSTRAINT "personality_shares_site_id_personality_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."personality_sites"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personality_shares_site" ON "personality_shares" ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "personality_shares_token_hash_key" ON "personality_shares" ("token_hash");
