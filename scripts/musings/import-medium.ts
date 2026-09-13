import type {
  BlockObjectRequest,
  CreatePageParameters,
  UpdateDataSourceParameters,
} from "@notionhq/client/build/src/api-endpoints";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

import { type MediumArticle, parseMedium, richText } from "./medium";
import {
  MUSINGS_DATA_SOURCE,
  limited,
  notionClient,
  queryPages,
  readBlocks,
} from "./notion";

const root = process.argv.find((a) => a.startsWith("--export="))?.slice(9);
if (!root)
  throw new Error(
    "Usage: pnpm import:medium --export=/path/to/export [--apply]",
  );
const apply = process.argv.includes("--apply");
const stateDir = join(process.cwd(), "data/musings-import");
await mkdir(stateDir, { recursive: true });
const articles: MediumArticle[] = [];
let excluded = 0;
for (const file of (await readdir(join(root, "posts"))).sort()) {
  if (!file.endsWith(".html")) continue;
  const article = parseMedium(
    await readFile(join(root, "posts", file), "utf8"),
  );
  if (article) articles.push(article);
  else excluded++;
}
if (!articles.length) throw new Error("No published articles found");
if (articles.some((a) => a.missingEmbeds.length))
  throw new Error(
    "Export contains missing embeds. Recover their destinations before importing.",
  );
if (new Set(articles.map((a) => a.slug)).size !== articles.length)
  throw new Error("Duplicate article slugs");
await writeFile(join(stateDir, "plan.json"), JSON.stringify(articles, null, 2));
console.log(
  `${articles.length} articles; ${excluded} replies or unpublished entries excluded.`,
);
for (const a of articles)
  console.log(
    `${a.slug}: ${a.blocks.length} blocks, ${a.imageUrls.length} images`,
  );
if (!apply) process.exit(0);

const notion = notionClient();
const schema = await limited(() =>
  notion.dataSources.retrieve({ data_source_id: MUSINGS_DATA_SOURCE }),
);
const additions: UpdateDataSourceParameters["properties"] = {};
for (const name of ["Slug", "Summary", "Author"]) {
  if (schema.properties[name] && schema.properties[name].type !== "rich_text")
    throw new Error(`Unexpected type for ${name}`);
  if (!schema.properties[name]) additions[name] = { rich_text: {} };
}
if (
  schema.properties["Medium URL"] &&
  schema.properties["Medium URL"].type !== "url"
)
  throw new Error("Unexpected Medium URL type");
if (!schema.properties["Medium URL"]) additions["Medium URL"] = { url: {} };
if (Object.keys(additions).length)
  await limited(() =>
    notion.dataSources.update({
      data_source_id: MUSINGS_DATA_SOURCE,
      properties: additions,
    }),
  );
