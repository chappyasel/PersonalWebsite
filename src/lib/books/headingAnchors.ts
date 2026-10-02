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
export function toggleSummaryOf(node: MarkdownNode): MarkdownNode | null {
  if (node.type !== "element" || node.tagName !== "details") return null;
  return (
    node.children?.find(
      (child) => child.type === "element" && child.tagName === "summary",
    ) ?? null
  );
}

/**
 * Takeaway summaries are often whole sentences. Their ids stop at a word
 * boundary near this length, which keeps shared links readable and well
 * inside the 255 characters a stored passage anchor allows.
 */
const MAX_TOGGLE_ANCHOR = 64;

function capSlug(slug: string): string {
  if (slug.length <= MAX_TOGGLE_ANCHOR) return slug;
  const cut = slug.slice(0, MAX_TOGGLE_ANCHOR + 1);
  const boundary = cut.lastIndexOf("-");
  return (boundary > 0 ? cut.slice(0, boundary) : cut).replace(/-+$/, "");
}

/**
 * Assign heading, chapter-label, and toggle ids before React renders any
 * components. Headings and labels take theirs first, in document order,
 * exactly as before toggles had ids, so an existing chapter link never moves
 * to a takeaway of the same name; toggles then take what is left. All share
 * one id set, so a link to any chapter or takeaway resolves to one element.
 * A toggle's id sits on the toggle itself, which opens when the address
 * names it.
 */
export function rehypeBookHeadingAnchors() {
  return (tree: MarkdownNode) => {
    const ids = new Set<string>();
    const toggles: Array<{ node: MarkdownNode; summary: MarkdownNode }> = [];
    function visit(node: MarkdownNode) {
      const chapter =
        node.type === "element" && /^h[1-4]$/.test(node.tagName ?? "")
          ? node
          : chapterLabelOf(node);
      const summary = toggleSummaryOf(node);
      if (chapter) {
        node.properties = {
          ...node.properties,
          id: uniqueAnchor(anchorSlug(textOfNode(chapter)), ids),
        };
      } else if (summary) toggles.push({ node, summary });
      node.children?.forEach(visit);
    }
    visit(tree);
    for (const { node, summary } of toggles) {
      node.properties = {
        ...node.properties,
        id: uniqueAnchor(capSlug(anchorSlug(textOfNode(summary))), ids),
      };
    }
  };
}
