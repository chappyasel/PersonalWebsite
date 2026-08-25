# Achievement and exploration system research

Research date: 2026-08-24

## Product decision, 2026-08-25

Field Notes uses four fixed, authored rarity tiers: Common, Uncommon, Rare, and
Legendary. Rarity appears through each stamp's perforated outer paper edge and
describes intended discovery difficulty. It is private collection metadata,
not a global ownership percentage. The seven content categories are no longer
part of the visitor-facing system.

References below to avoiding rarity pressure still apply to comparative or
dynamic rarity, point multipliers, leaderboards, and social status. They do not
prohibit the fixed border treatment approved after this research.

## Recommendation in one sentence

Build a quiet exploration guide, not a reward economy: show visitors worthwhile things they can discover, acknowledge completed discoveries once, keep progress on their device, and make sharing deliberate.

## What the current site gives us

The site already has enough authored depth for this system. It does not need filler tasks.

- The home world has seven named areas: About, Book Notes, Weightlifting, Systems, Projects, Musings, and Featured Talks. The ordered registry lives in [`data.ts`](../../src/app/components/stacks/data.ts).
- The scene has dozens of movable props plus deliberate interactions: sitting on the About couch, winding the Systems clocks to 3:45, switching lamps, sending a shockwave from the Coordination globe, making the Musings tea steam, shaking the Weightlifting bottles, and changing the Projects room between its photographic, 8-bit, and 16-bit treatments.
- Three precise skyline targets trigger the Golden Gate Bridge fireworks and the Salesforce Tower and Jasper light shows. These are real secrets, not ordinary navigation targets.
- Photos, analysis figures, book covers, and other personal artifacts open inspectors or notes. These are especially good discovery subjects because the interaction reveals actual content.
- The hidden [`/golf`](../../src/app/golf/page.tsx) route opens a four-ball green between Book Notes and Weightlifting. Getting a ball into the cup already has its own satisfying response.
- The deeper Book Notes and Weightlifting pages contain filters, historical views, statistics, details, and charts. The Liar's Dice page has a real probability calculator. The Manual and Routine are substantial destinations rather than scene dressing.
- Touch travel, touch focus, keyboard navigation, reduced-motion delivery, and a flat homepage already exist. A discovery is only valid if its qualifying action works in the visitor's delivered experience.

Two tempting candidates should stay out of the first release. Universal search is implemented but mounted with `enabled={false}` in [`layout.tsx`](../../src/app/layout.tsx), and model artifact previews are explicitly disabled in [`sceneArtifacts.ts`](../../src/app/components/stacks/sceneArtifacts.ts). A catalog should describe the live site, not planned capabilities.

## Recommended product concept

Call the feature **Field Notes** and call each completed item a **discovery**. That language fits the site's museum-like world better than achievements, trophies, or quests.

Place a quiet `Field Notes` row in the existing interface menu from the start. Do not give it a pulsing dot or an empty `0/13` counter. The first earned discovery can produce one polite `Added to Field Notes` toast, which teaches the system without front-loading an explanation. Later discoveries use the same short toast and never interrupt the scene.

The Field Notes sheet should have three layers:

1. A screenshot-ready overview card. Suggested copy: `Chappy's world`, `8 discoveries across 5 shelves`, and three or four earned illustrations. It should not show XP, rank, rarity, streaks, or a denominator that counts hidden items. A `Make a card` action can render the same composition at 1200 by 630 pixels for download or the system share sheet.
2. A compact collection grouped into `Around the site`, `Close looking`, and `Secrets`. Earned items are complete specimen cards or stamps. Unearned visible items use silhouettes and plain text, not padlocks that imply withheld content.
3. Progressive hints. Start with one poetic clue, offer `Another hint`, then an explicit direction. A `Take me there` action may navigate to the relevant section, but it must not complete the interaction for the visitor.

The top card should be worth capturing because it looks good, not because the visitor receives a reward for sharing it. Sharing should contain earned artwork and titles only. Leave out browsing history, completion times, hidden-item counts, and personal identifiers.

## Proposed first catalog

Start with 13. This is enough to reveal the site's range while keeping every entry connected to something worth noticing.

