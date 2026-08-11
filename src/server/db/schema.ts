import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { type AdapterAccount } from "next-auth/adapters";

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 256 }),
    createdById: varchar("created_by", { length: 255 })
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (example) => ({
    createdByIdIdx: index("created_by_idx").on(example.createdById),
    nameIndex: index("name_idx").on(example.name),
  }),
);

export const users = pgTable("users", {
  id: varchar("id", { length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).notNull(),
  emailVerified: timestamp("email_verified", {
    mode: "date",
    withTimezone: true,
  }).default(sql`CURRENT_TIMESTAMP`),
  image: varchar("image", { length: 255 }),
});

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
}));

export const accounts = pgTable(
  "accounts",
  {
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id),
    type: varchar("type", { length: 255 })
      .$type<AdapterAccount["type"]>()
      .notNull(),
    provider: varchar("provider", { length: 255 }).notNull(),
    providerAccountId: varchar("provider_account_id", {
      length: 255,
    }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 255 }),
    scope: varchar("scope", { length: 255 }),
    id_token: text("id_token"),
    session_state: varchar("session_state", { length: 255 }),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    userIdIdx: index("account_user_id_idx").on(account.userId),
  }),
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: varchar("session_token", { length: 255 })
      .notNull()
      .primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => users.id),
    expires: timestamp("expires", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (session) => ({
    userIdIdx: index("session_user_id_idx").on(session.userId),
  }),
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: varchar("identifier", { length: 255 }).notNull(),
    token: varchar("token", { length: 255 }).notNull(),
    expires: timestamp("expires", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

export const books = pgTable(
  "books",
  {
    id: varchar("id", { length: 255 }).primaryKey(), // Human-readable slug
    notionId: varchar("notion_id", { length: 255 }).notNull(), // Original Notion page ID
    title: varchar("title", { length: 512 }).notNull(),
    author: varchar("author", { length: 512 }).notNull(),
    publicationYear: integer("publication_year"),
    started: timestamp("started", { mode: "date", withTimezone: true }),
    finished: timestamp("finished", { mode: "date", withTimezone: true }),
    rating: integer("rating"), // 1-5
    audioLengthMin: integer("audio_length_min"), // Raw Audible runtime in minutes
    pageCount: integer("page_count"),
    hasNotes: boolean("has_notes").default(false).notNull(),
    hasSummary: boolean("has_summary").default(false).notNull(),
    isAutomated: boolean("is_automated").default(false).notNull(),
    isFeatured: boolean("is_featured").default(false).notNull(),
    coverUrl: text("cover_url"),
    audibleUrl: text("audible_url"), // https://www.audible.com/pd/{asin}
    notionUrl: text("notion_url").notNull(),
    notes: text("notes"), // Full markdown content
    lastEditedTime: timestamp("last_edited_time", {
      withTimezone: true,
    }).notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date(),
    ),
  },
  (table) => ({
    notionIdIdx: uniqueIndex("book_notion_id_idx").on(table.notionId),
    finishedIdx: index("book_finished_idx").on(table.finished),
    ratingIdx: index("book_rating_idx").on(table.rating),
    lastEditedIdx: index("book_last_edited_idx").on(table.lastEditedTime),
    titleIdx: index("book_title_idx").on(table.title),
  }),
);

export const bookTags = pgTable(
  "book_tags",
  {
    id: serial("id").primaryKey(),
    bookId: varchar("book_id", { length: 255 })
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    tagName: varchar("tag_name", { length: 256 }).notNull(),
  },
  (table) => ({
    uniqueBookTag: uniqueIndex("unique_book_tag_idx").on(
      table.bookId,
      table.tagName,
    ),
    tagNameIdx: index("tag_name_idx").on(table.tagName),
    bookIdIdx: index("book_tag_book_id_idx").on(table.bookId),
  }),
);

export const syncMetadata = pgTable("sync_metadata", {
  id: serial("id").primaryKey(),
  syncStartedAt: timestamp("sync_started_at", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  syncCompletedAt: timestamp("sync_completed_at", { withTimezone: true }),
  status: varchar("status", { length: 50 }).notNull(), // 'in_progress' | 'success' | 'failed'
  totalBooksInNotion: integer("total_books_in_notion"),
  booksAdded: integer("books_added").default(0).notNull(),
  booksUpdated: integer("books_updated").default(0).notNull(),
  booksUnchanged: integer("books_unchanged").default(0).notNull(),
  booksDeleted: integer("books_deleted").default(0).notNull(),
  fullContentFetched: integer("full_content_fetched").default(0).notNull(),
  fullContentSkipped: integer("full_content_skipped").default(0).notNull(),
  errors: text("errors"), // JSON array
  errorCount: integer("error_count").default(0).notNull(),
  triggeredBy: varchar("triggered_by", { length: 50 }).notNull(), // 'cron' | 'manual'
});

export const booksRelations = relations(books, ({ many }) => ({
  tags: many(bookTags),
}));

export const bookTagsRelations = relations(bookTags, ({ one }) => ({
  book: one(books, { fields: [bookTags.bookId], references: [books.id] }),
}));

// ── Weightlifting tables ──────────────────────────────────────────────

export const wlExerciseTypes = pgTable(
  "wl_exercise_types",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 255 }).notNull(),
    style: varchar("style", { length: 255 }).notNull(),
    iterations: jsonb("iterations").$type<string[]>().default([]).notNull(),
    favorite: boolean("favorite").default(false).notNull(),
    hidden: boolean("hidden").default(false).notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex("wl_exercise_type_name_idx").on(table.name),
    categoryIdx: index("wl_exercise_type_category_idx").on(table.category),
  }),
);

