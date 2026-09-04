/**
 * Phosphor glyphs for the satori-rendered OG cards.
 *
 * Satori draws an inline <svg> by serialising the element tree into a data
 * URI, and that serialiser only understands host elements. Three things go
 * wrong when it meets a Phosphor component as-is: the satori that next/og
 * bundles (0.15) skips forwardRef components without a word, satori 0.19
 * calls them but then throws on the Fragment Phosphor wraps its paths in,
 * and both print Phosphor's `transform: undefined` as transform="undefined",
 * which the wasm resvg rejects wholesale. So resolve the component here and
 * hand satori a plain <svg> of <path>s.
 *
 * `fill="currentColor"` survives: satori swaps it for the inherited CSS
 * color, so either pass `color` or set one on the parent.
 */
import type { Icon, IconWeight } from "@phosphor-icons/react";
import React, { type ReactElement, type ReactNode } from "react";

type ForwardRefLike = { render: (props: unknown, ref: null) => ReactNode };
type FunctionLike = (props: unknown) => ReactNode;

function isForwardRef(type: unknown): type is ForwardRefLike {
  return (
    typeof type === "object" &&
    type !== null &&
    "render" in type &&
    typeof (type as ForwardRefLike).render === "function"
  );
}

export function phosphorSvg(
  Glyph: Icon,
  {
    size,
    weight = "duotone",
    color,
  }: { size: number; weight?: IconWeight; color?: string },
): ReactElement {
  let node: ReactNode = React.createElement(Glyph, { size, weight });
  // Phosphor is two components deep (icon, then SSRBase); 8 is a guard.
  for (let depth = 0; depth < 8; depth++) {
    if (!React.isValidElement(node) || typeof node.type === "string") break;
    const type: unknown = node.type;
    const props: unknown = node.props;
    if (typeof type === "function") node = (type as FunctionLike)(props);
    else if (isForwardRef(type)) node = type.render(props, null);
    else throw new Error(`Unexpected element type: ${String(type)}`);
  }
  if (!React.isValidElement(node) || node.type !== "svg") {
    throw new Error("Phosphor icon did not resolve to an <svg>");
  }
  const props = node.props as Record<string, unknown>;
  const attrs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || key === "ref" || value === undefined) continue;
    attrs[key] = value;
  }
  if (color) attrs.style = { color };
  return React.createElement(
    "svg",
    attrs,
    ...flattenFragments(props.children as ReactNode),
  );
}

function flattenFragments(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  for (const child of React.Children.toArray(children)) {
    if (
      React.isValidElement(child) &&
      (child.type as unknown) === React.Fragment
    ) {
      out.push(
        ...flattenFragments((child.props as { children?: ReactNode }).children),
      );
    } else {
      out.push(child);
    }
  }
  return out;
}