| Collection      | Discovery            | Qualifying action                                 | First hint                                   |
| --------------- | -------------------- | ------------------------------------------------- | -------------------------------------------- |
| Around the site | Grand tour           | Settle at all seven home areas                    | Seven shelves, seven parts of a life.        |
| Around the site | Notes in the margins | Open the full notes for a book                    | Some spines open further than the shelf.     |
| Around the site | Through the years    | Select a past year in Book Notes or Weightlifting | The latest year is only one chapter.         |
| Around the site | Call my bluff        | Calculate a Liar's Dice hand                      | Some odds are better checked than trusted.   |
| Close looking   | Curious hands        | Successfully carry a movable scene prop           | The room is less fixed than it looks.        |
| Close looking   | Looking closer       | Open a photo or analysis artifact                 | A few objects hold a second view.            |
| Close looking   | Sit a spell          | Sit on the About couch                            | There is one good place to take in the view. |
| Close looking   | Ripple effect        | Activate the Coordination globe                   | One project reaches beyond its plinth.       |
| Close looking   | The 3:45 club        | Wind either Systems clock                         | The clocks know when the day starts.         |
| Close looking   | City lights          | Trigger all three skyline responses               | The skyline has stories of its own.          |
| Close looking   | Another resolution   | Try both the 8-bit and 16-bit Projects treatments | Two boards see the room differently.         |
| Secrets         | Fore!                | Reach the hidden golf stop                        | There is a little green between chapters.    |
| Secrets         | In the cup           | Hole any golf ball                                | Finding the course is only the front nine.   |

`Fore!` and `In the cup` should be hidden until earned because their titles and requirements spoil the surprise. `City lights` can show `1 of 3` progress without naming the remaining landmarks. The other cards should be visible with optional hints.

Do not pad the catalog with theme changes, sound toggles, shortcut-sheet opens, time-on-site milestones, repeated page views, or hover-only reactions. Those either reward routine controls, favor one input method, or turn attention into a chore.

## Capability and persistence rules

The world-only collection must not make the flat or reduced-motion experience look incomplete. Show discoveries that can be earned in the current delivery mode and label the collection by context. Never instruct someone to disable reduced motion to finish a set. Every earned state needs text and icon treatment in addition to color or animation.

Progress also crosses origins. Production navigation moves among `www.chappyasel.com`, `books.chappyasel.com`, `weightlifting.chappyasel.com`, and other subdomains, while `localStorage` belongs to one origin. A local-storage-only implementation would split one visitor's Field Notes into several copies.

For the first version, use no account and no server profile. Keep the detailed, versioned state in local storage, and mirror only a compact schema version and earned-ID bitset in a first-party `.chappyasel.com` cookie. The site already uses this pattern to carry the theme across subdomains in [`providers.tsx`](../../src/lib/providers.tsx). Merge rather than replace progress when a page loads. Explain it as `Saved in this browser`, tolerate storage being unavailable, and provide `Reset Field Notes`.

## Implementation seams

The implementation should record semantic discoveries, not infer them later from raw clicks.

- A root `FieldNotesProvider` owns hydration, storage migration, cross-tab updates, the drawer, and a queued polite-status toast.
- A static registry owns stable IDs, rarity, pre-earned and post-earned copy, hints, capability requirements, and artwork tokens.
- Small domain events report actions such as `home.unit.arrived`, `scene.prop.carried`, `scene.interaction.activated`, `scene.artifact.opened`, `book.notes.opened`, `stats.year.selected`, `liarsdice.calculated`, and `golf.ball.holed`.
- [`runSceneInteractionActivation`](../../src/app/components/stacks/scene/interactionRegistry.ts) is a useful central seam for scene eggs and actions. Carrying, opening inspectors, and golf completion need their own semantic hooks because they bypass that path.
- The existing typed analytics catalog in [`analytics.ts`](../../src/lib/analytics.ts) is a good model for a closed event vocabulary, but analytics must not be the source of truth for awarding progress. If measurement is added, emit a separate aggregate `discovery_earned` event after the local award.

This keeps the off path cheap. Visitors who never open Field Notes should not pay for extra render targets, texture sampling, particles, or per-frame checks.

## Product stance

