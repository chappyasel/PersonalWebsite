import { createHash } from "node:crypto";

import type { NotionBlock, RichText } from "~/components/notion/types";

import {
  PUBLIC_SEARCH_INDEX_VERSION,
  type PublicSearchDocument,
  type PublicSearchIndex,
  type PublicSearchTarget,
  isYouTubeUrl,
} from "./public-index-format";

export const PUBLIC_INDEX_SOURCE_NAMES = [
  "manual",
  "routine",
  "blog",
  "projects",
] as const;

export type PublicIndexSourceName = (typeof PUBLIC_INDEX_SOURCE_NAMES)[number];
export type PublicIndexSourceTexts = Record<PublicIndexSourceName, string>;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function objectArray(value: unknown) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function cleanPlainText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blockText(block: NotionBlock): string[] {
  switch (block.type) {
    case "paragraph":
    case "heading":
    case "quote":
      return [richTextText(block.content)];
    case "callout":
      return block.content.flatMap(blockText);
    case "toggle":
      return [richTextText(block.title), ...block.children.flatMap(blockText)];
    case "bulleted_list":
    case "numbered_list":
      return block.items.flatMap((item) => item.flatMap(blockText));
    case "image":
      return [cleanPlainText(block.alt)];
    case "table":
      return [
        ...block.headers.map(cleanPlainText),
        ...block.rows.flatMap((row) =>
          block.headers.map((header) =>
            cleanPlainText(row[header]?.text ?? ""),
          ),
        ),
      ];
    case "divider":
      return [];
  }
}

function richTextText(content: RichText[]) {
  return cleanPlainText(content.map((part) => part.text).join(""));
}

export function extractNotionBlockText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return cleanPlainText(
    value
      .filter(isObject)
      .flatMap((block) => blockText(block as NotionBlock))
      .join(" "),
  );
}

function slug(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "item";
}

function siteTarget(
  site: "home" | "manual" | "routine",
  options: { path?: string; hash?: string } = {},
): PublicSearchTarget {
  return { kind: "site", site, ...options };
}

function destinationTarget(value: unknown): PublicSearchTarget | null {
  const destination = stringValue(value);
  if (!destination || isYouTubeUrl(destination)) return null;
  if (destination.startsWith("/") && !destination.startsWith("//")) {
    return siteTarget("home", { path: destination });
  }

  try {
    const url = new URL(destination);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { kind: "url", url: destination };
  } catch {
    return null;
  }
}

function parseSource(text: string, source: PublicIndexSourceName) {
  try {
    const value = JSON.parse(text) as unknown;
    if (!isObject(value)) throw new Error("root must be an object");
    return value;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(
      `Could not parse public index source ${source}: ${message}`,
    );
  }
}

function manualDocuments(root: JsonObject): PublicSearchDocument[] {
  return objectArray(root.sections).flatMap((section) => {
    const id = stringValue(section.id);
    const label = cleanPlainText(stringValue(section.title));
    if (!id || !label) return [];
    return [
      {
        id: `public:manual:${id}`,
        source: "manual",
        label,
        target: siteTarget("manual", { hash: id }),
        metadata: [],
        body: extractNotionBlockText(section.blocks),
      },
    ];
  });
}

