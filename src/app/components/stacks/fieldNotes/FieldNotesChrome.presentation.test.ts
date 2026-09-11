import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./FieldNotesChrome.tsx", import.meta.url),
  "utf8",
);
const homeSource = fs.readFileSync(
  new URL("../StacksHome.tsx", import.meta.url),
  "utf8",
);
const artworkSource = fs.readFileSync(
  new URL("./FieldNoteArtwork.tsx", import.meta.url),
  "utf8",
);

const hint = source.slice(
  source.indexOf("function StampHint"),
  source.indexOf("function StampPaper"),
);
const stampPaper = source.slice(
  source.indexOf("function StampPaper"),
  source.indexOf("function LockedStampMount"),
);
const lockedMount = source.slice(
  source.indexOf("function LockedStampMount"),
  source.indexOf("function stampAriaLabel"),
);
const postageStamp = source.slice(
  source.indexOf("function PostageStamp"),
  source.indexOf("function EmptyStampMount"),
);
const overviewPage = source.slice(
  source.indexOf("function FieldNotesBotanicalSketch"),
  source.indexOf("function StampPage"),
);
const stampPage = source.slice(
  source.indexOf("function StampPage"),
  source.indexOf("function PageTurnButton"),
);
const mobileAward = source.slice(
  source.indexOf("function MobileAwardNotice"),
  source.indexOf("function AwardNotice"),
);
const awardNotice = source.slice(
  source.indexOf("function AwardNotice"),
  source.indexOf("export default function FieldNotesChrome"),
);
const pageTurnKeyframes = source.slice(
  source.indexOf("@keyframes field-notes-turn-next"),
  source.indexOf("@keyframes field-notes-turn-shade"),
);

