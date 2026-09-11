# Homepage captions audit

Date: 2026-09-10

## Bottom line

The repository already contains a caption-like content system, but it is not ready to ship as-is.

- `content/stacks/objects.md` contains 153 object notes.
- 127 are marked `written`; 26 are marked `needs-owner`.
- The 30-photo artifact catalog has only 4 `written` notes and 26 `needs-owner` notes.
- `public/data/scene-objects.json` is generated from the Markdown and checked by tests.
- Photo captions are not rendered. Commit `b476907` removed `useObjectNote` and the caption block from `SceneArtifactInspector.tsx`; the current test explicitly requires captions to be absent.
- The existing “written” status is not an editorial quality gate. Some entries describe implementation geometry rather than personal meaning, and at least one has drifted: `portrait` still says it is the About-page portrait, but the current image is Chappy onstage at Consensus 2026.

The right move is not to expose all 153 notes. Caption the 30 photos and a deliberately selected set of meaningful artifacts. Do not caption shelf planks, repeated dice, generic plants, or other set dressing merely because they have runtime IDs.

## Editorial standard

Each visitor-facing caption should answer at least two of these without sounding like a database row:

1. What is this?
2. Where or when was it?
3. Why is it part of Chappy’s story?

Default shape:

- Title: 2–6 words.
- Caption: one sentence, usually 12–35 words.
- Optional second sentence only when the object’s interaction is itself meaningful.
- Use first person when the caption carries personal significance.
- Prefer a durable story over exact counts that will drift.
- Never expose private addresses, unnamed people, or inferred identities without owner approval.
- Keep implementation details in code comments and research docs, not visitor copy.

## Display recommendation

Restore captions in the image inspector, but do not restore the removed beige caption badge verbatim.

Use the existing dark lower scrim:

- Title in small serif display type.
- Caption directly beneath it, max two or three lines on mobile.
- Navigation and action controls remain separate and tappable.
- No caption is rendered for `needs-owner` entries.
- The full-resolution image remains the dominant surface.

For significant non-photo objects, reuse the same content source only when an existing inspect/approach state has room for a short note. Do not add a new modal to every prop.

## Photo inventory and draft copy

Status meanings:

- **Ready**: grounded by the current pixels plus a dated repository, social, photo-metadata, or personal source.
- **Probable**: enough evidence for a draft, but one owner confirmation remains.
- **Owner**: identity, event, weight, or significance cannot be established safely.

### About

| ID | Status | Draft caption | Evidence / remaining question |
| --- | --- | --- | --- |
| `portrait` | Ready | **Onstage at Consensus 2026 in Miami, making the case that AI agents may become crypto’s first real users.** | Current pixels show the Consensus stage; `public/data/speaking.json` identifies the May 7, 2026 talk. Existing note is stale. |
| `about-collective-group-v8` | Owner | **[Event or gathering], with part of the community that became The AI Collective.** | Current note only says “a group photograph from the AI Collective.” Need event, date, and whether anyone should be named. |
| `about-family-v8` | Probable | **The family on Martha’s Vineyard, August 2026.** | Matched to `2026/8 MVY/Family/Fam 1.png`. Need whether to name the six people or keep it collective. |
| `about-speaking-candid-v8` | Probable | **Speaking during the three-month build toward The AI Collective’s June 2025 relaunch.** | Exact image is media from Chappy’s May 19, 2025 launch-teaser post. Need the actual event or gathering name if this was not a build-session talk. |
| `about-delicate-arch-v8` | Ready | **Delicate Arch at sunset, July 2021, during a family trip through Moab.** | Matched to the July 2021 Instagram post; Dad’s journal records the family hike and sunset stop. |
| `about-profile-full-v8` | Probable | **Martha’s Vineyard, August 2026.** | Beach portrait appears to be from the August 2026 Vineyard portrait set. Need what the portrait was shot for, if that story matters. |

### Training