function routineDocuments(root: JsonObject): PublicSearchDocument[] {
  const documents: PublicSearchDocument[] = [];
  const whyEarlyBody = extractNotionBlockText(root.whyEarly);
  if (whyEarlyBody) {
    documents.push({
      id: "public:routine:why-early",
      source: "routine",
      label: "Why So Early?",
      target: siteTarget("routine", { hash: "why-early" }),
      metadata: [],
      body: whyEarlyBody,
    });
  }

  const timeline = isObject(root.timeline) ? root.timeline : {};
  for (const period of ["am", "pm"] as const) {
    const sectionLabel = period === "am" ? "Morning" : "Evening";
    const sectionHash = period === "am" ? "morning" : "evening";
    for (const entry of objectArray(timeline[period])) {
      const label = cleanPlainText(stringValue(entry.title));
      if (!label) continue;
      documents.push({
        id: `public:routine:timeline:${period}:${slug(label)}`,
        source: "routine",
        label,
        target: siteTarget("routine", { hash: sectionHash }),
        metadata: [
          cleanPlainText(stringValue(entry.time)),
          sectionLabel,
        ].filter(Boolean),
        body: extractNotionBlockText(entry.blocks),
      });
    }
  }

  const supplements = isObject(root.supplements) ? root.supplements : {};
  for (const period of ["am", "pm"] as const) {
    const periodLabel = period === "am" ? "Morning Stack" : "Evening Stack";
    for (const supplement of objectArray(supplements[period])) {
      const label = cleanPlainText(stringValue(supplement.name));
      if (!label) continue;
      documents.push({
        id: `public:routine:supplement:${slug(label)}`,
        source: "routine",
        label,
        target: siteTarget("routine", { hash: "supp-stacks" }),
        metadata: [periodLabel],
        body: cleanPlainText(
          [
            stringValue(supplement.dosage),
            stringValue(supplement.benefits),
            stringValue(supplement.costPerDay),
          ].join(" "),
        ),
      });
    }
  }

  for (const section of objectArray(root.rants)) {
    const id = stringValue(section.id);
    const label = cleanPlainText(stringValue(section.title));
    if (!id || !label) continue;
    documents.push({
      id: `public:routine:section:${id}`,
      source: "routine",
      label,
      target: siteTarget("routine", { hash: id }),
      metadata: [],
      body: extractNotionBlockText(section.blocks),
    });
  }
  return documents;
}

function blogDocuments(root: JsonObject): PublicSearchDocument[] {
  return objectArray(root.items).flatMap((post) => {
    const label = cleanPlainText(stringValue(post.title));
    const target = destinationTarget(post.link);
    if (!label || !target) return [];
    const thumbnail = stringValue(post.thumbnail);
    return [
      {
        id: `public:musing:${slug(label)}`,
        source: "musing",
        label,
        target,
        metadata: ["Medium"],
        body: cleanPlainText(stringValue(post.description)),
        ...(thumbnail?.startsWith("https://") && !isYouTubeUrl(thumbnail)
          ? { image: thumbnail }
          : {}),
      },
    ];
  });
}

/** A site-absolute path is used as is; a bare filename is one of the old
 * `public/images/projects` captures. Anything else cannot be trusted as a
 * same-origin image and is dropped. */
function projectImage(imageFile: string) {
  if (imageFile.startsWith("/") && !imageFile.startsWith("//")) {
    return { image: imageFile };
  }
  if (imageFile && !imageFile.includes("/")) {
    return { image: `/images/projects/${imageFile}` };
  }
  return {};
}

function projectDocuments(root: JsonObject): PublicSearchDocument[] {
  return objectArray(root.projects).flatMap((project) => {
    const label = cleanPlainText(stringValue(project.name));
    const target = destinationTarget(project.link);
    if (!label || !target) return [];
    const imageFile = cleanPlainText(stringValue(project.image));
    return [
      {
        id: `public:project:${slug(label)}`,
        source: "project",
        label,
        target,
        metadata: stringArray(project.languages).map(cleanPlainText),
        body: cleanPlainText(stringValue(project.description)),
        ...projectImage(imageFile),
      },
    ];
  });
}

function sourceDigest(sources: PublicIndexSourceTexts) {
  const digest = createHash("sha256");
  for (const name of PUBLIC_INDEX_SOURCE_NAMES) {
    digest.update(name);
    digest.update("\0");
    digest.update(sources[name]);
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function createPublicSearchIndex(
  sources: PublicIndexSourceTexts,
): PublicSearchIndex {
  const parsed = Object.fromEntries(
    PUBLIC_INDEX_SOURCE_NAMES.map((name) => [
      name,
      parseSource(sources[name], name),
    ]),
  ) as Record<PublicIndexSourceName, JsonObject>;

  const documents = [
    ...manualDocuments(parsed.manual),
    ...routineDocuments(parsed.routine),
    ...blogDocuments(parsed.blog),
    ...projectDocuments(parsed.projects),
  ];

  const ids = new Set<string>();
  for (const document of documents) {
    if (ids.has(document.id)) {
      throw new Error(`Duplicate public search document ID: ${document.id}`);
    }
    ids.add(document.id);
  }

  return {
    version: PUBLIC_SEARCH_INDEX_VERSION,
    sourceDigest: sourceDigest(sources),
    documents,
  };
}
