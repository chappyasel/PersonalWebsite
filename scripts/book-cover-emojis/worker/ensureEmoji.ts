/**
 * Find the emoji, or register it, exactly once.
 *
 * This is the crash-safety hinge of the whole worker. Registering happens in a
 * browser and recording happens afterwards, so there is a window where the
 * emoji exists in Notion and nothing local knows it. Looking the name up
 * before uploading closes that window: a rerun finds it and reuses it instead
 * of creating a second emoji with the same name.
 *
 * Confirmation comes from the API rather than the UI, which also settles the
 * workspace question. The integration token belongs to the pinned workspace,
 * so an emoji that landed anywhere else never appears here and the run fails
 * loudly instead of silently decorating the wrong place.
 */
import type { CustomEmoji } from "../../../src/lib/bookCoverEmojis/notionEmojiApi";

export type EnsureEmojiDeps = {
  /** The bytes this book should be wearing. */
  expectedBytes: Buffer;
  /** Fetch the image behind an emoji already in the library. */
  fetchImage: (url: string) => Promise<Buffer>;
  /** Tolerant comparison, because Notion re-encodes what it stores. */
  imagesMatch: (expected: Buffer, actual: Buffer) => Promise<{ matches: boolean; difference: number }>;
  /** Current library, by name. Mutated in place as new emoji appear. */
  library: Map<string, CustomEmoji>;
  /** Re-read the library from the API. */
  refresh: () => Promise<Map<string, CustomEmoji>>;
  /** Register through the headless UI. */
  upload: (name: string, assetPath: string) => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
  /** How many times to poll the API before giving up. */
  confirmAttempts?: number;
};

export class EmojiImageMismatch extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmojiImageMismatch";
  }
}

export type EnsureEmojiResult = {
  emoji: CustomEmoji;
  source: "reused" | "registered";
};

export async function ensureEmoji(
  name: string,
  assetPath: string,
  deps: EnsureEmojiDeps,
): Promise<EnsureEmojiResult> {
  const existing = deps.library.get(name);
  if (existing) {
    // A name match is not an image match. Confirm the picture before trusting
    // it, so a colliding name cannot put the wrong jacket on a book.
    const actual = await deps.fetchImage(existing.url);
    const comparison = await deps.imagesMatch(deps.expectedBytes, actual);
    if (!comparison.matches) {
      throw new EmojiImageMismatch(
        `the emoji ${name} already exists but its image does not match this cover (difference ${comparison.difference.toFixed(1)}). Nothing was applied; resolve the name collision by hand.`,
      );
    }
    return { emoji: existing, source: "reused" };
  }

  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const attempts = deps.confirmAttempts ?? 15;

  await deps.upload(name, assetPath);

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const refreshed = await deps.refresh();
    for (const [key, value] of refreshed) deps.library.set(key, value);
    const found = refreshed.get(name);
    if (found) {
      // Verify what actually landed, not what we meant to send.
      const actual = await deps.fetchImage(found.url);
      const comparison = await deps.imagesMatch(deps.expectedBytes, actual);
      if (!comparison.matches) {
        throw new EmojiImageMismatch(
          `the emoji ${name} was created but its stored image does not match this cover (difference ${comparison.difference.toFixed(1)})`,
        );
      }
      return { emoji: found, source: "registered" };
    }
    if (attempt < attempts) await sleep(1000);
  }
  throw new Error(
    `the API never confirmed the emoji ${name}. It may have landed in another workspace; nothing was applied.`,
  );
}
