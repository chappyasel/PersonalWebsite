#!/usr/bin/env tsx
/**
 * Read-only proof of the live API shapes. Makes no writes of any kind.
 *
 *   pnpm book-emoji-worker-probe <pageId>
 *
 * Confirms the API version serves custom emojis, and prints the exact JSON
 * shape of a page icon and parent so the decoder is written against reality
 * rather than against an assumption.
 */
import {
  NOTION_VERSION,
  getPage,
  listCustomEmojis,
  whoAmI,
} from "../../../src/lib/bookCoverEmojis/notionEmojiApi";
import { decodePageIcon } from "../../../src/lib/bookCoverEmojis/iconPolicy";
import { readNotionToken } from "./state";
import { safeMessage } from "../redact";
import process from "node:process";

async function main() {
  const options = { token: readNotionToken() };
  console.log(`notion-version: ${NOTION_VERSION}`);

  const me = await whoAmI(options);
  console.log(`workspace: ${me.workspace_name} (${me.workspace_id})`);

  const library = await listCustomEmojis(options);
  console.log(`custom emoji readable: ${library.size}`);
  const sample = [...library.values()][0];
  if (sample) {
    console.log(
      `sample emoji keys: ${Object.keys(sample).join(", ")} | name=${sample.name}`,
    );
  }

  // Prove the nested custom_emoji icon shape from a page that already uses
  // one, rather than assuming it. Read-only: search plus page reads.
  if (process.argv.includes("--find-custom-emoji-icon")) {
    const response = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.token}`,
        "notion-version": NOTION_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({ filter: { value: "page", property: "object" }, page_size: 100 }),
    });
    const body = (await response.json()) as { results?: Array<{ id: string; icon?: unknown }> };
    const hit = (body.results ?? []).find(
      (item) => (item.icon as { type?: string } | null)?.type === "custom_emoji",
    );
    if (hit) {
      console.log(`custom_emoji icon found on ${hit.id}`);
      console.log(`  raw    : ${JSON.stringify(hit.icon)}`);
      console.log(`  decoded: ${JSON.stringify(decodePageIcon(hit.icon))}`);
    } else {
      console.log(
        `no page in the first ${body.results?.length ?? 0} search results carries a custom_emoji icon`,
      );
    }
  }

  const pageId = process.argv.slice(2).find((token) => !token.startsWith("--"));
  if (!pageId) {
    console.log("no page id given; skipping page shape probe");
    return;
  }
  const page = await getPage(pageId, options);
  console.log(`page ${page.id}`);
  console.log(`  parent: ${JSON.stringify(page.parent)}`);
  console.log(`  in_trash: ${String(page.in_trash)} archived: ${String(page.archived)}`);
  console.log(`  raw icon: ${JSON.stringify(page.icon)}`);
  console.log(`  decoded : ${JSON.stringify(decodePageIcon(page.icon))}`);
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
