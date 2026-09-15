/**
 * The light mobile sheet's shell.
 *
 * Daylight is the hard case for a sheet over this room. The pale material
 * this replaces took its separation from a white fill, and a white fill over
 * a bright meadow has nothing left to lift: the sheet went the same value as
 * the sky behind it and its collapsed pill read denser than the sheet it
 * belonged to. Going dark inverts the problem. The room is mostly light, so a
 * dark shell separates by contrast rather than by piling on opacity, and the
 * blur still carries the meadow's colour through it.
 *
 * The fill, foreground, and backdrop are the Field Notes tooltip's, copied
 * from `html[data-world] [data-home-glass="floating"]` in globals.css, which
 * is the one surface on the site that already had to hold dark glass over
 * daylight. Copied rather than shared: the tooltip is a small floating chip
 * and the sheet is a full-width panel, and the day one of them wants a
 * different value it should not drag the other with it.
 *
 * Scoping is the contract, and all three parts of it matter:
 *
 *   - `@media (width < 1200px)` — desktop keeps its own dock material.
 *   - `html:not(.dark)` — night already has a dark shell that works.
 *   - `[data-stacks-glass-mode="native"]` — the diagnostic paper mode is an
 *     opaque reading surface and must stay able to override this.
 *
 * Kept out of PlacardLayer's own style block so those three conditions stay
 * legible in one place rather than as another nested media query in a
 * thousand-line stylesheet.
 */
export const MOBILE_SHEET_LIGHT_MATERIAL_CSS = `
  @media (width < 1200px) {
    html:not(.dark) [data-stacks-glass-mode="native"] {
      /* Captured on the layer, above the panel's own foreground override
         below, so the cards can put the room's ordinary ink back. Reading
         --foreground here resolves to the light theme's value; reading it
         inside the panel would resolve to the white the panel just set. */
      --mobile-card-foreground: var(--foreground);
      --mobile-card-muted-foreground: var(--muted-foreground);
    }
    html:not(.dark) [data-stacks-glass-mode="native"] [data-stacks-mobile-panel] {
      --foreground: 0 0% 96%;
      --muted-foreground: 0 0% 82%;
      color: hsl(var(--foreground));
    }
    html:not(.dark) [data-stacks-glass-mode="native"] :is(.stacks-sheet, .stacks-chip) {
      --sheet-fill: rgb(24 32 36 / 0.38);
      --placard-edge-top: rgb(255 255 255 / 0.24);
      --placard-edge-reflection-top: rgb(255 255 255 / 0.09);
      --placard-edge-bottom: rgb(255 255 255 / 0.09);
      background-color: var(--sheet-fill);
      /* The sheet's own brightness cancels the expanding scrim, so it rises
         from 1.18 to 1.686 as the sheet travels. Divide by the 1.18 it rests
         at to recover that scrim compensation alone, then apply this shell's
         own 0.62. The dark glass tracks the scrim without inheriting the
         pale material's resting lift. */
      backdrop-filter: blur(24px) saturate(1.5) brightness(calc(var(--sheet-light-brightness, 1.18) / 1.18 * 0.62));
      -webkit-backdrop-filter: blur(24px) saturate(1.5) brightness(calc(var(--sheet-light-brightness, 1.18) / 1.18 * 0.62));
      color: rgb(255 255 255 / 0.96);
    }
    html:not(.dark) [data-stacks-glass-mode="native"] :is(.stacks-sheet, .stacks-chip)::before,
    html:not(.dark) [data-stacks-glass-mode="native"] :is(.stacks-sheet, .stacks-chip)::after {
      opacity: 1;
    }
    html:not(.dark) [data-stacks-glass-mode="native"] :is([data-stacks-mobile-intro="header"] > button, .stacks-sheet-grabber, .stacks-chip) {
      color: rgb(255 255 255 / 0.96);
      text-decoration-color: rgb(255 255 255 / 0.6);
    }
    html:not(.dark) [data-stacks-glass-mode="native"] .stacks-sheet-grabber > span {
      background-color: rgb(255 255 255 / 0.45);
    }
    html:not(.dark) [data-stacks-glass-mode="native"] [data-stacks-mobile-panel] [data-placard-surface],
    html:not(.dark) [data-stacks-glass-mode="native"] [data-stacks-mobile-panel] [data-placard-surface] ~ * {
      --foreground: var(--mobile-card-foreground);
      --muted-foreground: var(--mobile-card-muted-foreground);
      color: hsl(var(--foreground));
    }
    /* The dark shell crushes the room to 0.045 + 0.384x, so no card fill can
       reproduce the desktop plate's 0.579 slope over it; the most a card can
       do here is stop being a painted rectangle. At 0.9 this was 0.885 +
       0.038x — flat to within a percent of the room's whole range. The floor
       is the card's own dark ink: 4.5:1 against hsl(var(--foreground)) over
       the darkest scene needs the card at 0.653 or lighter, which puts the
       fill at 0.651. 0.68 clears it at 4.8:1 and triples the room's reach
       into the card. Raise it toward 0.72 (5.4:1) if that margin reads thin
       on a real phone. */
    html:not(.dark) [data-stacks-glass-mode="native"] [data-stacks-mobile-panel] [data-placard-surface] {
      background-color: hsl(var(--card) / 0.68) !important;
    }
    /* Hover has to lift the card, not sink it. The shared narrow-width tint
       is rgb(235 232 225 / 0.44), authored when these cards sat on the pale
       sheet and 0.44 of a near-white was more fill than they rested at. Over
       the dark shell the same declaration reads as a hole: the card drops
       from 0.713 to 0.485, darker than its own resting value and pointing
       the wrong way about what hover means.
       Desktop is the model. There the plate rests at a 0.22 white fill and
       hovers at 0.30, about +0.05 in rendered luminance. Going 0.68 -> 0.74
       of the same card colour gives +0.05 over this shell, so the two
       gestures agree without sharing a number that cannot mean the same
       thing on both materials. */
    html:not(.dark) [data-stacks-glass-mode="native"] .placard-scroll [data-placard-link]:hover [data-placard-surface],
    html:not(.dark) [data-stacks-glass-mode="native"] .placard-scroll [data-placard-link]:focus-visible [data-placard-surface],
    html:not(.dark) [data-stacks-glass-mode="native"] .placard-scroll a:hover [data-placard-surface],
    html:not(.dark) [data-stacks-glass-mode="native"] .placard-scroll a[data-placard-surface]:hover,
    html:not(.dark) [data-stacks-glass-mode="native"] .placard-scroll a:focus-visible [data-placard-surface],
    html:not(.dark) [data-stacks-glass-mode="native"] .placard-scroll a[data-placard-surface]:focus-visible {
      background-color: hsl(var(--card) / 0.74) !important;
    }
    html:not(.dark) [data-stacks-glass-mode="native"] .stacks-chip:is(:active, [data-pressed]) {
      background-color: color-mix(in srgb, var(--sheet-fill), black 12%);
    }
  }
`;
