/**
 * The paper half of the placard glass comparison.
 *
 * Native retains the authored browser backdrop. Paper is a genuinely opaque
 * reading material rather than a translucent approximation of one, so
 * detailed foliage moving behind the sheet can never colour or texture it —
 * and, more to the point, the browser never runs a backdrop filter over a
 * moving 3D scene, which is what made the comparison worth having.
 *
 * The two grain layers are repeating gradients at deliberately unrelated
 * angles: a single angle reads as corduroy, and two coprime ones read as
 * paper. The top highlight is the sheet catching the room's key light.
 *
 * Kept as its own module because the scoping is the contract. Every rule is
 * scoped to `[data-stacks-glass-mode="paper"]`, so switching the mode back is
 * a single attribute write with no leftovers.
 */
export const PLACARD_PAPER_SURFACE_CSS = `
        [data-stacks-glass-mode="paper"] [data-stacks-desktop-panel] [data-placard-surface],
        [data-stacks-glass-mode="paper"] .stacks-sheet,
        [data-stacks-glass-mode="paper"] .stacks-chip {
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }
        [data-stacks-glass-mode="paper"] [data-stacks-desktop-panel] [data-placard-surface],
        [data-stacks-glass-mode="paper"] .stacks-sheet,
        [data-stacks-glass-mode="paper"] .stacks-chip {
          --sheet-fill: rgb(244 241 233);
          background-color: var(--sheet-fill) !important;
          background-image:
            linear-gradient(180deg, rgb(255 255 255 / 0.56), transparent 22%),
            repeating-linear-gradient(97deg, rgb(92 70 43 / 0.018) 0 1px, transparent 1px 5px),
            repeating-linear-gradient(7deg, rgb(92 70 43 / 0.012) 0 1px, transparent 1px 7px) !important;
        }
        .dark [data-stacks-glass-mode="paper"] [data-stacks-desktop-panel] [data-placard-surface],
        .dark [data-stacks-glass-mode="paper"] .stacks-sheet,
        .dark [data-stacks-glass-mode="paper"] .stacks-chip {
          --sheet-fill: rgb(35 33 30);
          background-image:
            linear-gradient(180deg, rgb(255 255 255 / 0.055), transparent 22%),
            repeating-linear-gradient(97deg, rgb(255 244 224 / 0.018) 0 1px, transparent 1px 5px),
            repeating-linear-gradient(7deg, rgb(255 244 224 / 0.012) 0 1px, transparent 1px 7px) !important;
        }`;

export type CssRule = Readonly<{
  selectors: readonly string[];
  declarations: ReadonlyMap<string, string>;
}>;

/**
 * Read a flat block of CSS into rules.
 *
 * Deliberately not a general parser: it handles the one shape this module
 * emits (no nesting, no at-rules) so tests can ask what a selector actually
 * declares instead of matching formatted text. Multi-line values such as a
 * stacked `background-image` are collapsed onto one line.
 */
export function readCssRules(css: string): readonly CssRule[] {
  return css
    .split("}")
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.includes("{"))
    .map((chunk) => {
      const [prelude = "", body = ""] = chunk.split("{");
      const declarations = new Map<string, string>();
      for (const declaration of body.split(";")) {
        const separator = declaration.indexOf(":");
        if (separator === -1) continue;
        declarations.set(
          declaration.slice(0, separator).trim(),
          declaration
            .slice(separator + 1)
            .replace(/\s+/g, " ")
            .trim(),
        );
      }
      return {
        selectors: prelude
          .split(",")
          .map((selector) => selector.replace(/\s+/g, " ").trim())
          .filter(Boolean),
        declarations,
      };
    });
}
