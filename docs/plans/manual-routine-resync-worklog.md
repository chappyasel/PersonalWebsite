# Manual + routine resync worklog

Date: 2026-09-04. Branch: `updates`. Trigger: the DTW26 day 10 edits to the
Personal Operating Manual and Core Daily Routine in Notion.

This is the review sheet for the change. Read the checklist for status, then
the sections below for every shortcut, judgement call, and open question.
Nothing is committed until we have gone through it together.

## Checklist

- [x] 1. Manual hero: new extraction (lead paragraph, TL;DR, intro, mission)
- [x] 2. Routine intro: keep every paragraph, keep the links
- [x] 3. Custom emoji: download from Notion and render inline (`:sunsama:`)
- [x] 4. Hard-coded facts: homepage card times, routine OG time, scene captions
- [x] 5. Delete the two orphaned manual images (7.2 MB)
- [x] 6. Cross-page links: Why We Sleep, Book Notes, notion.site slugs
- [x] 7. Regenerate the universal search index
- [x] Snapshot invariant tests so a hollow hero fails `pnpm verify` next time
- [x] `pnpm verify` green
- [x] `pnpm verify:artifacts` reported (one pre-existing failure, see below)
- [x] Worklog complete
- [x] Codex review: gate PASS, six advisory findings recorded below
- [ ] Review together, decide the `/systems` link and which Codex fixes to
      take, then commit

## What the change does

- `scripts/generate/manual.ts` reads the hero by position: every block before
  the first section is hero, every heading in it opens a panel, and the
  blocks under a heading belong to that panel. The site never names a panel.
- `scripts/generate/routine.ts` keeps every intro paragraph as rich text.
- `scripts/generate/notion-helpers.ts` gained custom emoji download and
  resolution, a self-link pattern that matches links typed into the page, a
  notion.site slug map, and two more page ids in the public URL map.
- `src/components/notion/RichTextRenderer.tsx` renders a run's `customEmoji`
  file instead of a hard-coded shortcode map.
- `ManualHero` renders lead plus panels; `RoutineHero` renders intro blocks.
- Homepage routine card, routine OG script, and two scene captions carry the
  new numbers. Two invariant tests pin the snapshots and those hand-copied
  facts.

## Judgement calls