describe("Field Notes stamp tooltip presentation", () => {
  it("authors a unique visual recipe for every discovery artwork", () => {
    const designBlock = source.slice(
      source.indexOf("const STAMP_DESIGNS"),
      source.indexOf("const STAMP_TILTS"),
    );
    const recipes = [
      ...designBlock.matchAll(
        /^\s{2}(?:"[^"]+"|[\w-]+): \{ palette: (\d+), frame: (\d+), layout: (\d+), pattern: (\d+) \},$/gm,
      ),
    ].map((match) => match.slice(1).join(":"));

    expect(recipes).toHaveLength(39);
    expect(new Set(recipes).size).toBe(recipes.length);
    expect(designBlock).toContain(
      "camera: { palette: 11, frame: 0, layout: 4, pattern: 9 }",
    );
    expect(designBlock).toContain(
      "globe: { palette: 3, frame: 1, layout: 0, pattern: 4 }",
    );
    expect(source).toContain("STAMP_DESIGNS[note.artwork].palette");
    expect(source).toContain("data-artwork={note.artwork}");

    const letteringBlock = source.slice(
      source.indexOf("const STAMP_LETTERING"),
      source.indexOf("const STAMP_TILTS"),
    );
    const letteringStyles = [
      ...letteringBlock.matchAll(/style: "([^"]+)"/g),
    ].map((match) => match[1]);
    expect(letteringStyles).toHaveLength(39);
    expect(new Set(letteringStyles).size).toBe(8);
    expect(letteringBlock).toContain('denomination: "360°"');
    expect(letteringBlock).toContain('primary: "Heavy mail"');
    expect(letteringBlock).toMatch(
      /butterfly: \{[\s\S]*?style: "none",[\s\S]*?primary: null,[\s\S]*?denomination: null,/,
    );

    const iconBlock = source.slice(
      source.indexOf("const STAMP_ICON_TREATMENTS"),
      source.indexOf("const STAMP_TILTS"),
    );
    const iconWeights = [...iconBlock.matchAll(/weight: "([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(iconWeights).toHaveLength(39);
    expect(new Set(iconWeights).size).toBe(6);
    expect(iconBlock).toContain("scale: 1.34");
    expect(iconBlock.match(/echo: true/g)).toHaveLength(16);
    expect(source).toContain("FieldNoteAccentIcon");
    expect(source).toContain("--stamp-icon-rotate");
  });

  it("gives the Vision Pro discoveries distinct abstract artwork", () => {
    expect(artworkSource).toContain('data-field-note-artwork="spatial-lens"');
    expect(artworkSource).toContain(
      'data-field-note-artwork="distortion-field"',
    );
    expect(artworkSource).not.toContain("VirtualRealityIcon");
    expect(artworkSource).not.toContain("GogglesIcon");
    expect(source).toContain('.field-notes-stamp-art[data-artwork="vision"]');
    expect(source).toContain(
      '.field-notes-stamp-art[data-artwork="retro-vision"]',
    );
  });

  it("keeps notification test controls out of the visitor chrome", () => {
    expect(source).not.toContain("Preview stamp ritual");
    expect(source).not.toContain("previewAward");
  });

  it("keeps awards top-center, clears mobile nav, and fades copy before flight", () => {
    expect(mobileAward).toContain(
      'className="field-notes-mobile-award-shell pointer-events-none fixed z-[6100]"',
    );
    expect(awardNotice).toContain(
      'className="field-notes-award-scene pointer-events-none fixed z-[6100]"',
    );
    expect(mobileAward).toContain("return createPortal(");
    expect(mobileAward).toContain("document.body");
    expect(awardNotice).toContain("return createPortal(");
    expect(awardNotice).toContain("document.body");
    expect(source).toMatch(
      /\.field-notes-award-scene \{[\s\S]*?left: 50vw;[\s\S]*?top: max\(4\.75rem, calc\(env\(safe-area-inset-top\) \+ 3\.75rem\)\);[\s\S]*?transform: translateX\(-50%\);/,
    );
    expect(source).toMatch(
      /\.field-notes-mobile-award-shell \{[\s\S]*?left: 50vw;[\s\S]*?top: calc\(env\(safe-area-inset-top\) \+ \.5rem\);[\s\S]*?transform: translateX\(-50%\);/,
    );
    expect(source).not.toContain('"--flight-x-approach"');
    expect(source).not.toContain('"--flight-x-overshoot"');
    expect(source).not.toContain('"--flight-x-rebound"');
    expect(source).toMatch(
      /@keyframes field-notes-award-flight[\s\S]*?70%[\s\S]*?animation-timing-function: cubic-bezier\(\.16,\.72,\.24,1\);[\s\S]*?81%[\s\S]*?var\(--flight-x\)/,
    );
    expect(source).toMatch(
      /@keyframes field-notes-award-copy[\s\S]*?66%[\s\S]*?opacity: \.42;[\s\S]*?69%, 100%[\s\S]*?opacity: 0;/,
    );
  });

  it("keeps the mobile stamp fully opaque until its flight begins", () => {
    expect(source).toMatch(
      /@keyframes field-notes-mobile-award-stamp[\s\S]*?0% \{[\s\S]*?opacity: 1;[\s\S]*?81% \{[\s\S]*?opacity: 1;[\s\S]*?82%, 100% \{[\s\S]*?opacity: 0;/,
    );
  });

  it("sizes both award paper slips intrinsically within viewport-safe clamps", () => {
    expect(mobileAward).toContain("field-notes-mobile-award-copy");
    expect(mobileAward).not.toContain(
      "field-notes-mobile-award-copy absolute bottom-0 left-11 right-0",
    );
    expect(mobileAward).not.toContain("truncate");
    expect(mobileAward).toContain("inline-flex min-h-10");
    expect(awardNotice).toContain("field-notes-award-copy");
    expect(awardNotice).not.toContain("min-w-40");
    expect(awardNotice).not.toContain("truncate");

    expect(source).toMatch(
      /\.field-notes-award-copy,\s*\.field-notes-mobile-award-copy \{[\s\S]*?inline-size: max-content;[\s\S]*?min-inline-size: var\(--field-notes-award-copy-min\);[\s\S]*?max-inline-size: var\(--field-notes-award-copy-max\);[\s\S]*?overflow-wrap: anywhere;/,
    );
    expect(source).toMatch(
      /\.field-notes-award-copy \{[\s\S]*?--field-notes-award-copy-min: min\(9rem, var\(--field-notes-award-paper-viewport-max\)\);[\s\S]*?--field-notes-award-copy-max: min\(20rem, var\(--field-notes-award-paper-viewport-max\)\);/,
    );
    expect(source).toMatch(
      /\.field-notes-mobile-award-copy \{[\s\S]*?--field-notes-award-copy-min: min\(8rem, var\(--field-notes-award-paper-viewport-max\)\);[\s\S]*?--field-notes-award-copy-max: min\(15rem, var\(--field-notes-award-paper-viewport-max\)\);/,
    );
    expect(source).toContain(
      "--field-notes-award-paper-viewport-max: calc(100vw - var(--field-notes-award-stamp-slot) - 2rem);",
    );

    // These shells remain stable flight lanes; the composite owns presentation.
    expect(source).toContain("width: min(15rem, calc(100vw - 2rem));");
    expect(source).toContain("width: min(16rem, calc(100vw - 3.25rem));");
  });

  it("centers the stamp-and-paper union for every intrinsic title width", () => {
    expect(mobileAward).toContain("field-notes-award-composite");
    expect(mobileAward).toContain("field-notes-mobile-award-stamp-slot");
    expect(awardNotice).toContain("field-notes-award-composite");
    expect(awardNotice).toContain("field-notes-desktop-award-stamp-slot");
    expect(source).toMatch(
      /\.field-notes-award-composite \{[\s\S]*?inline-size: max-content;[\s\S]*?inset-inline-start: 50%;[\s\S]*?translate: -50% 0;/,
    );
    expect(source).not.toContain("--field-notes-award-copy-anchor-x");

    const unionBounds = ({
      anchor,
      paperWidth,
      stampAdvance,
      stampWidth,
    }: {
      anchor: number;
      paperWidth: number;
      stampAdvance: number;
      stampWidth: number;
    }) => {
      const compositeWidth = stampAdvance + paperWidth;
      const compositeLeft = anchor - compositeWidth / 2;
      const stampLeft = compositeLeft;
      const stampRight = stampLeft + stampWidth;
      const paperLeft = compositeLeft + stampAdvance;
      const paperRight = paperLeft + paperWidth;
      return {
        left: Math.min(stampLeft, paperLeft),
        right: Math.max(stampRight, paperRight),
        gap: paperLeft - stampRight,
      };
    };

    const geometries = [
      {
        name: "mobile",
        viewport: 320,
        stampWidth: 2.52 * 16,
        stampAdvance: (2.52 + 0.625) * 16,
        paperWidths: [8 * 16, 11.5 * 16, 320 - (2.52 + 0.625) * 16 - 2 * 16],
      },
      {
        name: "desktop",
        viewport: 1200,
        stampWidth: 3.72 * 16,
        stampAdvance: (3.72 + 0.625) * 16,
        paperWidths: [9 * 16, 14 * 16, 20 * 16],
      },
    ];

    for (const geometry of geometries) {
      const anchor = geometry.viewport / 2;
      for (const paperWidth of geometry.paperWidths) {
        const union = unionBounds({
          anchor,
          paperWidth,
          stampAdvance: geometry.stampAdvance,
          stampWidth: geometry.stampWidth,
        });
        expect(
          (union.left + union.right) / 2,
          `${geometry.name} ${paperWidth}px paper`,
        ).toBe(anchor);
        expect(union.left).toBeGreaterThanOrEqual(16);
        expect(union.right).toBeLessThanOrEqual(geometry.viewport - 16);
        expect(union.gap).toBeGreaterThanOrEqual(8);
        expect(union.gap).toBeLessThanOrEqual(12);
      }
    }

    expect(source).toContain("--field-notes-award-stamp-paper-gap: .625rem;");
    expect(source).toContain(
      "--field-notes-award-stamp-slot: calc(var(--field-notes-award-stamp-visible-width) + var(--field-notes-award-stamp-paper-gap));",
    );
    expect(mobileAward).toContain("field-notes-award-text block");
    expect(awardNotice).toContain("field-notes-award-text");
    expect(source).toMatch(
      /\.field-notes-award-text \{[\s\S]*?translate: 0 \.1875rem;/,
    );

    // The implementation being replaced centers only the paper and leaves the
    // stamp at the lane edge; its union midpoint cannot equal the anchor.
    const currentMobileUnion = {
      left: 320 / 2 - (16 * 16) / 2 - 1.75 * 16,
      right: 320 / 2 + (8 * 16) / 2,
    };
    expect((currentMobileUnion.left + currentMobileUnion.right) / 2).not.toBe(
      320 / 2,
    );
  });

  it("renders two counter-rotating rarity sunray layers", () => {
    expect(mobileAward).toContain("data-rarity={note.rarity.toLowerCase()}");
    expect(awardNotice).toContain("data-rarity={note.rarity.toLowerCase()}");
    expect(source).toContain(
      ':is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="uncommon"]',
    );
    expect(source).toContain(
      ':is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="rare"]',
    );
    expect(source).toContain(
      ':is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="legendary"]',
    );
    expect(source).toContain(
      ':is(.field-notes-award-scene, .field-notes-mobile-award-shell)[data-rarity="hidden"]',
    );
    expect(source).toContain("rgba(83,157,111,.28)");
    expect(source).toContain("rgba(63,139,190,.54)");
    expect(source).toContain("rgba(245,184,42,.72)");
    expect(source).toContain("rgba(126,92,158,.46)");
    expect(source).toContain("@keyframes field-notes-award-rays-clockwise");
    expect(source).toContain(
      "@keyframes field-notes-award-rays-counterclockwise",
    );
    expect(source).not.toContain("field-notes-award-rarity-comet");
    expect(source).not.toContain("--field-notes-award-glare");
    expect(source).not.toContain("inset: -2.5rem -2.75rem");
    expect(source).not.toContain("filter: blur(6px)");
    expect(source).not.toContain("drop-shadow(0 0 12px");
    expect(source).toMatch(
      /\.field-notes-award-composite::before \{[\s\S]*?width: 8rem;[\s\S]*?height: 8rem;[\s\S]*?transparent 6deg 21deg[\s\S]*?mask: radial-gradient\(circle, #000 0 30%[\s\S]*?transparent 68%\);[\s\S]*?field-notes-award-rays-clockwise/,
    );
    expect(source).toMatch(
      /\.field-notes-award-composite::after \{[\s\S]*?width: 9\.5rem;[\s\S]*?height: 9\.5rem;[\s\S]*?transparent 10deg 40deg[\s\S]*?mask: radial-gradient\(circle, #000 0 27%[\s\S]*?transparent 67%\);[\s\S]*?field-notes-award-rays-counterclockwise/,
    );
    expect(source).toMatch(
      /@keyframes field-notes-award-rays-clockwise[\s\S]*?52%, 100%[\s\S]*?rotate\(106deg\)/,
    );
    expect(source).toMatch(
      /@keyframes field-notes-award-rays-counterclockwise[\s\S]*?52%, 100%[\s\S]*?rotate\(-82deg\)/,
    );
    expect(source).toMatch(
      /\[data-rarity="common"\] \.field-notes-award-composite::before,[\s\S]*?\[data-rarity="common"\] \.field-notes-award-composite::after \{[\s\S]*?content: none;[\s\S]*?animation: none;/,
    );
    expect(source).toMatch(
      /\[data-rarity="uncommon"\] \{[\s\S]*?--field-notes-award-ray-peak: \.22;[\s\S]*?--field-notes-award-ray-rest: \.07;/,
    );
    expect(source).toMatch(
      /\[data-rarity="legendary"\] \.field-notes-award-composite::before \{[\s\S]*?width: 11rem;[\s\S]*?\[data-rarity="legendary"\] \.field-notes-award-composite::after \{[\s\S]*?width: 13rem;/,
    );
  });

  it("keeps the single-page album compact and shadows the album cover", () => {
    expect(source).toContain("w-[min(28rem,calc(100vw-0.5rem))]");
    expect(source).toContain("md:w-[min(50rem,calc(100vw-1rem))]");
    expect(source).toContain("--field-notes-book-shadow-rest: 0 3px 6px");
    expect(source).toContain("--field-notes-book-shadow-rest: 0 5px 9px");
    expect(source).toMatch(
      /@keyframes field-notes-album-open[\s\S]*?var\(--field-notes-book-shadow-entry\)[\s\S]*?var\(--field-notes-book-shadow-peak\)[\s\S]*?var\(--field-notes-book-shadow-rest\)/,
    );
  });

  it("gives the mounted mobile stage a real enter phase distinct from close", () => {
    const mobileStage = source.slice(
      source.indexOf("function MobileBookStage"),
      source.indexOf("export function CompactAlbum"),
    );

    expect(mobileStage).toContain(
      'data-mobile-entry={entryReady ? "open" : "preparing"}',
    );
    expect(source).toContain(
      '.field-notes-mobile-stage[data-mobile-entry="open"]',
    );
    const openDuration = Number(
      /field-notes-mobile-stage-open (\d+)ms/.exec(source)?.[1],
    );
    const closeDuration = Number(
      /field-notes-mobile-stage-close (\d+)ms/.exec(source)?.[1],
    );
    expect(openDuration).toBe(720);
    expect(closeDuration).toBe(360);
    expect(closeDuration).toBeLessThan(openDuration);
    expect(source).toMatch(
      /\.field-notes-mobile-stage\[data-mobile-entry="preparing"\] \{[\s\S]*?opacity: \.46;[\s\S]*?translateY\(10px\)/,
    );
    expect(source).toMatch(
      /@keyframes field-notes-mobile-stage-open[\s\S]*?0% \{ opacity: \.46;[\s\S]*?38% \{ opacity: \.78;[\s\S]*?74% \{ opacity: \.96;[\s\S]*?90% \{ opacity: \.994;[\s\S]*?100% \{ opacity: 1;/,
    );
    expect(source).toMatch(
      /@keyframes field-notes-mobile-stage-close[\s\S]*?0% \{ opacity: 1;[\s\S]*?58% \{ opacity: \.72;[\s\S]*?82% \{ opacity: \.38;[\s\S]*?94% \{ opacity: \.22;[\s\S]*?100% \{ opacity: \.18;/,
    );
    expect(source).toContain(
      '.field-notes-mobile-stage[data-mobile-entry="preparing"]',
    );
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.field-notes-album\[data-state\] \.field-notes-mobile-stage/,
    );
  });

  it("layers the album above the development diagnostics drawer", () => {
    expect(source).toContain(
      "field-notes-album-overlay bg-[#17212a]/16 fixed inset-0 z-[5000]",
    );
    expect(source).toContain(
      "field-notes-album fixed left-1/2 top-1/2 z-[5001]",
    );
    expect(postageStamp).toContain("zIndex: 6000");
  });

  it("keeps a non-black scrim and album material in every mobile handoff frame", () => {
    expect(source).toContain(
      "field-notes-album-overlay bg-[#17212a]/16 fixed inset-0 z-[5000]",
    );
    expect(source).not.toContain("field-notes-album-overlay bg-black");
    expect(source).toContain(
      "background-color: rgba(87,69,53,.14) !important;",
    );
    expect(source).toMatch(
      /@keyframes field-notes-mobile-overlay-in[\s\S]*?0% \{ opacity: 0; \}[\s\S]*?42% \{ opacity: \.46; \}[\s\S]*?82% \{ opacity: \.9; \}[\s\S]*?94% \{ opacity: \.98; \}[\s\S]*?100% \{ opacity: 1; \}/,
    );
    expect(source).toMatch(
      /@keyframes field-notes-mobile-album-open[\s\S]*?0% \{[\s\S]*?opacity: \.42;[\s\S]*?38% \{[\s\S]*?opacity: \.82;[\s\S]*?72% \{[\s\S]*?opacity: \.96;[\s\S]*?90% \{[\s\S]*?opacity: \.992;[\s\S]*?100% \{[\s\S]*?opacity: 1;/,
    );
    expect(source).toMatch(
      /@keyframes field-notes-mobile-album-close[\s\S]*?0% \{[\s\S]*?opacity: 1;[\s\S]*?58% \{[\s\S]*?opacity: \.74;[\s\S]*?82% \{[\s\S]*?opacity: \.34;[\s\S]*?94% \{[\s\S]*?opacity: \.18;[\s\S]*?100% \{[\s\S]*?opacity: \.14;/,
    );
    expect(source).toMatch(
      /@keyframes field-notes-mobile-overlay-out[\s\S]*?0% \{ opacity: 1; \}[\s\S]*?55% \{ opacity: \.42; \}[\s\S]*?82% \{ opacity: \.14; \}[\s\S]*?94% \{ opacity: \.04; \}[\s\S]*?100% \{ opacity: 0; \}/,
    );
    expect(source.indexOf("<Dialog.Overlay")).toBeLessThan(
      source.indexOf("<Dialog.Content"),
    );
    expect(homeSource).toMatch(
      /@media \(width < 768px\)[\s\S]*?html\[data-field-notes-open\] \.stacks-unit-rail-mobile[\s\S]*?transition-duration: 260ms, 300ms, 240ms;/,
    );
    expect(homeSource).not.toContain(
      "html[data-field-notes-open] .stacks-world-shell",
    );
  });

  it("keeps desktop motion unchanged while mobile open is slower than close", () => {
    expect(source).toContain(
      "animation: field-notes-album-overlay-in 360ms ease-out both",
    );
    expect(source).toContain(
      "animation: field-notes-album-open 560ms cubic-bezier(.18,.82,.22,1) both",
    );
    expect(source).toContain(
      "animation: field-notes-album-close 280ms cubic-bezier(.55,.02,.78,.28) both",
    );
    expect(source).toContain("animation: field-notes-mobile-overlay-in 700ms");
    expect(source).toContain("animation: field-notes-mobile-album-open 760ms");
    expect(source).toContain("animation: field-notes-mobile-album-close 380ms");
  });

  it("keeps Radix's modal focus trap without leaving the page pointer-locked", () => {
    expect(source).toContain("html[data-field-notes-open] body {");
    expect(source).toContain("pointer-events: auto !important;");
    expect(source).toContain(
      "<Dialog.Root open={open} onOpenChange={setOpenWithUrl}>",
    );
    expect(source).not.toContain("<Dialog.Root modal={false}");
  });

  it("places pages above the cover and lets a turning leaf clear the page block", () => {
    expect(source).toContain(
      "-translate-y-1/2 overflow-visible rounded-[1.05rem]",
    );
    expect(source).toContain(
      'className="field-notes-page-block relative overflow-hidden rounded-md border border-[#b9a789]"',
    );
    expect(source).toContain(
      'className="field-notes-page-block overflow-hidden rounded-md border border-[#b9a789]"',
    );
    expect(source).toMatch(
      /\.field-notes-page-block \{[\s\S]*?0 10px 20px rgba\(31,16,9,\.3\);/,
    );
    expect(source).toMatch(
      /\.field-notes-book-stage,[\s\S]*?\.field-notes-mobile-stage \{[\s\S]*?overflow: visible;/,
    );
    expect(source).toContain("50% { transform: rotateY(-90deg); }");
  });

  it("renders the center binding as a recessed gutter", () => {
    expect(source).toContain("width: clamp(2.75rem, 5vw, 4rem)");
    expect(source).toContain("rgba(35,20,12,.28) 49%");
    expect(source).not.toContain("border-left: 1px dashed rgba(92,59,34,.22)");
    expect(source).not.toContain(
      "repeating-linear-gradient(180deg, transparent 0 31px",
    );
    expect(source).toContain("field-notes-page-spread grid grid-cols-2");
    expect(source).toContain("transform: rotateY(1.1deg)");
    expect(source).toContain("transform: rotateY(-1.1deg)");
    expect(source).toContain("translate3d(-50%,0,18px)");
    expect(source).toContain("left-1/2 z-30");
  });

  it("keeps the page spread flat so the tilted pages stay hit-testable", () => {
    // Chromium cannot hit-test rotateY'd children inside a preserve-3d
    // parent: hover on stamps and the botanical sketch silently dies.
    expect(source).not.toMatch(
      /\.field-notes-page-spread \{[^}]*transform-style: preserve-3d/,
    );
  });

  it("keeps navigation and page numbers inside the paper", () => {
    expect(source).toContain("field-notes-in-page-controls");
    expect(source).toContain("field-notes-page-turn-button");
    expect(overviewPage).toContain('<PageFolio number={1} side="left" />');
    expect(stampPage).toContain("<PageFolio");
    expect(stampPage).toContain("number={pageIndex + 1}");
    expect(source).toContain("field-notes-page-number field-notes-hand");
    expect(source).toContain("absolute bottom-5 z-[4]");
    expect(source).toContain(
      "whitespace-nowrap text-sm tabular-nums leading-none",
    );
    expect(source).toContain('"left-7 md:left-10"');
    expect(source).toContain('"right-7 md:right-10"');
    expect(source).toContain("bottom-0 left-1/4 -translate-x-1/2");
    expect(source).toContain("bottom-0 left-3/4 -translate-x-1/2");
    expect(stampPage).toContain("px-2 pb-4");
    expect(stampPage).toContain(
      'className="field-notes-stamp-page-heading mx-auto"',
    );
    expect(source).not.toContain("field-notes-desktop-controls");
    expect(source).not.toContain("field-notes-mobile-controls");
    expect(source).not.toContain("field-notes-page-controls-in");
  });

  it("keeps the page turn on compositor-friendly transforms", () => {
    expect(source).toContain("field-notes-turn-next 880ms linear both");
    expect(source).toContain("field-notes-turn-previous 880ms linear both");
    expect(source).toContain("50% { transform: rotateY(-90deg); }");
    expect(pageTurnKeyframes).not.toContain("translate3d");
    expect(source).not.toMatch(
      /@keyframes field-notes-turn-next[\s\S]*?box-shadow:[\s\S]*?@keyframes field-notes-turn-previous/,
    );
  });

  it("gives the launcher a handwritten label and a reversible book morph", () => {
    expect(source).toContain("field-notes-trigger-title field-notes-hand");
    expect(source).toContain(
      '.field-notes-trigger:hover .field-notes-collection-glyph[data-collecting="false"] .field-notes-mini-album',
    );
    expect(source).toMatch(
      /\.field-notes-mini-album \{[\s\S]*?transition:[\s\S]*?opacity 160ms[\s\S]*?transform 280ms/,
    );
    expect(source).not.toContain("field-notes-mini-album-hover");
  });

  it("portals stamp tooltips outside the clipped album pages", () => {
    expect(postageStamp).toContain("createPortal(");
    expect(postageStamp).toContain("document.body");
    expect(postageStamp).toContain('position: "fixed"');
    expect(postageStamp).toContain("zIndex: 6000");
    expect(postageStamp).toContain("onMouseEnter={() => {");
    expect(postageStamp).toContain("if (!dragSessionRef.current) openHint();");
    expect(postageStamp).toContain("onMouseLeave={closeHint}");
    expect(postageStamp).toContain("onFocus={() => {");
    expect(postageStamp).toContain('event.pointerType !== "touch"');
    expect(hint).toContain('role="tooltip"');
    expect(hint).not.toContain("<TooltipContent");
  });

  it("keeps stamp details on their own readable paper tooltip", () => {
    expect(hint).toContain("field-notes-stamp-tooltip");
    expect(hint).toContain("text-[#362518]");
    expect(hint).toContain("text-[#5b402a]");
    expect(hint).not.toContain("field-notes-glass-tooltip");
    expect(hint).not.toContain("text-white/65");
  });

  it("animates the stamp tooltip in and out with a lingering closing phase", () => {
    expect(hint).toContain("animate-in fade-in-0 zoom-in-95");
    expect(hint).toContain("data-[state=closed]:animate-out");
    expect(hint).toContain("motion-reduce:animate-none");
    expect(hint).toContain("onAnimationEnd");
    expect(postageStamp).toContain('"closed" | "open" | "closing"');
    expect(postageStamp).toContain('{hintPhase !== "closed" &&');
  });

  it("renders earned findings as colorful postage and unearned findings as empty mounts", () => {
    expect(stampPaper).toContain("field-notes-stamp-paper");
    expect(stampPaper).toContain("field-notes-stamp-pattern");
    expect(stampPaper).toContain("field-notes-cancellation");
    expect(lockedMount).toContain("field-notes-discovery-mount");
    expect(lockedMount).toContain("FieldNoteArtworkIcon");
    expect(lockedMount).toContain("titleFor(note, false)");
    expect(lockedMount).toContain("clue inside");
    expect(lockedMount).toContain(
      "field-notes-mount-status field-notes-hand field-notes-strong",
    );
    expect(lockedMount).not.toContain("font-sans");
    expect(lockedMount).not.toContain("field-notes-stamp-paper");
    expect(lockedMount).not.toContain("field-notes-cancellation");
    expect(postageStamp).toContain('data-state={found ? "earned"');
    expect(postageStamp).toContain("data-placed={canMove && placement.placed}");
    expect(postageStamp).toContain("stampAriaLabel(note, found)");
    expect(stampPaper).toContain("weight={icon.weight}");
    expect(stampPaper).toContain("FieldNoteAccentIcon");
    expect(stampPaper).toContain("field-notes-stamp-icon-accent");
    expect(source).toMatch(
      /\.field-notes-stamp-icon-frame > span \{[\s\S]*?translate\(var\(--stamp-icon-x\), var\(--stamp-icon-y\)\)[\s\S]*?scale\(var\(--stamp-icon-scale\)\)/,
    );
    expect(source).toMatch(
      /\.field-notes-postage\[data-state="earned"\][\s\S]*?rotate\(var\(--stamp-tilt\)\)/,
    );
    expect(source).toMatch(
      /\.field-notes-discovery-mount \{[\s\S]*?border: 1px dashed[\s\S]*?inset 0 2px 8px/,
    );
    expect(source).toContain("field-notes-empty-stamp-mount");
    expect(source).toContain("html.dark .field-notes-empty-stamp-mount");
    expect(source).toMatch(
      /\.field-notes-empty-stamp-mount \{[\s\S]*?width: 80%;[\s\S]*?height: 80%;[\s\S]*?margin: 10%;/,
    );
    expect(stampPage).toContain("field-notes-loose-stamp-layer");
    expect(source).not.toContain("the next stamp goes here");
  });

  it("keeps real titles in tooltips and authors varied lettering into earned stamp art", () => {
    expect(stampPaper).not.toContain("{note.title}");
    expect(stampPaper).toContain("STAMP_LETTERING[note.artwork]");
    expect(stampPaper).toContain("field-notes-stamp-primary");
    expect(stampPaper).toContain("field-notes-stamp-secondary");
    expect(stampPaper).toContain("field-notes-stamp-denomination");
    expect(stampPaper).toContain("aria-hidden");
    expect(source).toContain('data-lettering="denomination"');
    expect(source).toContain('data-lettering="poster"');
    expect(source).toContain('data-lettering="vertical"');
    expect(source).toContain('data-lettering="banner"');
    expect(source).toMatch(
      /\.field-notes-stamp-denomination \{[\s\S]*?overflow: visible;[\s\S]*?line-height: 1;/,
    );
    expect(source).toMatch(
      /data-lettering="denomination"\] \.field-notes-stamp-denomination \{[\s\S]*?top: 5px;[\s\S]*?right: 6px;/,
    );
    expect(source).toMatch(
      /data-lettering="denomination"\] \.field-notes-stamp-primary \{[\s\S]*?max-width: calc\(100% - 8px\);/,
    );
    expect(source).not.toContain("max-width: 58%");
    expect(source).not.toContain("field-notes-stamp-imprint");
    expect(hint).toContain("headingFor(note, found)");
  });

  it("keeps the Beacon banner legible on its pale-ink palette", () => {
    const beaconLettering = source.slice(
      source.indexOf("  beacon: {", source.indexOf("const STAMP_LETTERING")),
      source.indexOf("  alarm: {", source.indexOf("const STAMP_LETTERING")),
    );
    expect(beaconLettering).toContain('style: "banner"');
    expect(source).toMatch(
      /data-lettering="banner"\] \.field-notes-stamp-primary \{[\s\S]*?background: color-mix\(in srgb, var\(--stamp-ink\)[\s\S]*?#24170f/,
    );
  });

  it("uses one real foil material for full-size and miniature legendary marks", () => {
    expect(stampPaper).toContain("data-rarity={note.rarity.toLowerCase()}");
    expect(source).toMatch(
      /\.field-notes-stamp-paper\[data-rarity="legendary"\] \{[\s\S]*?background-image: url\("\/images\/stacks\/field-notes-gold-foil\.webp"\);/,
    );
    expect(source).toMatch(
      /\.field-notes-rarity-swatch\[data-rarity="legendary"\] \{[\s\S]*?background-image: url\("\/images\/stacks\/field-notes-gold-foil\.webp"\);/,
    );
    expect(source).not.toContain("field-notes-legendary-foil");
    expect(source).toMatch(
      /\.field-notes-stamp-paper\[data-rarity="legendary"\]::before \{[\s\S]*?border: 2px solid rgba\(107,48,68,\.88\);[\s\S]*?box-shadow: inset 0 0 0 2px/,
    );
    expect(source).not.toContain("0 0 0 5px rgba(119,63,81,.42)");
  });

  it("keeps secret mounts anonymous while exposing useful state to assistive tech", () => {
    expect(lockedMount).toContain('data-kind={hidden ? "secret" : "visible"}');
    expect(lockedMount).toContain('{hidden ? "secret" : "clue inside"}');
    expect(source).toContain(
      'return "Secret finding. Not yet found. No hint available."',
    );
    expect(hint).toContain("headingFor(note, found)");
  });

  it("uses the same paper-slip edge as desktop and mobile notifications", () => {
    expect(hint).toContain("field-notes-paper-slip");
    expect(mobileAward).toContain("field-notes-paper-slip");
    expect(awardNotice).toContain("field-notes-paper-slip");
    expect(source).toMatch(
      /\.field-notes-paper-slip \{[\s\S]*?background-color: rgba\(246,230,200,\.95\);[\s\S]*?border: 1px solid rgba\(142,79,59,\.3\);[\s\S]*?border-radius: \.4rem;/,
    );
    expect(source).toMatch(
      /\.field-notes-paper-slip::after \{[\s\S]*?border: 1px dashed rgba\(142,79,59,\.18\);/,
    );
  });

  it("uses strong handwriting throughout with a larger title", () => {
    expect(hint).toContain("field-notes-hand");
    expect(hint).toContain("field-notes-fine field-notes-strong");
    expect(hint).toContain("text-lg");
    expect(hint).not.toContain("font-sans");
  });

  it("uses the album rarity mark instead of a word badge", () => {
    expect(hint).toContain("field-notes-rarity-swatch");
    expect(hint).toContain("absolute right-3 top-2.5");
    expect(hint).not.toContain("TOOLTIP_RARITY_STYLES");
  });

  it("gives the stamp tooltip and album paper their own ruled treatment", () => {
    expect(source).toContain("--field-notes-rules:");
    expect(source).toMatch(
      /\.field-notes-stamp-tooltip[\s\S]*?var\(--field-notes-rules\)/,
    );
    expect(source).toMatch(
      /\.field-notes-album-paper[\s\S]*?var\(--field-notes-rules\)/,
    );
    expect(source).toContain(
      ".field-notes-award-copy,\n        .field-notes-mobile-award-copy",
    );
    expect(source).not.toContain("repeating-linear-gradient(101deg");
  });

  it("keeps page paper clean instead of covering it in printed speckles", () => {
    expect(source).not.toContain(".field-notes-page::before");
    expect(source).not.toContain("radial-gradient(circle at 18% 11%");
    expect(source).not.toContain("radial-gradient(circle at 19% 31%");
  });

  it("derives every ruled surface from shared line tokens", () => {
    // The shared block defines the tokens once; surfaces only override
    // their line unit and content top, never a hand-tuned rule offset.
    expect(source).toMatch(
      /\.field-notes-stamp-tooltip,\s*\.field-notes-album-paper,\s*\.field-notes-award-copy,\s*\.field-notes-mobile-award-copy \{[\s\S]*?--field-notes-line: 24px;[\s\S]*?--field-notes-content-top: var\(--field-notes-line\);[\s\S]*?--field-notes-rule-gap: 6px;[\s\S]*?--field-notes-rule-step: var\(--field-notes-line\);[\s\S]*?--field-notes-rule-offset: calc\(var\(--field-notes-content-top\) - var\(--field-notes-rule-gap\) \+ 1px - var\(--field-notes-line\)\);/,
    );
    expect(source).not.toContain("--field-notes-rule-step: 24px");
    expect(source).not.toContain("--field-notes-rule-step: 16px");
    expect(source).not.toContain("--field-notes-rule-offset: -5px");
    expect(source).not.toContain("--field-notes-rule-offset: -1px");
    expect(source).toContain('className="field-notes-hand text-lg leading-6"');
    expect(source).toContain("leading-[48px]");
    expect(source).not.toContain("leading-relaxed");

    // The derived offset must ink each rule exactly rule-gap above the
    // bottom of every line box that starts at content-top.
    const ruleSitsOnGrid = (line: number, contentTop: number, gap: number) => {
      const offset = contentTop - gap + 1 - line;
      const boxBottom = contentTop + line;
      return (((boxBottom - gap - (offset - 1)) % line) + line) % line;
    };
    expect(ruleSitsOnGrid(24, 24, 6)).toBe(0);
    expect(ruleSitsOnGrid(20, 8, 6)).toBe(0);
  });

  it("hugs one ruled line per line of tooltip copy", () => {
    // Tooltip geometry: pad + heading line + copy lines + pad, all in the
    // tooltip's own 20px rhythm. One-line hints hug two lines of type in a
    // 56px slip instead of inheriting the page's 24px rhythm plus py-3.
    const TOOLTIP_LINE = 20;
    const TOOLTIP_PAD = 8;
    const tooltipHeight = (copyLines: number) =>
      TOOLTIP_PAD * 2 + TOOLTIP_LINE * (1 + copyLines);
    expect(tooltipHeight(1)).toBe(56);
    expect(tooltipHeight(3)).toBe(96);
    // The replaced geometry: 24px lines with 12px padding on both ends.
    expect(tooltipHeight(1)).toBeLessThan(24 * 2 + 12 * 2);
    expect(tooltipHeight(3)).toBeLessThan(24 * 4 + 12 * 2);

    expect(source).toMatch(
      /\.field-notes-stamp-tooltip \{[\s\S]*?--field-notes-line: 20px;[\s\S]*?--field-notes-content-top: 8px;[\s\S]*?padding-block: var\(--field-notes-content-top\);[\s\S]*?background-image: var\(--field-notes-rules\);/,
    );
    expect(source).toMatch(
      /\.field-notes-stamp-tooltip p \{[\s\S]*?line-height: var\(--field-notes-line\);/,
    );
    // The slip must not reintroduce fixed heights or the page rhythm.
    expect(hint).not.toContain("py-3");
    expect(hint).not.toContain("leading-6");
    expect(hint).not.toContain("min-h");
  });

  it("keeps the album page flow on whole line units at every breakpoint", () => {
    const LINE = 24;
    // Mirrors the tokenized flow: page top pad, then each block's height
    // and margin, all expressed in --field-notes-line units and identical
    // on mobile and desktop.
    const pageTop = LINE; // .field-notes-page padding-top
    const titleLines = 2; // leading-[48px]
    const heroMargin = 2 * LINE; // .field-notes-overview-hero margin-top
    const heroHeight = 5 * LINE; // .field-notes-overview-hero min-height
    const rarityMargin = LINE; // .field-notes-rarity-grid margin-top
    const rarityRows = 2 * LINE; // two rows of 24px .field-notes-fine
    const latestMargin = LINE; // .field-notes-latest-block margin-top

    const titleStart = pageTop;
    const heroStart = titleStart + titleLines * LINE + heroMargin;
    const heroCopyStart = heroStart + LINE; // .field-notes-overview-copy-column
    const rarityStart = heroStart + heroHeight + rarityMargin;
    const latestHeadingStart = rarityStart + rarityRows + latestMargin;
    for (const offset of [
      titleStart,
      heroStart,
      heroCopyStart,
      rarityStart,
      latestHeadingStart,
    ])
      expect(offset % LINE).toBe(0);

    // Stamp pages: top pad + heading line + heading margin = grid top.
    const stampGridTop = pageTop + LINE + LINE;
    expect(stampGridTop).toBe(3 * LINE);

    expect(source).toMatch(
      /\.field-notes-page \{[\s\S]*?padding-top: var\(--field-notes-content-top\);/,
    );
    expect(source).toMatch(
      /\.field-notes-overview-hero \{[\s\S]*?margin-top: calc\(var\(--field-notes-line\) \* 2\);[\s\S]*?min-height: calc\(var\(--field-notes-line\) \* 5\);/,
    );
    expect(source).toMatch(
      /\.field-notes-overview-copy-column \{[\s\S]*?margin-top: var\(--field-notes-line\);/,
    );
    expect(source).toMatch(
      /\.field-notes-rarity-grid \{[\s\S]*?margin-top: var\(--field-notes-line\);/,
    );
    expect(source).toMatch(
      /\.field-notes-latest-block \{[\s\S]*?margin-top: var\(--field-notes-line\);/,
    );
    expect(source).toMatch(
      /\.field-notes-stamp-page-heading \{[\s\S]*?margin-bottom: var\(--field-notes-line\);/,
    );
    expect(source).toContain(
      "--field-notes-stamp-grid-top: calc(var(--field-notes-line) * 3);",
    );
    // Breakpoint-diverging spacers were the mobile drift: none may return.
    expect(source).not.toContain("mt-10");
    expect(source).not.toContain("md:mt-12");
    expect(source).not.toContain("md:mt-5");
    expect(source).not.toContain("md:py-3.5");
    expect(source).not.toContain('md:py-5"');
    expect(source).not.toContain("pt-5 ");
    expect(source).not.toContain("pt-6 ");
  });

  it("scales page copy while keeping it on the notebook rhythm", () => {
    expect(source).toMatch(
      /\.field-notes-overview-page \.field-notes-fine \{[\s\S]*?font-size: 20px;[\s\S]*?line-height: var\(--field-notes-line\);/,
    );
    expect(source).toMatch(
      /\.field-notes-overview-copy \{[\s\S]*?font-size: 22px;[\s\S]*?line-height: var\(--field-notes-line\);/,
    );
    expect(source).toMatch(
      /\.field-notes-stamp-page-heading h2 \{[\s\S]*?font-size: 22px;[\s\S]*?line-height: var\(--field-notes-line\);/,
    );
    expect(source).toMatch(
      /\.field-notes-count-number \{[\s\S]*?font-size: 60px;[\s\S]*?translateY\(3px\)/,
    );
    expect(source).toMatch(
      /\.field-notes-count-caption \{[\s\S]*?translateY\(-3px\)/,
    );
  });

  it("keeps overview stamps at the standard square size", () => {
    expect(source).toContain(".field-notes-overview-page .field-notes-fine");
    expect(source).not.toContain("field-notes-stamp-title");
    expect(source).toMatch(
      /\.field-notes-latest-grid \.field-notes-stamp-slot \{[\s\S]*?aspect-ratio: 1;[\s\S]*?contain: size;/,
    );
    expect(source).toMatch(
      /\.field-notes-stamp-shadow,[\s\S]*?\.field-notes-stamp-art \{[\s\S]*?min-height: 0;[\s\S]*?min-width: 0;/,
    );
  });

  it("aligns overview copy and stamp-page headings to their content", () => {
    expect(source).toContain("field-notes-stamp-page-heading");
    expect(source).toContain(
      "width: calc(3 * var(--field-notes-stamp-size) + .75rem)",
    );
    expect(source).toContain("grid-cols-2 gap-x-5 gap-y-0");
    expect(overviewPage).not.toContain("border-y");
    expect(source).not.toContain("md:gap-y-1.5");
    expect(source).toMatch(
      /\.field-notes-title \{[\s\S]*?translateY\(10px\) rotate\(-1deg\)/,
    );
    expect(source).toContain(".field-notes-overview-copy {");
    // The grid contract replaced the old per-block translateY nudges.
    expect(source).not.toContain("transform: translateY(2px)");
    expect(source).not.toContain("transform: translateY(1px)");
    expect(stampPage).not.toContain("border-b");
  });

  it("puts emphasis on rarity totals instead of rarity names", () => {
    expect(overviewPage).toContain(
      'className="field-notes-fine truncate text-[#4b3524]/65"',
    );
    expect(overviewPage).toContain(
      'className="field-notes-fine field-notes-strong tabular-nums text-[#4b3524]"',
    );
  });

  it("balances the overview page around a botanical notebook sketch", () => {
    expect(overviewPage).toContain("function FieldNotesBotanicalSketch");
    expect(overviewPage).toContain("field-notes-botanical-sketch");
    expect(overviewPage).toContain('aria-label="Botanical sketch"');
    expect(overviewPage).toContain(
      'data-rustling={rustling ? "true" : "false"}',
    );
    expect(overviewPage).toContain(
      "field-notes-overview-hero flex items-center gap-5 md:gap-6",
    );
    expect(overviewPage).toContain("field-notes-overview-copy");
    expect(overviewPage).toContain('pathLength="1"');
    expect(overviewPage).toContain(
      "field-notes-latest-block flex min-h-0 flex-1 flex-col",
    );
    expect(source).toContain("@keyframes field-notes-botanical-draw-hover");
    expect(source).toContain("@keyframes field-notes-botanical-draw-click");
    expect(source).not.toContain("field-notes-botanical-rustle");
    expect(source).toContain(
      ".field-notes-botanical-sketch svg path:nth-child(11) { animation-delay: 450ms; }",
    );
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.field-notes-botanical-sketch svg/,
    );
    expect(overviewPage).not.toContain("✦");
    expect(overviewPage).not.toContain("mt-auto pt-4");
  });

  it("lets the album commemorate 10, 20, and the live catalog total", () => {
    expect(overviewPage).toContain("fieldNotesMilestone(count)");
    expect(overviewPage).toContain("data-milestone={milestone}");
    expect(overviewPage).toContain("field-notes-botanical-color");
    expect(overviewPage).toContain("field-notes-botanical-butterfly");
    expect(overviewPage).not.toContain("field-notes-milestone-ribbon");
    expect(overviewPage).toContain("field-notes-completion-seal");
    expect(overviewPage).toContain("Field journal complete");
    expect(source).toContain('count === FIELD_NOTES.length) return "complete"');
    expect(source).toContain("@keyframes field-notes-completion-foil");
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.field-notes-completion-foil::after/,
    );
  });

  it("shows three movable newest findings over stamp-page-identical mounts", () => {
    expect(overviewPage).toContain("newest findings");
    expect(source).not.toContain("newest stamps");
    expect(overviewPage).toContain(".slice(0, 3)");
    expect(overviewPage).toContain("Array.from({ length: 3 }");
    expect(overviewPage).toContain('placementScope="overview"');
    expect(overviewPage).toContain(
      "field-notes-loose-stamp-layer pointer-events-none absolute inset-0 z-[2]",
    );
    // The tray reuses the stamp pages' home-position formulas, so its grid
    // must share their column and gap metrics and pin its own grid top.
    expect(source).toMatch(
      /\.field-notes-latest-grid \{[\s\S]*?grid-template-columns: repeat\(3, var\(--field-notes-stamp-size\)\);[\s\S]*?column-gap: var\(--field-notes-stamp-gap-x\);/,
    );
    expect(source).toMatch(
      /\.field-notes-latest-tray \{[\s\S]*?--field-notes-stamp-grid-top: 8px;/,
    );
    expect(overviewPage).toContain("field-notes-latest-tray relative py-2");
    expect(source).toMatch(
      /\.field-notes-latest-tray \.field-notes-loose-stamp-layer \{[\s\S]*?overflow: visible;/,
    );
  });

  it("folds mobile pages over one spine edge and keeps the settled page", () => {
    const mobileStage = source.slice(
      source.indexOf("function MobileBookStage"),
      source.indexOf("export function CompactAlbum"),
    );

    // The settled page always lives in the static block: forward turns
    // reveal the target beneath the lifting leaf; backward turns keep the
    // outgoing page beneath the leaf folding down over it.
    expect(mobileStage).toMatch(
      /const visiblePage = turn\s*\? turn\.direction === "next"\s*\? turn\.to\s*: turn\.from\s*: page;/,
    );
    expect(mobileStage).toMatch(
      /const leafPage = turn\s*\? turn\.direction === "next"\s*\? turn\.from\s*: turn\.to\s*: null;/,
    );
    expect(mobileStage).not.toContain("field-notes-turn-face");

    // One consistent edge: both directions rotate about the left spine.
    expect(source).toMatch(
      /\.field-notes-mobile-turn-leaf \{[\s\S]*?transform-origin: left center;/,
    );
    expect(source).not.toMatch(
      /\.field-notes-mobile-turn-leaf\[data-direction="previous"\] \{[^}]*transform-origin/,
    );
    expect(source).toContain(
      "animation: field-notes-mobile-turn-next 460ms cubic-bezier(.5,.1,.65,.3) both;",
    );
    expect(source).toContain(
      "animation: field-notes-mobile-turn-previous 460ms cubic-bezier(.25,.6,.3,1) both;",
    );

    // The fold stops edge-on rather than sweeping 180deg outside the
    // one-page viewport, and the previous leaf hands off at exactly 0deg.
    expect(source).toMatch(
      /@keyframes field-notes-mobile-turn-next \{[\s\S]*?0% \{ opacity: 1; transform: rotateY\(0deg\); \}[\s\S]*?100% \{ opacity: 0; transform: rotateY\(-88deg\); \}/,
    );
    expect(source).toMatch(
      /@keyframes field-notes-mobile-turn-previous \{[\s\S]*?0% \{ opacity: 0; transform: rotateY\(-88deg\); \}[\s\S]*?100% \{ opacity: 1; transform: rotateY\(0deg\); \}/,
    );
    expect(source).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.field-notes-mobile-turn-leaf \{[\s\S]*?animation-duration: 1ms;/,
    );
  });

  it("owns mobile touch gestures without stealing stamp drags", () => {
    const mobileStage = source.slice(
      source.indexOf("function MobileBookStage"),
      source.indexOf("export function CompactAlbum"),
    );

    expect(source).toMatch(
      /\.field-notes-mobile-stage \{[\s\S]*?touch-action: none;/,
    );
    expect(mobileStage).toContain('if (event.pointerType === "mouse"');
    expect(mobileStage).toContain(
      "closest?.('.field-notes-postage[data-movable=\"true\"]')",
    );
    expect(mobileStage).toContain(
      "event.currentTarget.setPointerCapture?.(event.pointerId)",
    );
    expect(mobileStage).toContain("releaseAlbumSwipe");
    expect(mobileStage).toContain("onDismiss");
  });
});