export const wlWorkouts = pgTable(
  "wl_workouts",
  {
    id: serial("id").primaryKey(),
    uuid: varchar("uuid", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    date: timestamp("date", { withTimezone: true }).notNull(),
    dateModified: boolean("date_modified").default(false).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    supersets: text("supersets")
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
  },
  (table) => ({
    uuidIdx: uniqueIndex("wl_workout_uuid_idx").on(table.uuid),
    dateIdx: index("wl_workout_date_idx").on(table.date),
  }),
);

export const wlExercises = pgTable(
  "wl_exercises",
  {
    id: serial("id").primaryKey(),
    workoutId: integer("workout_id")
      .notNull()
      .references(() => wlWorkouts.id, { onDelete: "cascade" }),
    exerciseOrder: integer("exercise_order").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 255 }).notNull(),
    style: varchar("style", { length: 255 }).notNull(),
    iteration: varchar("iteration", { length: 255 }),
  },
  (table) => ({
    workoutOrderIdx: uniqueIndex("wl_exercise_workout_order_idx").on(
      table.workoutId,
      table.exerciseOrder,
    ),
    workoutIdIdx: index("wl_exercise_workout_id_idx").on(table.workoutId),
    nameIdx: index("wl_exercise_name_idx").on(table.name),
  }),
);

export const wlSets = pgTable(
  "wl_sets",
  {
    id: serial("id").primaryKey(),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => wlExercises.id, { onDelete: "cascade" }),
    setOrder: integer("set_order").notNull(),
    reps: integer("reps"),
    weight: doublePrecision("weight"),
    volume: doublePrecision("volume"),
    oneRM: doublePrecision("one_rm"),
    durationSeconds: doublePrecision("duration_seconds"),
    distance: doublePrecision("distance"),
    calories: doublePrecision("calories"),
    custom: text("custom"),
  },
  (table) => ({
    exerciseIdIdx: index("wl_set_exercise_id_idx").on(table.exerciseId),
  }),
);

