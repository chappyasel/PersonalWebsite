import { anchorSlug, uniqueAnchor } from "~/lib/anchors";

type MarkdownNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
};

function textOfNode(node: MarkdownNode): string {
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(textOfNode).join("") ?? "";
}

/** Assign heading ids in document order before React renders any components. */
export function rehypeBookHeadingAnchors() {
  return (tree: MarkdownNode) => {
    const ids = new Set<string>();
    function visit(node: MarkdownNode) {
      if (node.type === "element" && /^h[1-4]$/.test(node.tagName ?? "")) {
        node.properties = {
          ...node.properties,
          id: uniqueAnchor(anchorSlug(textOfNode(node)), ids),
        };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
