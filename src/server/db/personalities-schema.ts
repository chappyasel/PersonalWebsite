import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { Facet, Scores } from "~/lib/personalities/data";
import type { SharedSnapshot } from "~/lib/personalities/sharing";

export const personalitySites = pgTable("personality_sites", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
});

export const personalityPeople = pgTable(
  "personality_people",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => personalitySites.id),
    name: text("name").notNull(),
    groupName: text("group_name").notNull(),
    createdAt: text("created_at").notNull(),
    importKey: text("import_key"),
  },
  (p) => ({
    site: index("personality_people_site").on(p.siteId),
    imported: uniqueIndex("personality_people_import").on(
      p.siteId,
      p.importKey,
    ),
    group: check(
      "personality_people_group",
      sql`${p.groupName} in ('You','Friends','Family')`,
    ),
  }),
);

export const personalityAssessments = pgTable(
  "personality_assessments",
  {
    id: text("id").primaryKey(),
    personId: text("person_id")
      .notNull()
      .references(() => personalityPeople.id, { onDelete: "cascade" }),
    // Text preserves month-only dates and unknown dates without inventing a day.
    takenOn: text("taken_on"),
    dateEstimated: boolean("date_estimated").notNull().default(false),
    addedAt: text("added_at").notNull(),
    source: text("source").notNull(),
    externalResultId: text("external_result_id"),
    sourceReference: text("source_reference"),
    testVersion: text("test_version").notNull(),
    scoreKind: text("score_kind").notNull(),
    scoreMax: integer("score_max").notNull(),
    scores: jsonb("scores").$type<Scores>().notNull(),
    facetScores: jsonb("facet_scores").$type<Facet[]>(),
    notes: text("notes").notNull().default(""),
    importKey: text("import_key"),
  },
  (a) => ({
    date: index("personality_assessments_person_date").on(
      a.personId,
      a.takenOn,
    ),
    external: uniqueIndex("personality_assessment_external").on(
      a.source,
      a.externalResultId,
    ),
    imported: uniqueIndex("personality_assessment_import").on(a.importKey),
    scale: check(
      "personality_assessment_scale",
      sql`${a.scoreMax} in (100,120)`,
    ),
    kind: check(
      "personality_assessment_kind",
      sql`${a.scoreKind} in ('raw','percentile','percentage')`,
    ),
    scoresObject: check(
      "personality_assessment_scores_object",
      sql`jsonb_typeof(${a.scores}) = 'object'`,
    ),
    facetsArray: check(
      "personality_assessment_facets_array",
      sql`${a.facetScores} is null or jsonb_typeof(${a.facetScores}) = 'array'`,
    ),
  }),
);

export const personalitySessions = pgTable(
  "personality_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => personalitySites.id),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    passwordVersion: text("password_version").notNull(),
  },
  (s) => ({ expiry: index("personality_sessions_expiry").on(s.expiresAt) }),
);

export const personalityRateLimits = pgTable(
  "personality_rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  (r) => ({ expiry: index("personality_rate_limit_expiry").on(r.expiresAt) }),
);

export const personalityShares = pgTable(
  "personality_shares",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id")
      .notNull()
      .references(() => personalitySites.id),
    tokenHash: text("token_hash").notNull(),
    snapshot: jsonb("snapshot").$type<SharedSnapshot>().notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }),
  },
  (s) => ({
    site: index("personality_shares_site").on(s.siteId),
    token: uniqueIndex("personality_shares_token_hash_key").on(s.tokenHash),
    snapshotObject: check(
      "personality_shares_snapshot_object",
      sql`jsonb_typeof(${s.snapshot}) = 'object'`,
    ),
  }),
);