| ID | Status | Draft caption | Evidence / remaining question |
| --- | --- | --- | --- |
| `training-trophy-side-v8` | Ready | **After my first natural-bodybuilding show: second in novice bodybuilding and third in physique at Battle of the Bay, October 2022.** | Exact Instagram set has Fremont GPS and an October 2022 post date; Dad’s journal records the show and placements. Boys with Gains is Chappy’s family lifting group/account, not the promoter. |
| `training-stage-kneeling-v8` | Ready | **Stepping onstage for the first time at Battle of the Bay in Fremont, October 2022.** | Same Instagram set and journal entry. |
| `training-stage-side-v8` | Ready | **My first natural-bodybuilding show, after twelve weeks of the hardest prep I had done.** | Same show; journal records the twelve-week prep. |
| `training-trophy-front-v8` | Ready | **The hardware from Battle of the Bay: second in novice bodybuilding and third in physique.** | Same show and journal entry. |
| `training-golf-group-v8` | Owner | **[Group] after a round at [course], [year].** | Need course/outing and whether the people should be named. |
| `training-pickleball-group-v8` | Owner | **Family pickleball at [court], [year].** | Pixels show six people at the net. Chappy has described pickleball as a family sport, but the exact court/date and identities are unresolved. |
| `training-golf-flag-v8` | Ready | **At the Chappaquiddick pin on Martha’s Vineyard, August 2025.** | Exact Instagram image has 41.3896, -70.5123 GPS and an August 2025 post date; the original asset pipeline identifies the Chappaquiddick pin flag. |
| `training-gym-pose-v8` | Ready | **Near the end of my 2025 cut, July 25, 2025.** | Matched to `2025/8 cut/IMG_0987.jpeg`; embedded capture date is July 25, 2025. |
| `training-deadlift-v8` | Owner | **A [weight]-pound deadlift, [year].** | The pixels do not make the plates/date reliable enough; lifting history contains several plausible heavy sets. Need the exact weight and approximate date. |
| `training-bench-v8` | Owner | **A [weight]-pound bench press, [year].** | Same issue. The image appears to be a still rather than a metadata-preserving original. |

### Projects

| ID | Status | Draft caption | Evidence / remaining question |
| --- | --- | --- | --- |
| `projects-coding-couch-v8` | Probable | **Building with the startup team I joined after leaving Apple, July 2024.** | Matched to `2024/7/Cofactory goodbye/1.jpg`, captured July 10, 2024, and reused in Chappy’s February 2026 post about leaving Apple to bet on Braden Spector. Need whether to name the company/team or people. |
| `projects-facebook-v8` | Ready | **At 1 Hacker Way during my Facebook software-engineering internship, February 2020.** | Original `IMG_1221.JPG` survives in Trash with a February 29, 2020 capture date; Dad’s journal confirms the winter-quarter internship. Need the other person’s name only if desired. |
| `projects-wwdc-v8` | Ready | **At Apple Park for WWDC 2022, while working as an engineer at Apple.** | Matched to `2023/Apple/Source/IMG_7555.jpeg`; embedded capture date is June 6, 2022. This is not the 2023 Vision Pro launch year. |

### Talks

| ID | Status | Draft caption | Evidence / remaining question |
| --- | --- | --- | --- |
| `talk-demo-night-v8` | Owner | **A packed AI Collective Demo Night in [city], [year].** | Pixels show a full audience, but the source/event cannot be matched safely. |
| `talk-dc-policy-v8` | Owner | **Speaking with policymakers and AI leaders in Washington, DC, [event/year].** | Exact image was used in a February 2026 post about AI risk and collective sensemaking, but the post does not identify the gathering. Need event, date, and topic. |
| `talk-ann-interview-v8` | Ready | **Talking about The AI Collective and optimism at the AI frontier on ANN News, January 2025.** | Exact image matched to the January 22, 2025 ANN News post and local TV source folder. |
| `talk-consensus-phone-v8` | Ready | **An audience member filming my Consensus 2026 fireside on AI agents and crypto, Miami, May 2026.** | Matched to `TW203681.jpg` from the May 7, 2026 fireside set. |
| `talk-panel-v8` | Ready | **Moderating “The Future of AI Beyond the Chatbot Era” at Stanford, August 2026.** | Matched to `2026/8 Stanford/3.jpg` and Chappy’s dated post naming the panel. |

### Systems

