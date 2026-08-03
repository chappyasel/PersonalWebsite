# YouTube positivity scoring

> Historical research note. The implemented product decisions supersede its
> proposed 0–1 scale, five-level UI, prose rationales, and 300-video workflow.
> See `src/lib/youtube/CONTEXT.md` and `docs/youtube-scoring-rollout.md` for the
> current 0–10 system and 200-video calibration flow.

Date: 2026-07-30

## Recommendation

Add a nullable, independently versioned **positivity score** for each unique
video. It should measure the likely emotional character of the content consumed,
not its educational quality, factuality, importance, or topical interest.

The headline score should run from `0.0` (strongly negative/pessimistic) through
`0.5` (neutral or balanced) to `1.0` (strongly positive/optimistic). Underneath
it, preserve four components:

- positive affect load;
- negative affect load;
- optimism/outlook;
- arousal/intensity (diagnostic only, not part of the headline score).

This is intentionally independent of the existing quality score. An upbeat
Minecraft build, playful comedy video, or relaxing gaming stream can have
`quality = 0.0` and high positivity. A valuable technical or investigative video
can have high quality and low positivity.

Ship this first as a **content-diet exposure and selection measure**. It does not
measure Chappy's actual mood, does not diagnose mental health, and cannot show
that a video caused a later mood. Actual mood requires a separate self-report
signal.

## Why this construct

