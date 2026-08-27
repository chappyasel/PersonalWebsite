# Weightlifting Context

Presents Chappy's complete training log — every workout and set since 2017,
recorded in the iOS app he built — as a public, explorable record. The iOS
app (WeightliftingApp / BenchTracker) is the source of truth for both the
data and the presentation idioms; where the site shows the same concept as
the app, it follows the app's formatting and layout exactly.

## Glossary

- **Workout** — one gym session: a named, dated, timed list of exercises.
  Default names come from time of day ("Morning Workout", "Mid-Day
  Workout", "Afternoon Workout").
- **Exercise** — one movement performed within one workout, carrying a
  category (Chest, Back, Legs, …), a style (how its sets are measured), and
  its sets. The same movement appearing in many workouts is many exercise
  rows.
- **Exercise type** — the movement itself across all time, identified by
  its display name. What an exercise page is about.
- **Iteration** (user-facing: **Variation**) — a prefix that specializes a
  base exercise name: "Incline" + "Barbell Bench Press" → "Incline Barbell
  Bench Press". Exercise types sharing a base name are variations of one
  another.
- **Display name** — iteration + base name when an iteration exists,
  otherwise the base name. The canonical identity of an exercise type
  everywhere on the site.
- **Instance** — one exercise type performed in one workout: the unit of
  the exercise page's list, graphs, and podium.
- **Set** — one entry within an exercise: reps × weight for lifts; other
  styles measure duration, distance, or calories.
- **Style** — how a set is measured (`reps_weight`, `reps`,
  `duration_secs`, …). Determines the set's display format. Only
  `reps_weight` sets carry a 1RMe.
- **1RMe** (est. 1RM) — estimated one-rep max computed by the app (Wathan
  formula; Epley at 18+ reps) and synced precomputed. Chappy's term is
  "1RMe"; the site never computes it.
- **Superset** — consecutive exercises in a workout performed as one
  alternating block. Displayed as a single grouped card.
- **Workout preview** — the modal presentation of one workout (name, date,
  stats row, exercise cards). Opens from a calendar day or an exercise
  page's instance row.
- **Featured lifts** — the curated exercise types (default 13) whose summed
  1RMe drives the dashboard's aggregate progression chart and its
  asymptotic fit.
- **Chart-selectable exercise** — an exercise type eligible for the
  dashboard picker and for its own page: measured reps × weight, with at
  least 10 sets carrying a 1RMe.
- **Category** — the app's muscle-group taxonomy (Abs / Core, Back,
  Biceps, Cardio, Chest, Legs, Olympic, Shoulders, Triceps, Other), each
  with a fixed color used everywhere both app and site color exercises.