| ID | Status | Draft caption | Evidence / remaining question |
| --- | --- | --- | --- |
| `systems-working-session-v8` | Ready | **The early-2023 San Francisco apartment gathering that became The AI Collective.** | Exact image appears in Chappy’s April 2026 retrospective, whose text identifies the gathering and its significance. |
| `systems-supplements-v8` | Ready | **The daily supplement system: twelve in the morning, eight at night, each tied to an explicit dose and purpose.** | Existing note and Routine page. This is a visitor rewrite, not the current placement description. |
| `systems-sf-dusk-v8` | Ready | **Sunset from my San Francisco apartment, where many AI Collective dinners and founder gatherings began.** | Exact skyline image appears in the February 10, 2025 founder-meetup post; the repository identifies the building as 45 Lansing/Jasper. Keep the street address out of visitor copy. |
| `systems-lake-v8` | Ready | **A summer swim at Lake Alpine in California, June 2020.** | Matched to `2020/6 CA Road Trip/Final/IMG_2792.jpg`; embedded date and GPS resolve to Lake Alpine. |
| `systems-lighthouse-v8` | Ready | **Gay Head Light in Aquinnah, on Martha’s Vineyard.** | Existing note plus visible landmark. No date is needed for the durable story. |
| `systems-home-office-v8` | Probable | **My home office above San Francisco, [year].** | Pixels show the same high-rise setting, but exact apartment/date has not been established. Need whether the setup itself matters. |

## Owner confirmations still needed

The 26 original `needs-owner` entries reduce to 12 owner decisions, of which 8 block accurate copy:

1. Which AI Collective event/date is `about-collective-group-v8`, and should anyone be named?
2. For the August 2026 Vineyard family portrait, name all six people or keep “the family”?
3. What exact event is `about-speaking-candid-v8`?
4. What was the August 2026 beach portrait shot for, if anything beyond the site/profile?
5. Who/where/when for the golf group?
6. Who/where/when for the pickleball group?
7. Exact deadlift weight and approximate date?
8. Exact bench weight and approximate date?
9. Which Demo Night city/date?
10. Which DC gathering, year, and subject?
11. Optional: name the post-Apple startup/team or people in the coding-couch photo.
12. Optional: confirm the home-office apartment/year and whether its setup matters.

Questions 1, 3, and 5–10 block accurate copy. Questions 2, 4, 11, and 12 refine usable generic drafts.

## Significant non-photo objects worth captioning

Keep the selection editorial, not exhaustive:

1. Apple Vision Pro
2. The AI Collective mark
3. Coordination Research object
4. TJHSST medallion
5. Globe
6. Current-reading stack and featured books as families, not one generic caption per generated volume
7. Aggregate strength, Big 3, DEXA, and Lift Table
8. Routine board and 3:45 alarm clock
9. Homework App
10. Weightlifting App icon
11. Macintosh running the previous site’s cellular automaton
12. GPT-3 final paper
13. “Trust in the Age of Acceleration” booklet
14. Martha’s Vineyard cutout, signpost, and Gay Head Light as one small story cluster
15. Microphone or Talks shelf only if it introduces the speaking collection

Everything else can remain tactile scenery without explanatory prose.

## Examples of editorial rewrites

### Apple Vision Pro

Current note spends substantial space on the shelf model.

Recommended:

> The product I spent two years helping launch at Apple, as an AR/VR software engineer on Vision Pro.

### Globe

Recommended:

> The darker countries are the 25 I have visited; the orange lights map the global spread of AI Collective chapters.

### Macintosh

Recommended:

> A compact Mac running the cellular automaton that formed the background of the previous version of this site.

### GPT-3 paper

Recommended:

> My 2021 college paper on GPT-3 and the technological singularity. Researching it is what first pointed me toward community as the missing layer around AI.

## Implementation sequence

1. Chappy resolves the 10 blocking questions and approves the caption voice.
2. Rewrite the 30 photo entries in `content/stacks/objects.md`; regenerate `public/data/scene-objects.json`.
3. Add a curated `visitor: true` or equivalent selection field for significant non-photo notes rather than exposing all 153.
4. Restore title/caption rendering in `SceneArtifactInspector.tsx` with a new restrained scrim treatment.
5. Add focused parsing, coverage, and presentation tests.
6. Run `pnpm generate:scene-objects`, targeted tests, then `pnpm verify`.
7. Perform browser-based visual verification only if Chappy explicitly requests it, per repository policy.

## Working-tree safety

This audit was written on branch `prototype/major-route-transitions`. Existing unrelated changes in `BootScreen.tsx`, `SceneDiagnostics.tsx`, `bookInteractions.ts`, `layout.tsx`, and `route-transition-prototype/` were not touched. No commit was created.