1. **Hero is positional, not named.** Panel labels now come from Notion, so
   the 30-second panel reads "My 30-Second Self-Intro" (Notion's heading)
   instead of the hand-written "My 30-Second Introduction". The sky hero's
   hand-written tagline ("A guide to how I work, communicate, and
   collaborate") is replaced by Notion's lead paragraph, the same way the
   routine hero already showed Notion's intro. The OG subtitle and the layout
   metadata description still carry the old tagline; those are meta copy and
   I left them.
2. **Golden Rule panel deleted**, not left dormant. The source is gone.
3. **Generators refuse a hollow snapshot.** A hero with no panels at all, a
   page with no sections at all, or an empty timeline throws instead of
   writing. That is the exact failure this cycle produced silently. The gate
   is coarse: one panel that ends up empty is dropped without complaint, and
   a section whose blocks all fail to transform still ships with
   `blocks: []`. Codex finding 5 below; the tests can tighten this.
4. **Unresolvable self-links drop the link and keep the words**, with a
   warning. None fired this run: all nine TL;DR hooks landed on a section.
5. **notion.site rewriting is a slug allowlist.** `/manual` and `/routine`
   become chappyasel.com URLs. `/systems` stays as authored (see
   ambiguities).
6. **Custom emoji are generic.** One shared folder,
   `public/images/notion-emoji/`, named by Notion's emoji name. The app icon
   moved there with `git mv` (it is the same 644 KB file Notion serves), the
   weightlifting dashboard was repointed, and the hard-coded shortcode map is
   gone. Alt text is the humanized name ("Sunsama", "Weightlifting App").
7. **Manual/routine cross-links stay absolute chappyasel.com URLs**, the
   existing convention. The renderer treats them as external, so they open a
   new tab rather than the sheet. Unchanged.
8. **Scene captions: numbers only.** Beta alanine 10 g became 15 g, creatine
   "the same again" became "15 to 20 g more". The prose around them is his.
9. **Section and rant ids are pinned exactly** in the tests. A new Notion
   section needs an icon, an accent, and a homepage card entry, so it should
   fail the gate until someone decides those.
10. **Book Notes mention goes to the library root**, Why We Sleep to
    `/why-we-sleep`. I checked all 22 book slugs on both pages against the
    books table; all exist.
11. **Search index scope unchanged.** The manual hero and routine intro were
    never indexed. Still not. Flagged under next steps.

## Shortcuts

1. `transformRichText` records custom emoji in a module-level map. Two pages
   generated in one process would download each other's emoji. Harmless,
   since only runs that name an emoji get a `src`, and each generator is its
   own process today.
2. A `heading_1` inside a section body would leak `_raw_text`, `_children`
   into the JSON. Pre-existing, none exist, untouched.
3. **No browser check.** AGENTS.md forbids browser automation unless asked.
   The new hero and intro rendering is verified by types and by reusing the
   existing `NotionBlockRenderer` paths only. Worth opening together: the
   TL;DR list inside a panel, the five-sentence lead in the sky hero at
   34rem, and the italic-plus-bold mission.
4. The two data tests match component source text (`DailyRoutine.tsx`,
   `routine-og.ts`, `PersonalManual.tsx`) as strings, the same style as
   `ChromeLayer.diagnostics.test.ts`. Brittle to reformatting, cheap to fix.
5. The 644 KB app icon is served through next/image at 20px. Source size
   left alone.
6. `manual-og.png` was regenerated to prove it did not change rather than
   reasoning about it. Result recorded under verification.

## Issues found on the way

1. **Self-links typed into the page never matched.** The old pattern only
   fit @-mention hrefs (`app.notion.com/p/<id>#...`). Links typed as text
   carry the workspace and slug (`app.notion.com/p/chappyasel/<slug>-<id>#`).
   Every TL;DR hook would have sent visitors to Notion. Fixed by matching any
   Notion URL whose path ends in this page's id.
2. `routine.ts` had a dead `downloadImage` function and four unused imports.
   Removed.
3. The generator prints compact JSON size while the file on disk is
   pretty-printed. I misread "27.9 KB vs 65 KB" as content loss at first.
   Not a bug, just a misleading log line; left as is.
4. The card and the OG image drifted a full edit cycle without anyone
   noticing. The new tests make that a red gate.

## Ambiguities and owner calls

1. **`/systems` link.** The routine intro links Personal Systems to
   `chappyasel.notion.site/systems`. It returns 200, but Notion Sites return
   200 for unknown slugs too, and the Personal Systems page was empty as of
   yesterday. Options: keep it (current), strip the link until the page has
   content, or point it at a future `/systems` route.
2. **TL;DR targets land on section tops.** "The blind spots to watch for"
   lands on the top of Personality, not on My Blind Spots. Notion's own
   anchor for "I'm async-first" is inside How We Collaborate (the Meetings
   heading), not Communication. Precise landing needs ids on h3 headings and
   a finer anchor map.
3. **Pre-workout recipe wording.** "15-20g creatine, 15g beta alanine" per
   bottle or across both bottles? The caption keeps "each pre-workout
   bottle", as it did before.
4. **Two audit steps absent from the live page.** The 10-minute list left
   step 4 (reciprocal "shared context" bullet) and step 5a ("you don't need
   to package feedback perfectly") unchecked, and the page has neither.
   Deliberate?
5. **Late AM supplements** are flattened into the Morning stack on the cards.
6. **Hero label wording** is now Notion's. If "Self-Intro" reads wrong on the
   site, the fix is in Notion, not here.
7. **Should the TL;DR be searchable?** It is the most quotable text on the
   page and universal search does not see it.

## Notion-side fixes for Chappy

1. Communication callout: "(100+ of open lines." has no closing parenthesis.
2. 7:45am shower entry: "See" runs straight into the Book Notes mention, so
   the site renders "SeeBook Notes". Add a space before the mention.
3. Meetings, pre-reads: "A pre-read in advance before is a gift".

## Next steps

- Personal Systems → website once the Notion page has content. The manual
  generator's positional hero-plus-sections reader would likely fit it
  unchanged.
- "More quotes → website": quotes are three hard-coded blockquotes in
  `Quotes.tsx`. That is a code edit, not a sync.
- Index the manual hero and routine intro in universal search.
- Relative cross-links so manual and routine open each other in the sheet.
- h3 heading ids for precise TL;DR landing.
- Decide on the `/systems` link before this ships.

## Verification

- `pnpm verify`: pass. typegen, tsc, eslint, 338 test files / 2847 tests,
  search index fresh, meadow clear. The two new test files run inside it
  (12 tests).
- `pnpm verify:artifacts`: the homepage OG freshness check fails, and it
  fails at HEAD too. It lists stacks scene files from the seven branch
  commits since the last capture on 2026-09-01. This change touches nothing
  under the watched folders (`git diff --name-only HEAD -- src/app/components/stacks src/components/ui` is empty).
  The about-boot silhouettes are current and the search index is fresh.
  Recapturing the homepage OG is a separate branch chore, not part of this
  change.
- Snapshot outputs, checked by hand after regeneration: the manual hero has
  one lead paragraph and three panels (TL;DR, 30-second intro, mission); all
  nine TL;DR hooks resolved to a section anchor with no dropped links; the
  routine intro has both paragraphs with both links; the only Notion-hosted
  link left anywhere is the intentional `/systems` one; both custom emoji
  carry a downloaded file.
- `manual-og.png` regenerated byte-identical, so it is not in the diff.
  `routine-og.png` changed (6:15am lift).
- Not done: any browser rendering check. See shortcut 3.

## Codex review

`/codex review` on the working-tree diff at reasoning effort high, 100,225
tokens. Gate PASS: no P1, six P2. The first attempt through `codex review`
timed out at 330 seconds while still reading files; the second attempt
inlined the source diff (generated JSON and images excluded) and finished.
All six findings harden the sync-time gates rather than change what renders
from today's Notion content. My read on each, with the cheapest fix, for us
to decide:

1. **notion.site self-links would lose their fragment**
   (`notion-helpers.ts:469`). A `chappyasel.notion.site/manual#<block>` link
   is rewritten to `/manual` and the fragment dropped. No such link exists on
   either page today. Fix: pass the page's site slug into the self-link
   pass. Defer.
2. **Downloaded emoji are never refreshed** (`notion-helpers.ts:106`). Same
   convention as block images, which skip when the file exists. New artwork
   under the same Notion name keeps serving the old bytes. Fix: key the
   filename on the file UUID in Notion's URL. Defer; the app icon would
   re-download once.
3. **A failed emoji download passes silently** (`notion-helpers.ts:110`).
   The marker is removed, the page shows bare `:sunsama:` text, and the
   emoji tests pass because they only inspect markers that survived. Agree.
   Fix: assert any run whose text is a bare `:name:` shortcode carries
   `customEmoji.src`. One line per test. Recommend.
4. **A childless heading_1 before the first section is dropped**
   (`manual.ts:64`). Promoting a hero heading from H3 to H1 would merge its
   body into the previous panel. Agree. Fix: treat a childless heading_1 in
   the hero zone as a panel heading. Recommend.
5. **Empty panels are filtered before validation and a section can ship
   with no blocks** (`manual.ts:126`, `:162`). Agree, and judgement call 3
   above overstated the gate; reworded. Fix: assert every section has
   blocks in the manual test. Recommend.
6. **The routine test never checks `whyEarly`** (`routine.data.test.ts:25`).
   Renaming "Why So Early?" in Notion would drop the section and leave a
   dead TOC link. Agree. Fix: one assertion. Recommend.

Findings 3, 5, and 6 are test additions. Finding 4 is a five-line generator
change. None are applied yet.

## Round 2 (same day, after the Codex review)

Two small follow-ups Chappy asked for.

**Routine resync.** Notion edit at 15:30 UTC. One change: the 7:45am
shower entry gained a sentence on cold showers linking The 12 Levers. The
book slug exists in the library, so the link gets a cover. Times, stacks,
and rants are unchanged, so the homepage card and the routine OG image did
not move. Search index regenerated.

**"Personal Systems" as the full title.** The Unit type already separates
`label` (the canonical name on the panel, sheet, and announcements) from
`railLabel` (short nav copy, rail only), the way Featured Talks abbreviates
to Talks. Applied the same split: `label: "Personal Systems"`,
`railLabel: "Systems"`. The homepage h1 now reads "Personal Systems" too,
because the placard hides the body heading only when it matches the label;
leaving it as "Systems" would have shown two headings in the sheet. The
universal search destination is "Personal Systems" with "systems" kept as
an alias. Three tests that pinned the old string were updated. Judgement
call: the rail keeps the short form. If the rail should also say Personal
Systems, drop `railLabel`. Note that `data.ts` sits under the homepage OG
watch folder, so the already-failing freshness check will also list it.

## Round 3 (visual feedback on the rendered pages)

Four asks from looking at /manual and /routine.

**TL;DR hooks.** The "Read more →" words are gone. Each hook ends in the
section's Phosphor glyph plus `ArrowBendRightDown`, wrapped in the same link
with an aria-label naming the section. Detection is by the run's text
matching "Read more" with an optional arrow, so a hook written any other way
keeps its words and the old glyph-plus-text treatment.

**Theme toggle.** Moved off the hero's top-right corner onto the wayfinding
line, between "chappyasel.com" and "Last updated", as a new `compact`
variant of the shared toggle (20px hit area, 12px glyph). The hero keeps a
`pt-10` so the title does not jump up by the height of the row the toggle
used to own. The sky retint rule still applies because the line sits inside
`.dl-hero-inner`, and the sheet still hides the whole line. The long-press
theme menu and keyboard shortcut are unchanged.

**Site links in prose.** A new `siteDestination` map recognises the site's
own pages (weightlifting, the library root, manual, routine) by host or by
chappyasel.com path. Such links render the way section cross-references
do: the page's glyph, a dotted underline, and, when Notion stored the raw
URL as the text, the page's name in place of the address. So "Check out all
my workouts here: https://weightlifting.chappyasel.com/" now reads as a
barbell glyph and "Weightlifting". These open in the same tab; the generic
external-link path still opens a new one. Judgement call: I gave each
destination an accent from the existing seven-colour daylight palette
(coral, moss, plum, ochre) rather than adding colours.

**Book links, and the standard for them.** The screenshot's grey mat and
page curl were two things: the `.dl-cover` framed-print CSS, and Google
Books' `edge=curl` thumbnail. Both gone. A new shared `BookLink` component
under `src/components/books/` is now the only way running text links a
book: the library's clean cover art through `enhanceCoverUrl`, rounded with
a real shadow, italic title, and a hover card with author, star rating,
when it was read (finished span, "Abandoned at 40%", or "Reading since"),
and length. The card uses the shadcn Tooltip, not a title attribute, and
tap-first devices skip it and follow the link. The lookup that feeds it
moved from the two page files into `src/lib/books/inlineLookup.ts` and now
selects the extra columns; dates cross to the client as ISO strings. The
fact lines are a pure function with a test.

Not yet adopting the standard: the nine book links in the scene captions
(`content/stacks/objects.md`) go through the caption renderer, not the
Notion renderer. Worth switching in a follow-up.

**Verification.** `pnpm verify` green: 339 test files, 2855 tests, the new
`inlineFacts.test.ts` among them. No browser check, per AGENTS.md; the
hover card, the compact toggle on the sky, and the arrow hooks are worth
opening together.

## Round 4 (second look at the rendered pages)

**Site links get hover cards too.** A new `SiteLink` component under
`src/components/site/` wraps any link to one of the site's own pages
(manual, routine, weightlifting, book notes). Inline it is unchanged: the
page's glyph then the words. Hovering shows the page the way the homepage
cards introduce a section: glyph, the owner's title, one line on what is
there. The Weightlifting and Book Notes cards on the homepage are pure data
(stats, a carousel) with no prose to borrow, so the one line comes from each
page's own metadata description. To stop that copy drifting, the four
descriptions now live in `src/lib/site/pages.ts` and the four layouts read
theirs from there.

**"Chappy's" prepended.** In the hover card titles: "Chappy's Weightlifting",
"Chappy's Book Notes", "Chappy's Personal Operating Manual", "Chappy's Core
Daily Routine", matching how the manual and routine heroes name themselves.
Judgement call: the inline label a bare URL turns into stays short
("Weightlifting", "Book Notes"), because "Check out all my workouts here:
Chappy's Weightlifting" reads oddly mid-sentence. If you want it inline
too, it is the `label` field in `pages.ts`.

**One underline.** The dotted underline on section references and site
links is gone; every link in synced prose now has the same flat underline.
The glyph in front of the words is what marks a wayfinding link. Book links
already used the flat style.

**Bigger cover.** The hover card's cover now stands as tall as the facts
beside it (never shorter than a 2:3 cover at 96px wide), with the homepage
carousel's rounding and shadow. The text column centres against it.

**Cleanup.** The short-lived `siteDestinations.tsx` from round 3 is gone;
`pages.ts` (pure data and the href resolver, with a test) and `SiteLink`
(client) replace it. The resolver runs on the server; the icon map lives in
the client component, because a server-rendered `RichTextRenderer` cannot
hand a React component to a client component as a prop.

**Verification.** `pnpm verify` green: 340 test files, 2861 tests, the new
`pages.test.ts` among them. Still no browser check; the site-link card and
the taller book cover are the two things to open.

## Round 5 (third look, plus two mid-turn notes)

**Book cover: aspect and fit.** The hover card's cover was stretching to
the card's height and cropping. It now keeps its own proportions at 96px
wide, uncropped, and the text column centres against it.

**Stats-card hover for Weightlifting and Book Notes.** The card he meant is
the homepage placard's stats card (headline count, one bar per year, three
figures on the right). Its two builders lived in two places, one inside the
scene placard layer and one inside the homepage Weightlifting card, along
with their number formatters. They now live together in
`src/app/components/stacks/dom/statsCards.tsx`, both placards import them
from there, and `PlacardStatsCard` grew a `size="card"` variant that fits a
24rem popover. The hover card shows the owner's title above the card.

**How the numbers reach the card.** The manual and routine pages load the
same cached placard loaders the homepage uses (`loadSitePageCards` in
`src/lib/site/pageCards.ts`) and hand the result down through a client
context, `SitePageCardsProvider`, rather than threading another prop
through the Notion renderers. Outside a provider, or when a loader is away,
the link falls back to the page's description. Note that these pages have
no revalidation configured, so the figures are as fresh as the last build,
the same as the inline book covers have always been.

**Dark mode images (mid-turn note 1).** Two things were wrong in dark mode:
the print's mat stayed light, and the diagrams are black on white. The mat
and frame now have dark-mode values in `daylight.css`. Inversion is decided
per image at sync time from the pixels (`looksLikeLineArt` in
`notion-helpers.ts`). Two kinds qualify: ink on a light ground (at least
half the pixels near white, at most a fifth desaturated mid-tones), and
dark marks on a transparent canvas (black strokes that would vanish against
the new dark mat). Coloured or grey marks on a transparent canvas are left
as drawn. The renderer applies `dark:invert dark:hue-rotate-180` to flagged
images, so coloured lines keep their colours. A Notion caption can force
either way with `[invert]` or `[no-invert]`; the token is stripped from the
alt text.

The rule took four drafts, each corrected by measuring the real pixels
rather than eyeballing screenshots. Colour counting was the wrong
discriminator: anti-aliased edges give the tiny Gallup strand as many
colours as the pill photo. The mid-tone share is what separates ink from
photographs (0.02 for the strand and under 0.10 for the charts, against
0.31 for the photo). The waveform SVG turned out to be grey grid lines and
coloured waves on a transparent canvas, not black on grey; the grey I saw
was the old light mat behind it, so it reads fine on a dark mat unchanged.

Verdicts on today's six images: the sleep-drive diagram, the mortality
charts, and the Gallup strand (coloured bars on white) invert; the
waveform SVG, the pill-organiser photo, and the caffeine-calculator
screenshot (half of it is a dark chart) do not.

**Sunsama icon (mid-turn note 2).** Workspace emoji were 20px; they now
scale with the text at 1.1em, which matches the native emoji beside them.

**Peer session.** Someone else is editing this worktree at the same time:
`sectionIcons.tsx` gained a `sectionAccent` export and `routine-og.ts` now
draws section glyphs from a new `og-section-glyph` module. Neither is mine
and neither was touched.

**Fourth look.** The card's cover came down from 96px to 72px wide, so it
stands about as tall as the five lines beside it instead of towering over
them. Both hover cards use `rounded-xl` corners in place of the shared
tooltip surface's `rounded-md`, which was drawn for one-line hints; the
surface class itself is unchanged, so the small tooltips elsewhere keep
their tighter radius.

**Fifth look: hierarchy and icons.** The book card's text column now has a
size ladder (14px semibold title, 12px author, stars, then 11px facts) and
the facts carry the same glyphs the book's own page uses: a clock for a
finished read, a bookmark for an abandoned one, an open book for one in
progress, headphones for length. `inlineBookFacts` now reports which kind
of reading line it produced so the card can pick the glyph; one test
covers that.

**Verification.** `pnpm verify` green after the final regeneration: tsc,
lint, 340 test files, search index fresh, meadow clear. The placard layer
and Weightlifting card lost 95 lines of duplicated builders and format
helpers between them and render through the shared module. Still no
browser check; the two stats hover cards, the compact card size inside a
tooltip, and the inverted diagrams on the dark mat are the things to open.

## Git state

Uncommitted on `updates`. Nothing pushed.