export const wlSyncMetadata = pgTable("wl_sync_metadata", {
  id: serial("id").primaryKey(),
  syncStartedAt: timestamp("sync_started_at", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  syncCompletedAt: timestamp("sync_completed_at", { withTimezone: true }),
  status: varchar("status", { length: 50 }).notNull(),
  fileHash: varchar("file_hash", { length: 64 }),
  totalWorkouts: integer("total_workouts"),
  totalExercises: integer("total_exercises"),
  totalSets: integer("total_sets"),
  totalExerciseTypes: integer("total_exercise_types"),
  errors: text("errors"),
  triggeredBy: varchar("triggered_by", { length: 50 }).notNull(),
});

// ── Weightlifting relations ───────────────────────────────────────────

export const wlWorkoutsRelations = relations(wlWorkouts, ({ many }) => ({
  exercises: many(wlExercises),
}));

export const wlExercisesRelations = relations(wlExercises, ({ one, many }) => ({
  workout: one(wlWorkouts, {
    fields: [wlExercises.workoutId],
    references: [wlWorkouts.id],
  }),
  sets: many(wlSets),
}));

export const wlSetsRelations = relations(wlSets, ({ one }) => ({
  exercise: one(wlExercises, {
    fields: [wlSets.exerciseId],
    references: [wlExercises.id],
  }),
}));

// ── YouTube watch history tables ────────────────────────────────────

export const ytWatchHistory = pgTable(
  "yt_watch_history",
  {
    id: serial("id").primaryKey(),
    videoId: varchar("video_id", { length: 20 }).notNull(),
    title: varchar("title", { length: 1024 }),
    channelName: varchar("channel_name", { length: 512 }),
    channelUrl: text("channel_url"),
    watchedAt: timestamp("watched_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds"),
    // Video metadata from YouTube API
    categoryId: integer("category_id"),
    topicCategories: text("topic_categories"), // JSON array of Wikipedia URLs
    tags: text("tags"), // JSON array of creator-assigned tags
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    youtubeMetadataFetchedAt: timestamp("youtube_metadata_fetched_at", {
      withTimezone: true,
    }),
    viewCount: doublePrecision("view_count"),
    likeCount: doublePrecision("like_count"),
    hasCaptions: boolean("has_captions"),
    definition: varchar("definition", { length: 4 }), // "hd" or "sd"
    llmQualityScore: doublePrecision("llm_quality_score"), // 0.0-1.0 from LLM classification
    llmModel: varchar("llm_model", { length: 64 }), // e.g. "openai/gpt-5.4"
    llmPromptVersion: varchar("llm_prompt_version", { length: 16 }), // e.g. "v2"
  },
  (table) => ({
    videoIdIdx: index("yt_video_id_idx").on(table.videoId),
    watchedAtIdx: index("yt_watched_at_idx").on(table.watchedAt),
    channelNameIdx: index("yt_channel_name_idx").on(table.channelName),
    categoryIdx: index("yt_category_id_idx").on(table.categoryId),
    // Each (video_id, watched_at) is a single watch event — sync upserts on this.
    watchEventUq: uniqueIndex("yt_watch_event_uq").on(
      table.videoId,
      table.watchedAt,
    ),
  }),
);

export const ytSyncMetadata = pgTable("yt_sync_metadata", {
  id: serial("id").primaryKey(),
  syncStartedAt: timestamp("sync_started_at", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  syncCompletedAt: timestamp("sync_completed_at", { withTimezone: true }),
  status: varchar("status", { length: 50 }).notNull(),
  totalVideos: integer("total_videos"),
  enrichedVideos: integer("enriched_videos"),
  deletedVideos: integer("deleted_videos"),
  errors: text("errors"),
  triggeredBy: varchar("triggered_by", { length: 50 }).notNull(),
});

// ── Normalized YouTube information-diet entities ───────────────────

export const ytChannels = pgTable(
  "yt_channels",
  {
    id: serial("id").primaryKey(),
    youtubeChannelId: varchar("youtube_channel_id", { length: 32 }),
    name: varchar("name", { length: 512 }).notNull(),
    url: text("url"),
    thumbnailUrl: text("thumbnail_url"),
    metadataFetchedAt: timestamp("metadata_fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    youtubeIdUq: uniqueIndex("yt_channels_youtube_id_uq").on(
      table.youtubeChannelId,
    ),
    nameIdx: index("yt_channels_name_idx").on(table.name),
  }),
);

export const ytVideos = pgTable(
  "yt_videos",
  {
    videoId: varchar("video_id", { length: 20 }).primaryKey(),
    channelId: integer("channel_id").references(() => ytChannels.id),
    title: varchar("title", { length: 1024 }),
    description: text("description"),
    thumbnailUrl: text("thumbnail_url"),
    durationSeconds: integer("duration_seconds"),
    categoryId: integer("category_id"),
    topicCategories: text("topic_categories"),
    tags: text("tags"),
    viewCount: doublePrecision("view_count"),
    likeCount: doublePrecision("like_count"),
    hasCaptions: boolean("has_captions"),
    definition: varchar("definition", { length: 4 }),
    metadataFetchedAt: timestamp("metadata_fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    channelIdx: index("yt_videos_channel_idx").on(table.channelId),
  }),
);

export const ytWatchEvents = pgTable(
  "yt_watch_events",
  {
    id: serial("id").primaryKey(),
    videoId: varchar("video_id", { length: 20 })
      .notNull()
      .references(() => ytVideos.videoId),
    watchedAt: timestamp("watched_at", { withTimezone: true }).notNull(),
  },
  (table) => ({
    videoIdx: index("yt_watch_events_video_idx").on(table.videoId),
    watchedAtIdx: index("yt_watch_events_watched_at_idx").on(table.watchedAt),
    eventUq: uniqueIndex("yt_watch_events_event_uq").on(
      table.videoId,
      table.watchedAt,
    ),
  }),
);

export const ytClassifierRuns = pgTable(
  "yt_classifier_runs",
  {
    id: serial("id").primaryKey(),
    dimension: varchar("dimension", { length: 32 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    model: varchar("model", { length: 128 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 32 }).notNull(),
    formulaVersion: varchar("formula_version", { length: 32 }).notNull(),
    inputVersion: varchar("input_version", { length: 32 }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
  },
  (table) => ({
    dimensionStatusIdx: index("yt_classifier_runs_dimension_status_idx").on(
      table.dimension,
      table.status,
    ),
    dimensionCheck: check(
      "yt_classifier_runs_dimension_check",
      sql`${table.dimension} IN ('learning_value', 'positivity')`,
    ),
  }),
);

export const ytClassifications = pgTable(
  "yt_classifications",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => ytClassifierRuns.id),
    videoId: varchar("video_id", { length: 20 })
      .notNull()
      .references(() => ytVideos.videoId),
    status: varchar("status", { length: 16 }).notNull(),
    score: integer("score"),
    components: jsonb("components").$type<Record<string, number>>(),
    confidence: integer("confidence"),
    evidence: varchar("evidence", { length: 16 }),
    inputFingerprint: varchar("input_fingerprint", { length: 64 }),
    scoredAt: timestamp("scored_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    runVideoUq: uniqueIndex("yt_classifications_run_video_uq").on(
      table.runId,
      table.videoId,
    ),
    videoIdx: index("yt_classifications_video_idx").on(table.videoId),
    scoreCheck: check(
      "yt_classifications_score_check",
      sql`${table.score} IS NULL OR (${table.score} >= 0 AND ${table.score} <= 10)`,
    ),
  }),
);

export const ytManualOverrides = pgTable(
  "yt_manual_overrides",
  {
    id: serial("id").primaryKey(),
    videoId: varchar("video_id", { length: 20 })
      .notNull()
      .references(() => ytVideos.videoId),
    dimension: varchar("dimension", { length: 32 }).notNull(),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    videoDimensionUq: uniqueIndex("yt_manual_overrides_video_dimension_uq").on(
      table.videoId,
      table.dimension,
    ),
    dimensionCheck: check(
      "yt_manual_overrides_dimension_check",
      sql`${table.dimension} IN ('learning_value', 'positivity')`,
    ),
    scoreCheck: check(
      "yt_manual_overrides_score_check",
      sql`${table.score} >= 0 AND ${table.score} <= 10`,
    ),
  }),
);

export const ytCalibrationMembers = pgTable(
  "yt_calibration_members",
  {
    videoId: varchar("video_id", { length: 20 })
      .primaryKey()
      .references(() => ytVideos.videoId),
    position: integer("position").notNull(),
    selectedAt: timestamp("selected_at", { withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => ({
    positionUq: uniqueIndex("yt_calibration_members_position_uq").on(
      table.position,
    ),
  }),
);
