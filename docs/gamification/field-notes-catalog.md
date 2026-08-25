# Field Notes discovery catalog

Status: working draft for feedback
Scope: the main 3D world, plus one album-side discovery (Philatelist)

## Vocabulary proposal

Use **Portal** instead of **Door**.

A Portal is a scene object that leads to another meaningful part of the site
when activated. The object does not need to look like a literal doorway. A
book, photograph, project frame, or piece of equipment can all be Portals.

Related language:

- **Portal Label**: the compact label that says where a Portal leads.

- **Activate a Portal**: the visitor action. Avoid "open a Door."

- **Action**: an interaction that changes something inside the world without
  navigating away.

- **Artifact**: a photograph, chart, or other object that opens a closer view.

- **Easter egg**: a deliberately quiet response whose surprise is part of its
  value.

This is now the approved product term, and the 3D implementation uses the same
language. The historical analytics event retains its original machine key so
existing reporting remains continuous.

## How to review this list

Change `[ ]` to `[x]` when you want to keep an item. Type freely after
`Notes:` to rename it, cut it, change its trigger, or leave any other feedback.

Card states:

- `◇` shows its title, a hint, and a locked silhouette.

- `?` is completely unidentified until discovered.

- `? -> ◇` begins unidentified, then becomes a normal silhouette after its
  parent secret is found.

Rarity is an authored measure of how difficult a discovery is to encounter.
It does not represent global ownership. The perforated outer paper edge is the
primary visual signal:

- **Common** uses plain ivory paper with one quiet sepia keyline.
- **Uncommon** uses sage paper with a doubled green keyline.
- **Rare** uses blue pinstriped paper with a doubled blue keyline.
- **Legendary** uses a photographed gold-leaf material with a nested burgundy
  and gold keyline. The full perforated paper and miniature rarity mark use the
  same static texture. Legendary materials do not loop or glow.

The perforations also become deeper and denser with each tier. Hidden findings
conceal their rarity until found. The printed frame inside an earned stamp stays
decorative and does not encode rarity.

Earned and unearned findings are different objects in the album. An earned
finding is a colorful postage stamp with perforated paper, a printed image,
authored postal lettering, slight placement error, and a faint cancellation
mark. A visitor can drag an earned stamp anywhere on its original page. The
album saves page-relative placement without changing page order or moving the
stamp's clue. Lettering may be a large denomination, vertical inscription, ink
banner,
archival caption, split composition, emblem text, or absent entirely. Its real
title and description live in the tooltip. An unearned
finding is a flat mount printed on the notebook page. It has no perforations,
paper fill, shadow, tilt, or postmark. Visible mounts show a penciled icon and
title; their full clue lives in the tooltip. Hidden mounts show only a question
mark until found.

The shared stamp system stays small on purpose: a square footprint, rarity
paper, an ivory print margin, the handwriting face, light print texture, and a
postmark. Every discovery has an authored combination of palette, keyline,
pattern, and composition. No two discoveries share the same recipe. The icon
or illustration is the largest interior element, not a small seal. Its weight,
scale, offset, rotation, and optional secondary mark are authored per discovery.
Hash-derived variation is reserved for physical imperfections such as tilt,
offset, and postmark angle.

Completion is recorded for actions inside the 3D world. A Portal activation
may count before navigation, but activity on the destination page does not.

## Collection milestones

The album marks collection progress without adding meta-discoveries:

- At 10 findings, color appears in the botanical sketch.
- At 20 findings, a butterfly joins the sketch.
- When every current finding is earned, the overview receives a completed
  journal seal and a brief gold-foil sweep.

Completion always uses the live catalog total. Adding another Field Note removes
the completed state until the visitor finds the new entry.

## Discovery catalog

1. [x] **Grand Tour** `◇`

   - Rarity: Rare.
   - Earned by: Visit all seven main Units.
   - First hint: Seven shelves hold seven parts of a life.
   - Notes:

2. [x] **First Portal** `◇`

   - Rarity: Common.
   - Earned by: Activate any in-world Portal.
   - First hint: Some objects lead beyond the shelf.
   - Notes:

3. [x] **Photo Finish** `◇`

   - Rarity: Common.
   - Earned by: Hide the entire interface with photo mode. Available on
     keyboard-capable devices.
   - First hint: Sometimes the room deserves the whole frame.
   - Notes:

4. [x] **Curious Hands** `◇`

   - Rarity: Common.
   - Earned by: Pick up and move a prop.
   - First hint: The room is less fixed than it looks.
   - Notes:

5. [x] **Around the Room** `◇`

   - Rarity: Legendary.
   - Earned by: Move at least one prop in every Unit.
   - First hint: Leave a small mark everywhere you visit.
   - Notes:

6. [x] **Rearranged** `◇`

   - Rarity: Uncommon.
   - Earned by: Move ten different props.
   - First hint: Chappy may notice if you keep redecorating.
   - Notes:

7. [x] **Heavy Lifting** `◇`

   - Rarity: Common.
   - Earned by: Successfully move the loaded 60 kg barbell.
   - First hint: Not everything yields easily.
   - Notes:

8. [ ] **Global Perspective** `◇`

   - Rarity: Common.
   - Earned by: Give the About globe a proper spin.
   - First hint: The world turns if you give it a push.
   - Notes:

9. [ ] **A Capital View** `?`

   - Rarity: Uncommon. Hidden until found.
   - Earned by: Sit on the About couch and reveal its alternate view.
   - First hint: None before discovery.
   - Notes:

10. [ ] **Ripple Effect** `◇`

    - Rarity: Common.
    - Earned by: Explicitly activate the Coordination Research globe's
      shockwave.
    - First hint: One project reaches beyond its plinth.
    - Notes:

11. [ ] **Task Light** `◇`

    - Rarity: Common.
    - Earned by: Switch off any desk lamp.
    - First hint: A working light does not have to stay on.
    - Notes:

12. [ ] **Beacon** `◇`

    - Rarity: Common.
    - Earned by: Switch off the floor lamp near Musings and Talks.
    - First hint: A tall light watches over two shelves.
    - Notes:

13. [ ] **Early Alarm** `◇`

    - Rarity: Uncommon.
    - Earned by: Wind the digital alarm clock to 3:45.
    - First hint: The clocks know when Chappy's day starts.
    - Notes:

14. [ ] **Old Time** `◇`

    - Rarity: Common.
    - Earned by: Disturb the grandfather clock and set its face in motion.
    - First hint: The older clock keeps the same unusual hour.
    - Notes:

15. [ ] **Tea Time** `◇`

    - Rarity: Common.
    - Earned by: Wake the steam rising from the Musings tea.
    - First hint: One cup is still warm.
    - Notes:

16. [ ] **Shake Well** `◇`

    - Rarity: Uncommon.
    - Earned by: Trigger the hidden response on all three shaker bottles.
    - First hint: The bottles are not just shelf dressing.
    - Notes:

17. [ ] **Another Resolution** `◇`

    - Rarity: Uncommon.
    - Earned by: Try both the 8-bit and 16-bit Projects treatments.
    - First hint: Two boards see the room differently.
    - Notes:

18. [ ] **Spine Cracked** `◇`

    - Rarity: Common.
    - Earned by: Open a book preview directly from the 3D bookshelf.
    - First hint: Some covers open without leaving the room.
    - Notes:

19. [ ] **Family Album** `◇`

    - Rarity: Rare.
    - Earned by: Inspect a photograph in About, Weightlifting, Systems,
      Projects, and Talks.
    - First hint: There are photographs across five shelves.
    - Notes:

20. [ ] **Behind the Numbers** `◇`

    - Rarity: Common.
    - Earned by: Open a Weightlifting analysis chart or lift table.
    - First hint: Some training props contain the evidence.
    - Notes:

21. [ ] **Fireworks Over the Bay** `?`

    - Rarity: Rare. Hidden until found.
    - Earned by: Find the skyline interaction that launches fireworks.
    - First hint: None before discovery.
    - Notes:

22. [ ] **Crowned** `?`

    - Rarity: Rare. Hidden until found.
    - Earned by: Trigger the Salesforce Tower crown light show.
    - First hint: None before discovery.
    - Notes:

23. [ ] **Floor 33** `?`

    - Rarity: Rare. Hidden until found.
    - Earned by: Discover the hidden Jasper building light show.
    - First hint: None before discovery.
    - Notes:

24. [ ] **Butterfly Effect** `◇`

    - Rarity: Uncommon.
    - Earned by: Disturb a perched creature by interacting with the object
      beneath it.
    - First hint: Wait for a butterfly to settle, then disturb its perch.
    - Notes:

25. [ ] **Hole in One** `◇`

    - Rarity: Legendary.
    - Earned by: Hole a golf ball with its first shot.
    - First hint: The green rewards a perfect first stroke.
    - Notes:

26. [ ] **Wrong Sport** `?`

    - Rarity: Uncommon. Hidden until found.
    - Earned by: Bring a non-golf ball or loose prop into the hitting bay and
      strike it with the club.
    - First hint: None before discovery.
    - Notes:

27. [ ] **Open House** `◇`

    - Rarity: Rare.
    - Earned by: Activate Portals leading to eight different destinations.
      Several props can share one destination (all six dice open Liar's
      Dice), so the count is destinations, not props.
    - First hint: The doors go more places than you think.
    - Notes:

28. [ ] **Long Haul** `◇`

    - Rarity: Uncommon.
    - Earned by: Carry one prop 26.2 world units in a single uninterrupted
      hold. The threshold is the marathon number; a full sweep across one
      shelf is about three units.
    - First hint: Some props could use a proper walk.
    - Notes:

29. [ ] **The Regular** `◇`

    - Rarity: Uncommon.
    - Earned by: Return to the room on a later calendar day, measured in the
      visitor's local time. The only Field Note that cannot be earned in one
      sitting.
    - First hint: The room will still be here tomorrow.
    - Notes:

30. [ ] **Full Stack** `◇`

    - Rarity: Legendary.
    - Earned by: Restack all six Liar's Dice into a single standing tower.
      Requires the simulated physics path (desktop), and every die must be
      picked up at least once — an untouched die stays an authored static and
      does not count.
    - First hint: The dice know a taller formation than the pyramid.
    - Notes:

31. [ ] **Philatelist** `◇`

    - Rarity: Uncommon.
    - Earned by: Drag five distinct earned stamps to new spots inside the
      album — the one discovery earned in the journal rather than the 3D
      world. Catalog-page and newest-findings-tray arrangements both count.
    - First hint: Even these stamps aren't glued down.
    - Notes:

32. [ ] **Full Journal** `◇`
    - Rarity: Legendary.
    - Earned by: Earn every other Field Note. Awarded in the same moment as
      the final other discovery.
    - First hint: Fill every other page of this journal.
    - Notes:

## Open editorial questions

- Is `Photo Finish` worth keeping despite being limited to keyboard-capable
  devices?

- Should `First Portal` reward ordinary navigation, or should Portals only
  contribute to broader collection progress?

- Which discoveries deserve commissioned silhouettes, and which can reuse a
  stylized rendering of the scene object?
