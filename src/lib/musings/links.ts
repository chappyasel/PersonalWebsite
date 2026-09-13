import { MEDIUM_SLUGS } from "./migration-slugs";
import { type MusingBlock, musingPath } from "./types";

const migratedSlugs = new Map(Object.entries(MEDIUM_SLUGS));

export function localizeMusingLinks(
  blocks: MusingBlock[],
  mediumSlugs: Map<string, string>,
): MusingBlock[] {
  const local = (href: string) => localMusingHref(href, mediumSlugs);
  return blocks.map((block) => {
    if (block.type === "divider" || block.type === "code") return block;
    if (block.type === "image")
      return {
        ...block,
        caption: block.caption.map((r) =>
          r.link ? { ...r, link: local(r.link) } : r,
        ),
      };
    return {
      ...block,
      content: block.content.map((r) =>
        r.link ? { ...r, link: local(r.link) } : r,
      ),
      ...(block.type === "link" ? { url: local(block.url) } : {}),
      ...("children" in block && block.children
        ? { children: localizeMusingLinks(block.children, mediumSlugs) }
        : {}),
    };
  });
}

export function localMusingHref(href: string, mediumSlugs = migratedSlugs) {
  try {
    const url = new URL(href);
    if (
      url.hash ||
      !(url.hostname === "medium.com" || url.hostname.endsWith(".medium.com"))
    )
      return href;
    const id = /(?:-|\/p\/)([a-f0-9]{12})$/.exec(url.pathname)?.[1];
    const slug = id && mediumSlugs.get(id);
    return slug ? musingPath(slug) : href;
  } catch {
    return href;
  }
}