The system should help a curious visitor notice more of the site. It should never manufacture a reason to return, punish absence, rank people, or turn ordinary browsing into labor. That boundary follows the W3C's principle that the web should strengthen individual control and should avoid designs that manipulate, deceive, or encourage addictive behavior. [W3C Ethical Web Principles](https://www.w3.org/TR/ethical-web-principles/#the-web-enhances-individuals-control-and-power)

Self-determination theory offers a useful test for each mechanic. Motivation is better supported when an experience preserves autonomy, gives legible feedback about competence, and creates real connection. [Ryan and Deci, 2000](https://www.selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf) For this site, that means free exploration, specific feedback about what the visitor found, and optional sharing. It does not mean points for clicks.

A meta-analysis of 128 experiments found that expected rewards contingent on engagement, completion, or performance reduced free-choice intrinsic motivation, while positive feedback improved both free-choice behavior and reported interest. [Deci, Koestner, and Ryan, 1999](https://pubmed.ncbi.nlm.nih.gov/10589297/) A separate experiment found that points, levels, and leaderboards increased the quantity of work but did not increase intrinsic motivation or perceived competence in its task. [Mekler et al., 2017](https://www.sciencedirect.com/science/article/pii/S0747563215301229) These studies do not prove that a badge on a personal website is harmful. They do show why the badge should act as warm, informative recognition rather than as currency.

## Suggested interaction model

### A discoverable drawer

Put one small, stable entry point in an existing menu or low-attention corner. Do not float it over the main experience, pulse it, or show a badge count that demands clearing. Apple's Game Center guidance similarly puts its achievement access point in menu or settings contexts and keeps it out of active play. [Apple Game Center HIG](https://developer.apple.com/design/human-interface-guidelines/game-center)

The drawer should open only when the visitor asks. A side sheet is a good desktop pattern and a bottom or full-screen sheet is a good small-screen adaptation. If implemented as a modal, it needs a programmatic name, contained tab order, `Escape` handling, a visible close control, and focus restoration to the opener. [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

Inside the drawer, group discoveries by real parts of the site, such as books, projects, the home scene, writing, and search. Lead with a compact overview, then show earned and available discoveries. Apple's current Game Center model uses locked, in-progress, hidden, and completed states, groups by completion state, and recommends ordering achievements along the common path through the experience. [Apple Game Center HIG](https://developer.apple.com/design/human-interface-guidelines/game-center)

### Visible goals with a few genuine secrets

Make most unearned discoveries visible. Give each one a short title, a one-sentence hint, and an optional "Show another hint" action. This lets visitors choose how much help they want and preserves autonomy. Apple's first-party achievement guidance says visible locked achievements let people browse what is possible. Its older design guide explicitly recommends using hidden achievements sparingly because visible goals let people decide what to pursue. [Apple achievement documentation](https://developer.apple.com/documentation/gamekit/rewarding-players-with-achievements), [archived Apple achievement design guide](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/GameKit_Guide/Achievements/Achievements.html)

Reserve hidden discoveries for moments where the surprise is the reward or where the description would spoil an existing Easter egg. Apple gives those as the two main reasons to hide an achievement. [Apple achievement documentation](https://developer.apple.com/documentation/gamekit/rewarding-players-with-achievements) Do not expose a precise hidden-achievement count. An unexplained `23/25` completion score turns two surprises into a scavenger-hunt obligation.

Hints should describe meaning before mechanics. "There is more life in the bookshelf than the covers suggest" is better than "click five books." After the visitor reveals a stronger hint, it can name the interaction plainly. This two-step hint pattern is a design inference from the evidence on autonomy and visible goals, not a tested rule for personal websites. [Ryan and Deci, 2000](https://www.selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf), [archived Apple achievement design guide](https://developer.apple.com/library/archive/documentation/NetworkingInternet/Conceptual/GameKit_Guide/Achievements/Achievements.html)

### Completion feedback

Show one quiet toast when a discovery completes. It should state the discovery's name and why the moment counted. Do not move focus, block the page, play sound by default, or repeat the toast on later visits. WCAG requires status messages to be programmatically exposed without taking focus, and its guidance warns that excessive live-region feedback can make an interface too chatty. [WCAG 2.2 status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)

Use `role="status"` or an equivalent polite live region for ordinary completion feedback. Reserve `role="alert"` for important and time-sensitive information. WAI's alert guidance says alerts should not affect keyboard focus, should not disappear too quickly, and should not interrupt frequently. [WAI-ARIA alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/)

A practical toast contract follows from that guidance:

- Show one completion at a time and queue simultaneous completions.
- Keep the message short, with no required action.
- Let the visual toast fade after a calm interval, but keep the completed item in the drawer permanently.
- If the toast contains an action, keep it available while hovered or focused, or make the same action easy to find in the drawer.
- Do not use confetti, a full-screen takeover, vibration, or sound as the default response.

### The overview and share card

The top of the drawer should be useful before it is shareable. Show the number of discoveries found, a small distribution across site areas, and a few earned pieces of artwork. Avoid an overall score, rank, rarity percentage, daily activity, or "percent complete" if hidden discoveries exist. Apple uses concise collectible cards, unique artwork, completion grouping, and glanceable progress in Game Center. [Apple Game Center HIG](https://developer.apple.com/design/human-interface-guidelines/game-center)

Add an explicit "Make a card" action that renders a fixed, clean composition for screenshots or download. The card should contain only earned discovery names and artwork by default. It should omit hints, browsing history, timestamps, and any personal identifier. The Web Share API is intentionally user-initiated and lets the user agent present destinations chosen by the visitor, which is the right consent model for sharing. [W3C Web Share API](https://www.w3.org/TR/web-share/)

Provide a text equivalent for the card and do not make the image the only record of progress. Sharing should always be optional. There should be no reward for posting, copying a link, inviting someone, or granting access to contacts.

## Accessibility and motion

The drawer, discovery cards, toast, and share flow need to work with keyboard and assistive technology. Use real buttons, visible focus, semantic headings and lists, text labels for artwork, and the dialog behavior described above. WCAG 2.2 requires user interface names, roles, states, and values to be available programmatically. [WCAG 2.2](https://www.w3.org/TR/WCAG22/#name-role-value)

Treat celebration motion as nonessential. When `prefers-reduced-motion: reduce` matches, replace travel, scale, spin, particles, and parallax with an immediate state change or a restrained opacity/color treatment. The media feature exists specifically so people can request removal or replacement of motion that causes discomfort or distraction. [Media Queries Level 5](https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion), [W3C reduced-motion technique](https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html)

Do not start looping, blinking, or scrolling decoration automatically in the drawer. WCAG requires a way to pause, stop, or hide automatically started moving content that lasts more than five seconds and appears alongside other content. Its explanatory guidance also treats motion triggered by focus, hover, or page scrolling as automatic rather than intentional activation. [WCAG 2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)

Color and artwork can carry tone, but not state by themselves. Every locked, hinted, earned, and hidden state needs a text label or other programmatic distinction. The system should remain fully usable if motion, audio, decorative 3D, or local storage is unavailable.

## Privacy and persistence

Store the minimum progress needed to reconstruct the drawer, preferably a versioned set of discovery IDs and completion timestamps in first-party browser storage. Do not store a raw clickstream, dwell time, scroll depth, or a cross-site identifier. W3C's privacy principles call for limiting collected and transferred data to what serves the user's goal, using data only for its stated purpose, and explaining privacy-relevant behavior in accessible plain language. [W3C Privacy Principles](https://www.w3.org/TR/privacy-principles/)

`localStorage` can persist progress across browser sessions, but it is not an account or durable backup. Browser controls can clear it, and the HTML standard warns that persistent storage can also be abused for tracking. [WHATWG Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html) The interface should say "Saved on this device," tolerate missing or corrupted data, and offer a plainly labeled "Reset discoveries" control.

Keep the first version local-only. Server sync would require identity, retention, deletion, and cross-device conflict decisions that add little to a playful exploration layer. If sync ever becomes worth that cost, make it opt-in and explain exactly what moves off the device. This recommendation applies W3C's data minimization and purpose limitation principles. [W3C Privacy Principles](https://www.w3.org/TR/privacy-principles/#data-minimization)

## Mechanics to reject

- No daily streak. Across seven studies, the way a behavioral log depicted an identical activity pattern changed subsequent choices. Participants treated maintaining the displayed streak as a goal in itself, and broken streaks reduced later engagement relative to intact ones. [Silverman and Barasch, 2023](https://academic.oup.com/jcr/article/49/6/1095/6623414?guestAccessKey=1bb91501-7f0d-4dcc-806d-8124e533be13) GitHub's removal of a public streak counter also reduced weekend work and single-contribution days in a natural experiment, evidence that the counter had been steering behavior beyond meaningful contribution. [Moldon, Strohmaier, and Wachs, ICSE 2021](https://doi.org/10.1109/ICSE43902.2021.00058)
- No decay, lost progress, streak freeze, comeback penalty, countdown, or "don't lose your collection" copy. A personal site has no legitimate daily cadence, so loss pressure would exist only to manufacture return visits. W3C warns against manipulative and addictive patterns. [W3C Ethical Web Principles](https://www.w3.org/TR/ethical-web-principles/#the-web-enhances-individuals-control-and-power)
- No XP, coins, levels, or universal point total. Points and levels can increase output quantity without increasing intrinsic motivation or perceived competence. Here they would measure traffic through the site, not understanding or discovery. [Mekler et al., 2017](https://www.sciencedirect.com/science/article/pii/S0747563215301229)
- No public leaderboard or rarity pressure. The goal is to reveal the site's range, not turn visitors into competitors. This is the product implication of preserving autonomy and using feedback to support competence rather than control behavior. [Ryan and Deci, 2000](https://www.selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf)
- No repeated prompts to open the drawer, share a card, enable notifications, sign in, or resume hunting. The FTC classifies repeated disruptive requests, especially those without a permanent decline, as nagging. [FTC, Bringing Dark Patterns to Light](https://www.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf)
- No fake urgency, notification dots unrelated to unread information, or locked content. Apple advises using badges only for unread notifications, and the FTC identifies false countdowns, coercion, and misleading interface behavior as dark patterns. [Apple notification HIG](https://developer.apple.com/design/human-interface-guidelines/notifications/), [FTC dark-pattern report](https://www.ftc.gov/reports/bringing-dark-patterns-light)
- No reward for time on site, repeated page views, social posting, or data permission. These optimize attention extraction rather than exploration and create pressure to act for the site's benefit. W3C says web design should prioritize the user's benefit and control. [W3C Ethical Web Principles](https://www.w3.org/TR/ethical-web-principles/)

## Achievement quality bar

An achievement belongs in the system only if it passes all of these tests:

1. It points to something the visitor might otherwise miss and would be glad to find.
2. The qualifying action has meaning beyond incrementing a counter.
3. A visitor can ignore it without losing access, status, or progress elsewhere.
4. The completion copy explains what was discovered rather than praising compliance.
5. It can be detected without collecting a behavioral history.
6. It has a clear keyboard and reduced-motion path.
7. It still feels worthwhile with no points, rarity, leaderboard, or external prize.

This bar applies the research above. It is intentionally stricter than a normal game achievement list because the underlying product is a personal website, not a game.

## Candidate content mix

The proposed 13-item catalog above follows the evidence-based range of 12 to 18 discoveries. It mixes substantial destinations, handcrafted scene details, one breadth marker, and two genuine secrets. The exact count is a product choice, not a research result. Starting small keeps every discovery specific and gives real visitor behavior a chance to show which hints are unclear before the catalog grows.

## What to evaluate after launch

Evaluate whether visitors find more kinds of content, not whether they spend more time or return under pressure. Useful signals are drawer discovery, hint reveals, completion distribution by site area, and whether people reach substantive destinations after opening a hint. Keep any analytics aggregate and purpose-limited, and do not tie them to the local progress record. [W3C Privacy Principles](https://www.w3.org/TR/privacy-principles/#purpose-limitation)

Qualitative checks matter more than a raw completion rate:

- Did the drawer feel optional?
- Did a hint lead to something worth finding?
- Did any discovery feel like busywork?
- Did the toast interrupt reading or scene interaction?
- Did visitors understand that progress stays on the device?
- Would they still explore if the earned count were removed?

If the answer to the last question is no, the system is becoming the point. Cut mechanics before adding more.

## Evidence limits

The motivation studies cited here examine structured tasks, learning, games, or software work rather than personal websites. Apple and platform guidance describes game and operating-system patterns. The sources are strong enough to set guardrails, but they cannot predict whether Chappy's audience will enjoy a particular name, visual treatment, hint, or achievement. Those choices still need lightweight visitor testing.