const pages = await queryPages(notion);
const stateFile = join(stateDir, "state.json");
type State = Record<string, { pageId: string; complete: boolean }>;
let state: State = {};
try {
  state = JSON.parse(await readFile(stateFile, "utf8")) as State;
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const save = () => writeFile(stateFile, JSON.stringify(state, null, 2));

for (const article of articles) {
  const matching = pages.filter((p) => {
    const prop = p.properties["Medium URL"];
    return prop?.type === "url" && prop.url === article.mediumUrl;
  });
  if (matching.length > 1)
    throw new Error(`Duplicate imported source: ${article.slug}`);
  let record = state[article.mediumId];
  if (!record && matching[0]) {
    // Recover a create response lost before its ID reached the local journal.
    const p = matching[0];
    record = state[article.mediumId] = {
      pageId: p.id,
      complete:
        p.properties.Musing?.type === "checkbox" &&
        p.properties.Musing.checkbox,
    };
    await save();
  }
  if (record?.complete) {
    console.log(`Already imported: ${article.slug}`);
    continue;
  }
  if (!record) {
    const properties: CreatePageParameters["properties"] = {
      Title: { title: richText(article.title) },
      Musing: { checkbox: false },
      ...((schema.properties["Blog Post"] ?? schema.properties["Blog Post?"])
        ? {
            [(schema.properties["Blog Post"] ??
              schema.properties["Blog Post?"])!.id]: { checkbox: true },
          }
        : {}),
      Status: { status: { name: "Posted" } },
      Date: { date: { start: article.publishedAt } },
      Slug: { rich_text: richText(article.slug) },
      Summary: { rich_text: richText(article.summary) },
      Author: { rich_text: richText(article.author) },
      "Medium URL": { url: article.mediumUrl },
    };
    const page = await limited(() =>
      notion.pages.create({
        parent: { type: "data_source_id", data_source_id: MUSINGS_DATA_SOURCE },
        properties,
      }),
    );
    record = state[article.mediumId] = { pageId: page.id, complete: false };
    await save();
  }
  const existing = await readBlocks(notion, record.pageId);
  if (existing.length > article.blocks.length)
    throw new Error(
      `Unexpected content in incomplete import ${article.slug}; inspect before resuming`,
    );
  // Only this import's own, still-unchecked pages may be resumed. Check all
  // existing block types and text before appending after an interrupted request.
  for (let i = 0; i < existing.length; i++) {
    const expected = article.blocks[i]!;
    const actual = existing[i]!;
    if (expected.type !== actual.type)
      throw new Error(`Import content changed: ${article.slug}`);
    const rich = (b: object, type: string) => {
      const value = (
        b as Record<
          string,
          { rich_text?: Array<{ text?: { content: string } }> }
        >
      )[type];
      return value?.rich_text?.map((r) => r.text?.content ?? "").join("");
    };
    if (rich(expected, actual.type) !== rich(actual, actual.type))
      throw new Error(`Import text changed: ${article.slug}`);
  }
  for (let offset = existing.length; offset < article.blocks.length; ) {
    const batch: BlockObjectRequest[] = [];
    // Keep request payloads comfortably below the API's size limit.
    for (const block of article.blocks.slice(offset, offset + 25)) {
      if (block.type !== "image" || block.image.type !== "external") {
        batch.push(block);
        continue;
      }
      const url = block.image.external.url;
      const hash = createHash("sha256").update(url).digest("hex").slice(0, 20);
      const path = join(stateDir, `${hash}.image`);
      let bytes: Buffer;
      try {
        bytes = await readFile(path);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok)
          throw new Error(
            `Image download failed: ${response.status} in ${article.slug}`,
          );
        bytes = Buffer.from(await response.arrayBuffer());
        await writeFile(path, bytes);
      }
      const metadata = await sharp(bytes).metadata();
      const ext = metadata.format === "jpeg" ? "jpg" : metadata.format;
      if (!ext || !["jpg", "png", "webp", "gif"].includes(ext))
        throw new Error(`Unsupported image in ${article.slug}`);
      const filename = `${article.slug}-${hash}.${ext}`;
      const contentType = `image/${metadata.format}`;
      console.log(`Uploading image ${article.slug}/${hash}`);
      const upload = await limited(() =>
        notion.fileUploads.create({
          mode: "single_part",
          filename,
          content_type: contentType,
        }),
      );
      await limited(() =>
        notion.fileUploads.send({
          file_upload_id: upload.id,
          file: {
            filename,
            data: new Blob([new Uint8Array(bytes)], { type: contentType }),
          },
        }),
      );
      batch.push({
        object: "block",
        type: "image",
        image: {
          type: "file_upload",
          file_upload: { id: upload.id },
          caption: block.image.caption,
        },
      });
    }
    await limited(() =>
      notion.blocks.children.append({
        block_id: record.pageId,
        children: batch,
      }),
    );
    offset += batch.length;
  }
  const verified = await readBlocks(notion, record.pageId);
  if (verified.length !== article.blocks.length)
    throw new Error(`Block count mismatch in ${article.slug}`);
  await limited(() =>
    notion.pages.update({
      page_id: record.pageId,
      properties: { Musing: { checkbox: true } },
    }),
  );
  record.complete = true;
  await save();
  console.log(`Imported and verified: ${article.slug}`);
}