James Russell's circumplex model represents affect using pleasure/displeasure
(valence) and arousal dimensions. It distinguishes, for example, calm
contentment from high-arousal excitement even though both are pleasant
([Russell, 1980](https://pdodds.w3.uvm.edu/research/papers/others/1980/russell1980a.pdf)).
The PANAS work also found positive and negative affect to be largely independent,
which means a video can be strongly positive and strongly negative at once
([Watson, Clark, and Tellegen, 1988](https://scienceofbehaviorchange.org/wp-content/uploads/2017/10/PANAS.Watson.1988.pdf)).
That is why the system should not store only one bipolar model judgment:
bittersweet or cathartic content should remain distinguishable from neutral
content.

Optimism is related but different. Scheier and Carver defined dispositional
optimism in terms of generalized outcome expectancies
([Scheier and Carver, 1985](https://doi.org/10.1037/0278-6133.4.3.219)).
For a video, the useful adaptation is not a personality judgment about the
creator. It is the video's **outlook**: whether the presented future or resolution
feels hopeful, improvable, agentic, uncertain, deteriorating, or hopeless.

The annotation perspective must also be explicit. Emotion labels can describe
the writer/creator, the text/content, or the reader/viewer, and annotation quality
changes with that choice
([Buechel and Hahn, 2017](https://aclanthology.org/W17-0801/)). For this product,
the target is:

> The affective exposure a viewer is likely to receive during the video,
> considering what is depicted and how it is framed, not merely the emotion
> explicitly stated by the speaker.

That handles cases conventional opinion sentiment misses. A deadpan news report
about a disaster can be negative exposure despite neutral delivery. A Minecraft
video may contain no positive opinion sentence yet still be playful, comforting,
and positive. Film clips have been experimentally shown to elicit distinct
emotional responses, supporting the premise that audiovisual content can affect
viewers, while also showing why the response cannot be inferred perfectly from
text metadata alone
([Gross and Levenson, 1995](https://bpl.berkeley.edu/docs/48-Emotion%20Elicitation95.pdf)).

## Scoring rubric

The model should rate each component on five anchored levels and the application
should normalize them to `0`, `0.25`, `0.5`, `0.75`, or `1`. Discrete anchored
judgments are easier to label and evaluate consistently than invented
hundredths. The application, not the model, computes the headline score.

### Positive affect load

| Value  | Anchor                                                                                    |
| ------ | ----------------------------------------------------------------------------------------- |
| `0.00` | No meaningful warmth, joy, amusement, hope, affection, serenity, or satisfying resolution |
| `0.25` | Occasional or weak positive moments                                                       |
| `0.50` | Sustained mild pleasantness, playfulness, calm, curiosity, or constructive energy         |
| `0.75` | Predominantly warm, funny, uplifting, celebratory, soothing, or inspiring                 |
| `1.00` | Intense and sustained joy, delight, love, triumph, wonder, or comfort                     |

### Negative affect load

| Value  | Anchor                                                                        |
| ------ | ----------------------------------------------------------------------------- |
| `0.00` | No meaningful anger, fear, sadness, disgust, humiliation, dread, or cynicism  |
| `0.25` | Occasional or weak negative moments                                           |
| `0.50` | Sustained mild tension, concern, conflict, sadness, or irritation             |
| `0.75` | Predominantly distressing, angry, frightening, bleak, cynical, or grief-heavy |
| `1.00` | Intense and sustained rage, terror, despair, cruelty, humiliation, or doom    |

Positive and negative load are not required to sum to one. Both can be high in a
bittersweet, cathartic, or darkly funny video; both can be low in a neutral
tutorial.

### Optimism/outlook

| Value  | Anchor                                                                                |
| ------ | ------------------------------------------------------------------------------------- |
| `0.00` | Hopeless, nihilistic, inevitable catastrophe or decline, no credible agency           |
| `0.25` | Mostly pessimistic; loss or deterioration dominates and remains unresolved            |
| `0.50` | No meaningful future framing, genuinely mixed, descriptive, or uncertain              |
| `0.75` | Constructive and solution-oriented; improvement or agency is credible                 |
| `1.00` | Strong, credible hope, progress, recovery, successful resolution, or empowered action |

Optimism is about framing and expected outcomes, not whether the claims are
objectively likely. Store it separately so a hopeful treatment of a painful
subject is not flattened into the same label as either pure doom or pure cheer.

### Arousal/intensity

| Value  | Anchor                                                       |
| ------ | ------------------------------------------------------------ |
| `0.00` | Very calm, sleepy, meditative, or emotionally flat           |
| `0.25` | Low activation                                               |
| `0.50` | Moderately engaging or activated                             |
| `0.75` | Highly energetic, tense, suspenseful, or emotionally charged |
| `1.00` | Extremely activating or overwhelming                         |

Arousal should be displayed as context but should not automatically make content
more positive or negative.

### Headline formula

For video `i`, let `p_i`, `n_i`, and `o_i` be the normalized positive load,
negative load, and optimism values.

```text
net_valence_i = clamp(0.5 + 0.5 × (p_i - n_i), 0, 1)
positivity_i  = 0.70 × net_valence_i + 0.30 × o_i
```

The `70/30` weighting is a product hypothesis, not a scientific constant.
Valence receives more weight because the requested behavior is to consume
content that feels positive even when it has little future-oriented narrative.
The weight should be changed only after comparison with Chappy's labels and,
later, optional mood check-ins.

Illustrative results:

| Video                                                | Quality | Positive | Negative | Optimism | Positivity |
| ---------------------------------------------------- | ------: | -------: | -------: | -------: | ---------: |
| Cheerful Minecraft build with friends                |  `0.00` |   `1.00` |   `0.00` |   `0.50` |     `0.85` |
| Calm, emotionally neutral programming tutorial       |  `0.90` |   `0.00` |   `0.00` |   `0.50` |     `0.50` |
| Grim investigation that ends with credible solutions |  `0.80` |   `0.25` |   `0.75` |   `0.75` |     `0.40` |
| Outrage/doom commentary with no agency               |  `0.10` |   `0.00` |   `1.00` |   `0.00` |     `0.00` |
| Bittersweet story with joy and grief                 |  `0.40` |   `1.00` |   `1.00` |   `0.75` |     `0.58` |

The UI can initially describe `0.00–0.24` as strongly negative,
`0.25–0.39` as negative, `0.40–0.60` as neutral/mixed, `0.61–0.75` as
positive, and `0.76–1.00` as strongly positive. These are display bands, not
clinical or scientific thresholds. In particular, do not add a purported
universal "3:1 positivity ratio": the mathematical basis of the widely cited
critical ratio was shown to be unfounded
([Brown, Sokal, and Friedman, 2013](https://physics.nyu.edu/sokal/BrownSokalFriedmanAPonlinefirst.pdf)).

## Inputs and evidence quality

The repository currently has 48,232 watch events representing 44,040 unique
videos, spanning 2016-01-07 through 2026-07-19. Every existing watch event has a
quality score. A read-only audit found 6,369 unique videos (14.5%) with no
channel name, 1,953 (4.4%) whose stored title is only a YouTube URL, and 9,958
(22.6%) marked as having captions. The current classifier sees only title,
channel, category/topics, and duration. The data also includes sarcasm and
clickbait. Those inputs are not enough to force a defensible positivity score
on every row.

Use these evidence tiers:

1. **Full content**: transcript plus title/description, with sampled audio/visual
   context if a compliant source is available. Highest potential confidence.
2. **Rich metadata**: title, description, thumbnail, channel, category/topics,
   tags, and duration. Suitable for an MVP, but still vulnerable to clickbait,
   irony, and emotional shifts within a video.
3. **Sparse metadata**: title and channel, or similarly thin evidence. Allow a
   score only for unambiguous cases and mark confidence low.
4. **Insufficient**: deleted/unavailable video, bare URL, missing or ambiguous
   title, or conflicting metadata. Store `NULL`, never `0.5`.

The official YouTube `videos.list` resource already makes description and
thumbnail fields available in `snippet`, so the existing enrichment call can
retain them without a new endpoint
([YouTube Videos resource](https://developers.google.com/youtube/v3/docs/videos)).
It also returns the canonical title and channel title, which can repair some
bare-URL titles and missing channels. The endpoint accepts up to 50 IDs and
costs one quota unit per call
([YouTube videos.list](https://developers.google.com/youtube/v3/docs/videos/list)).
The full historical refresh is therefore at most 881 calls, before accounting
for unavailable videos, against the documented default daily allocation of
10,000 units
([YouTube Data API overview](https://developers.google.com/youtube/v3/getting-started)).
This must be an explicit forced backfill: the current sync treats a cached
`category_id` as proof that metadata is complete, so merely adding columns would
not re-fetch the 44,040 existing videos.
However, the official caption download endpoint requires the caller to have
permission to edit the video, so it cannot generally retrieve transcripts for
third-party videos Chappy watched
([YouTube captions.download](https://developers.google.com/youtube/v3/docs/captions/download)).
Do not design the first release around unavailable caption access or an
unofficial scraping dependency.

Research on YouTube multimodal sentiment explicitly models language, visual
expression, and acoustic/paralinguistic signals as interacting modalities
([Zadeh et al., 2018](https://aclanthology.org/P18-1208/)). Consequently,
metadata-only confidence must stay modest. If a lawful transcript or
multimodal source becomes available later, treat it as a new evidence tier and
prompt version, then re-run the held-out evaluation.

## Model and prompt design

Use a separate classifier script and separate prompt provenance from quality.
Channel identity may be weak context, but it must not be the "strongest signal":
channels vary, titles can be sarcastic, and the goal is the individual video's
affective exposure.

The installed `ai` package is 6.x. `generateObject` is deprecated in AI SDK 6;
new work should use `generateText` with `Output.object` or `Output.array`
([AI SDK 6 migration guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-6-0)).
Use a keyed object per video rather than a bare positional score array. OpenAI
Structured Outputs enforce a supplied JSON Schema, but semantic correctness
still requires evaluation
([OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)).

Recommended system prompt:

```text
You score the affective character of YouTube content for a personal
information-diet tracker.

Target: the emotional exposure a viewer is likely to receive during most of
the video, considering what is depicted and how it is framed.

Do NOT judge educational quality, productivity, factual accuracy, moral worth,
importance, or whether the topic is "good for" the viewer. An upbeat Minecraft,
gaming, comedy, or relaxation video can be highly positive. A useful technical,
news, or documentary video can be neutral or negative.

Rate four independent 0–4 anchored dimensions:

positiveLoad:
0 none; 1 weak/occasional; 2 sustained mild pleasantness; 3 predominantly
warm/funny/uplifting/soothing; 4 intense sustained joy/delight/love/triumph.

negativeLoad:
0 none; 1 weak/occasional; 2 sustained mild tension/sadness/conflict; 3
predominantly distressing/angry/frightening/bleak; 4 intense sustained
rage/terror/despair/cruelty/doom.

optimism:
0 hopeless/nihilistic/no agency; 1 mostly pessimistic/unresolved decline; 2 no
future framing, mixed, or uncertain; 3 constructive with credible agency; 4
strong credible hope/progress/recovery/resolution.

arousal:
0 very calm/flat; 1 low activation; 2 moderate; 3 high; 4 extreme.

Positive and negative load may both be high. Neutral reporting of distressing
events can still be negative exposure. Do not infer a positive tone solely
from words like "best" or "amazing" in a clickbait title. Treat the channel as
weak context, not a verdict.

Set evidenceSufficiency to "insufficient" when the supplied metadata cannot
support the ratings. Do not use neutral ratings as a substitute for missing
evidence. confidence is confidence in the content rating given the evidence,
not confidence that the video will change this specific viewer's mood.

Return one object for every input video, keyed by videoId.
```

Recommended output element:

```ts
z.object({
  videoId: z.string(),
  positiveLoad: z.number().int().min(0).max(4),
  negativeLoad: z.number().int().min(0).max(4),
  optimism: z.number().int().min(0).max(4),
  arousal: z.number().int().min(0).max(4),
  dominantTone: z.enum([
    "positive",
    "negative",
    "mixed",
    "neutral",
    "uncertain",
  ]),
  evidenceSufficiency: z.enum(["rich", "sparse", "insufficient"]),
  confidence: z.number().int().min(0).max(4),
  rationale: z.string(),
});
```

Normalize component integers by dividing by four. Compute `positivity` in
application code only when `evidenceSufficiency !== "insufficient"`. Initially,
also require `confidence >= 2`; calibrate that cutoff against the labeled set.
A model's self-reported confidence is not a probability. Preserve it for
sorting and review, then replace its interpretation with observed accuracy in
each confidence/evidence bucket.

Include a short rationale grounded in supplied evidence for audit and labeling.
Cap its stored length. Pin and store the exact model ID and prompt version.
Changing a model, prompt, input tier, formula weight, or rubric requires an
eval. Version prompt, formula, and evidence inputs independently; do not use a
prompt-version bump to hide a formula-only change, and do not silently rewrite
historical scores.

Description is useful text evidence. A thumbnail is useful only if it is
actually supplied to a multimodal model; otherwise retain it for the review UI
and do not let its mere presence raise the evidence tier.

## Database design

Add metadata that the existing API already returns:

```text
description                  text
thumbnail_url                text
```

Add independent positivity fields to `yt_watch_history`:

```text
llm_positive_affect          double precision NULL  -- 0..1
llm_negative_affect          double precision NULL  -- 0..1
llm_optimism_score           double precision NULL  -- 0..1
llm_arousal_score            double precision NULL  -- 0..1
llm_positivity_score         double precision NULL  -- derived 0..1
llm_positivity_label         varchar(16) NULL
llm_positivity_confidence    double precision NULL  -- model 0..1, later calibrated
llm_positivity_evidence      varchar(16) NULL        -- rich/sparse/insufficient
llm_positivity_reason        varchar(512) NULL
llm_positivity_model         varchar(64) NULL
llm_positivity_prompt_version varchar(16) NULL
llm_positivity_formula_version varchar(16) NULL
llm_positivity_input_version varchar(16) NULL
llm_positivity_scored_at     timestamptz NULL
```

Do not reuse `llm_model` or `llm_prompt_version`; those currently describe the
quality score and would make the two classifiers' provenance ambiguous.
Although the current table repeats video-level metadata on watch events, follow
that convention for this increment. A later normalization into a `yt_videos`
table is a separate design decision.

As with quality, classify a unique video once and update all watch-event rows
with that `video_id`. During Takeout refresh, cache and preserve every positivity
field before upsert. Deleted or unavailable videos remain nullable.

## Aggregation over time

Let `s_i` be a non-null positivity score and `w_i` be estimated exposure seconds
for watch event `i`.

The current dashboard estimates exposure as:

```text
w_i = duration_seconds_i / 2.2
```

and caps source duration at 90 minutes. For a weighted average, the constant
playback-speed factor cancels, but retaining it keeps positive/negative
equivalent-hour calculations aligned with the existing watch-time UI.

For period `T`, with `S_T` the events that have an accepted score:

```text
positivity_T =
  Σ(i in S_T) w_i × s_i
  ---------------------
      Σ(i in S_T) w_i

duration_coverage_T =
  Σ(i in S_T) w_i
  ---------------------
  Σ(i in T with duration) w_i

event_coverage_T =
  count(S_T)
  ----------
  count(events in T)
```

Also compute:

```text
positive_equivalent_hours_T = Σ w_i × positive_affect_i / 3600
negative_equivalent_hours_T = Σ w_i × negative_affect_i / 3600

effective_sample_size_T = (Σ w_i)^2 / Σ(w_i^2)
```

Never turn unscored videos into `0.5`, and do not weight score by model
confidence: either include a score under the validated acceptance rule or
exclude it and show coverage. Otherwise low-confidence rows can silently bias
the trend. Mark periods with low coverage or effective sample size as
provisional.

Use the same 4 a.m. Pacific watch-day boundary and day/week/month/quarter
buckets as the existing dashboard. Compute a trailing 7- or 30-day score from
all events in the window; do not average daily averages, which would give a
five-minute day the same weight as a five-hour day. Mirror the existing
"current 30 days versus prior 30 days" comparison.

This remains estimated exposure, not actual viewing duration. Takeout records a
watch event but the repository substitutes full video duration (with a global
playback speed and cap); it cannot know whether a video was abandoned after 20
seconds. Label charts accordingly.

## Dashboard proposal

1. Add a **Positivity** card: duration-weighted score for the last 30 days,
   change versus the preceding 30 days, and duration coverage.
2. Add a positivity line or chart toggle to the existing time-series view. Keep
   no-watch periods null, as quality already does.
3. Add a diverging **emotional exposure** chart with positive-equivalent hours
   above zero and negative-equivalent hours below zero. This reveals a
   high-intensity mixed week that a net score alone would hide.
4. Add a **Quality × Positivity** quadrant view for channels and optionally
   videos. The desired product distinction becomes visible: Minecraft can sit
   in low-quality/high-positivity, while a grim investigation can sit in
   high-quality/low-positivity.
5. Add a review table for lowest/highest or least-confident videos, showing
   title, channel, components, score, evidence tier, rationale, and a manual
   correction control. Corrections become future eval data.
6. Show coverage in every aggregate tooltip. Do not render missing scores as
   neutral-colored data points without an explicit "unscored" state.

An optional later panel can plot self-reported mood against recent exposure, but
it must be visually and verbally separate from the content score.

## Validation and rollout

OpenAI's evaluation guidance recommends task-specific production data,
human-calibrated scoring, explicit criteria, and continuous evaluation
([OpenAI evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)).
Apply that here before backfilling ten years of history.

### Golden set

Create an initial set of 300 unique videos:

- 100 duration-weighted random videos from the history;
- 50 gaming/Minecraft/comedy/ambient videos, specifically testing separation
  from quality;
- 50 news, drama, outrage, true-crime, or crisis videos;
- 50 technical/educational videos across positive, neutral, and negative tone;
- 50 ambiguous, clickbait, sarcastic, mixed, missing-channel, and bare-URL cases.

Chappy should label the set with the same four anchored components after
reviewing enough actual content to judge it, not from memory or titles alone.
A second reviewer should independently label at least 75 overlapping videos to
detect rubric ambiguity. Adjudicate disagreements before treating labels as
gold.

Keep a frozen 20% holdout. Tune prompts and the 70/30 formula only on the
remainder. Measure component weighted kappa, headline mean absolute error,
within-one-step agreement, pairwise ranking, insufficient-evidence precision,
and error by evidence/confidence tier.

### Initial release gates

- 100% valid schema and `videoId` alignment; no positional-array matching.
- At least 90% of component ratings within one `0.25` rubric step of the
  adjudicated label.
- Headline score mean absolute error at or below `0.12` on the frozen holdout.
- Weighted kappa at or above `0.65` for positive load, negative load, and
  optimism.
- Among accepted high-confidence scores, fewer than 5% differ by more than
  `0.25` from the gold score.
- At least 95% correct ordering on a contrast set where a clearly upbeat
  entertainment/Minecraft video should outrank a dour but educational video.
- At least 80% duration coverage in the most recent 30 days before treating the
  headline trend as representative. Below that, the dashboard may ship only
  with a prominent provisional/coverage state.
- A model or prompt upgrade must pass the same holdout before replacing the
  displayed series.

These gates are engineering starting points, not published psychometric norms.
Adjust them from observed labeling difficulty, but record any change.

### Rollout

1. Freeze the rubric and label the golden set.
2. Retain canonical title, channel title, description, and thumbnail during
   YouTube metadata enrichment, then force a one-time metadata backfill for
   cached historical videos.
3. Run the positivity classifier in shadow mode on the golden set and recent
   90 days.
4. Inspect failures, especially false positivity from clickbait, neutral
   defaults for missing data, sarcasm, grim topics with hopeful resolutions,
   and quality leakage.
5. When gates pass, backfill unique videos and expose the score with coverage.
6. Collect manual corrections and re-run the holdout on every prompt/model
   version.
7. Only then consider a compliant transcript/multimodal source or a
   self-reported mood feature.

## Exact repository touchpoints for implementation

No application code was changed as part of this research. A subsequent
implementation should touch:

- `src/server/db/schema.ts`: add metadata and independent positivity columns.
- `src/server/db/migrations/0011_*.sql` and migration metadata: apply the schema.
- `src/lib/youtube/sync.ts`: retain description/thumbnail, cache all positivity
  fields, and preserve them during watch-history upsert.
- `scripts/classify-youtube-positivity.ts` (new): keyed, nullable classifier
  using `generateText` plus `Output.array`; keep
  `scripts/classify-youtube.ts` focused on quality.
- `scripts/takeout/refresh.ts`: run the positivity classifier after sync without
  coupling its provenance to quality.
- `src/lib/youtube/positivity.ts` (new): normalization, deterministic headline
  formula, bands, and reusable aggregation helpers.
- `src/lib/youtube/positivity.test.ts` (new): formula, null/coverage, weighting,
  and fixture tests.
- `src/server/api/routers/youtube.ts`: add 30-day summary, time series,
  equivalent exposure, channel/video quadrant, coverage, and review queries.
- `src/app/youtube/components/StatsCards.tsx`: add or swap in the Positivity
  summary card.
- `src/app/youtube/components/WatchTimeChart.tsx`: add the positivity
  line/toggle and coverage tooltip.
- `src/app/youtube/components/PositivityExposureChart.tsx` (new): positive and
  negative equivalent hours.
- `src/app/youtube/components/QualityPositivityMatrix.tsx` (new): preserve the
  two-dimensional distinction.
- `src/app/youtube/components/PositivityReviewTable.tsx` (new): audit,
  insufficient, and manual-correction workflow.

## Limitations

- The score describes content exposure, not experienced emotion. Personal taste,
  familiarity, social context, baseline mood, and whether the video was
  background noise can reverse the response.
- Watch selection is endogenous: a bad mood may lead to doomscrolling, rather
  than doomscrolling causing the bad mood. An observational timeline cannot
  establish direction or causality.
- Metadata-only classification misses sarcasm, editing, music, visuals,
  speaker tone, narrative turns, and the portion actually watched.
- Creator and topic priors can encode cultural or stylistic bias. A channel
  should never determine a score without video-level evidence.
- Positive is not synonymous with healthy, true, safe, or worthwhile. Toxic
  triumphalism and misinformation can sound upbeat; difficult negative material
  can be valuable. Keep quality, positivity, and any future safety/factuality
  dimensions separate.
- Maximizing positivity is not automatically desirable. The dashboard should
  support awareness and intentional selection, not prescribe avoidance of all
  sadness, conflict, or serious news.

If the actual goal evolves from "what emotional content did I select?" to "what
improves my mood?", add a lightweight before/after viewing or daily mood
check-in. Then evaluate within-person association while controlling at least for
baseline mood, time of day, total exposure, and day of week. Even that remains
observational unless the viewing intervention is randomized.
