import { anchorSlug, uniqueAnchor } from "~/lib/anchors";

export type MarkdownNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
};

export function textOfNode(node: MarkdownNode): string {
  if (node.type === "text") return node.value ?? "";
  return node.children?.map(textOfNode).join("") ?? "";
}

/**
 * The newer notes template writes a chapter as a paragraph that is one bold
 * run (`**3: When less of the same is more**`, a trailing colon allowed),
 * the same line `withoutPlaceholders` treats as a chapter label. Returns the
 * label's bold element, or null for any other paragraph.
 */
export function chapterLabelOf(node: MarkdownNode): MarkdownNode | null {
  if (node.type !== "element" || node.tagName !== "p") return null;
  const parts = (node.children ?? []).filter(
    (child) => !(child.type === "text" && /^[\s:]*$/.test(child.value ?? "")),
  );
  const only = parts.length === 1 ? parts[0]! : null;
  return only?.type === "element" && only.tagName === "strong" ? only : null;
}

/**
 * A toggle's summary (a Key Takeaways item), whose words name the toggle's
 * anchor. Null for anything else.
 */
function toggleSummaryOf(node: MarkdownNode): MarkdownNode | null {
  if (node.type !== "element" || node.tagName !== "details") return null;
  return (
    node.children?.find(
      (child) => child.type === "element" && child.tagName === "summary",
    ) ?? null
  );
}

/**
 * Assign heading, chapter-label, and toggle ids in document order before
 * React renders any components. All three share one id set, so a link to any
 * chapter or takeaway in the notes resolves to one element. A toggle's id
 * sits on the toggle itself, which opens when the address names it.
 */
export function rehypeBookHeadingAnchors() {
  return (tree: MarkdownNode) => {
    const ids = new Set<string>();
    function visit(node: MarkdownNode) {
      const anchored =
        node.type === "element" && /^h[1-4]$/.test(node.tagName ?? "")
          ? node
          : (chapterLabelOf(node) ?? toggleSummaryOf(node));
      if (anchored) {
        node.properties = {
          ...node.properties,
          id: uniqueAnchor(anchorSlug(textOfNode(anchored)), ids),
        };
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}
