import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

const styles = read("../../../../styles/globals.css");
const primitive = read("../../../../components/ui/tooltip.tsx");
const sound = read("./SoundToggle.tsx");
const details = read("./PlacardLayer.tsx");
const objects = read("./PortalLabel.tsx");
const fieldNotes = read("../fieldNotes/FieldNotesChrome.tsx");
const rail = read("./UnitRail.tsx");
const home = read("../StacksHome.tsx");
const capability = read("../../../../lib/useTapFirstCapability.ts");

describe("tooltip presentation", () => {
  it("uses the Field Notes glass as the global tooltip surface", () => {
    const surface = styles.slice(
      styles.indexOf(".field-notes-glass-tooltip {"),
      styles.indexOf("@font-face"),
    );

    expect(surface).toContain("background-color: rgb(24 32 36 / 0.38)");
    expect(surface).toContain("color: rgb(255 255 255 / 0.96)");
    expect(surface).not.toContain("backdrop-filter:");
    expect(surface).toContain("0 8px 24px rgb(0 0 0 / 0.2)");
    expect(primitive).toContain(
      '"field-notes-glass-tooltip rounded-md border px-3 py-1.5 font-serif text-xs backdrop-blur-xl backdrop-saturate-150"',
    );
    expect(fieldNotes).toContain(
      'className="field-notes-glass-tooltip field-notes-trigger-tooltip z-[2200]',
    );
    expect(sound).toContain("<TooltipContent>");
    expect(details).toContain(
      'className="field-notes-glass-tooltip pointer-events-none',
    );
    expect(objects).toContain("field-notes-glass-tooltip fixed z-30");
    expect(rail).toContain(
      'className="field-notes-glass-tooltip stacks-rail-tooltip',
    );
  });

  it("names compact navigation icons on desktop hover and keyboard focus", () => {
    expect(rail).toContain("const tapFirst = useTapFirstCapability();");
    expect(rail).toContain('role="tooltip"');
    expect(rail).toContain(
      "tapFirst ? undefined : `stacks-rail-tooltip-${unit.slug}`",
    );
    expect(rail).toContain("{!tapFirst && (");
    expect(rail).toContain(
      ".stacks-rail-row:focus-visible .stacks-rail-tooltip",
    );
    expect(rail).toContain(".stacks-rail-row:hover .stacks-rail-tooltip");
  });

  it("does not mount scene tooltip or keycap content for tap-first input", () => {
    expect(capability).toContain('"(hover: none) and (pointer: coarse)"');
    expect(capability).not.toContain("width < 1200px");
    expect(primitive).toContain(
      "if (tooltip && !tooltip.enabled) return null;",
    );
    expect(primitive).toContain("if (!enabled && next) return;");
    expect(details).toContain("{!coarseTouchCapability && (");
    expect(details).toContain(
      'coarseTouchCapability ? undefined : "stacks-details-tooltip"',
    );
  });

  it("keeps typography out of the shared surface", () => {
    const surface = styles.slice(
      styles.indexOf(".field-notes-glass-tooltip {"),
      styles.indexOf("@font-face"),
    );

    expect(surface).not.toMatch(/font-(family|size|style|weight)/);
    expect(fieldNotes).toContain(
      "field-notes-trigger-title field-notes-hand field-notes-strong",
    );
    expect(details).toContain("text-[11px] font-medium tracking-[0.01em]");
    expect(objects).toContain("text-[13px] leading-[1.25]");
  });

  it("sizes focused one-line portal labels to their content", () => {
    expect(objects).toContain("min-h-0");
    expect(objects).not.toContain('focused ? "min-h-12 min-w-12" : "min-h-0"');
    expect(objects).toContain("after:h-12");
    expect(objects).toContain("after:min-w-12");
  });

  it("uses the proven Tailwind backdrop pipeline on every tooltip surface", () => {
    const backdropUtilities = "backdrop-blur-xl backdrop-saturate-150";

    expect(primitive).toContain(backdropUtilities);
    expect(details).toContain(backdropUtilities);
    expect(objects).toContain(backdropUtilities);
  });

  it("puts object-label glass on the positioned compositing node", () => {
    const positionedNode = objects.slice(
      objects.indexOf("<div\n      ref={node}"),
      objects.indexOf(
        ">\n      <style>",
        objects.indexOf("<div\n      ref={node}"),
      ),
    );

    expect(positionedNode).toContain("field-notes-glass-tooltip");
  });

  it("separates live object positioning from the entrance transform", () => {
    expect(objects).toContain('left: "var(--portal-label-x, -10000px)"');
    expect(objects).toContain('top: "var(--portal-label-y, -10000px)"');
    expect(objects).toContain('? "translate(-50%, -100%) scale(1)"');
    expect(objects).toContain(
      ': "translate(-50%, calc(-100% + 6px)) scale(0.96)"',
    );
    expect(objects).not.toContain("translate: visible");
  });

  it("gives object labels a readable fade without delaying the short lift", () => {
    expect(objects).toContain("const TRANSITION_MS = 320");
    expect(objects).toContain('"--portal-label-opacity": visible ? "1" : "0"');
    expect(home).toContain("opacity: var(--portal-label-opacity, 0)");
    expect(home).toContain("opacity 320ms cubic-bezier(0.16, 1, 0.3, 1)");
    expect(home).toContain("transform 210ms cubic-bezier(0.16, 1, 0.3, 1)");
    expect(home).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
