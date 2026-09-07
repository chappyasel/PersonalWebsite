// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToClipboard } from "./clipboard";

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "execCommand");
});

describe("copyTextToClipboard", () => {
  it("uses the Clipboard API in a secure context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    await expect(
      copyTextToClipboard("https://example.com", {
        isSecureContext: true,
        navigator: { clipboard: { writeText } },
        document,
      }),
    ).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("https://example.com");
    expect(document.body.childElementCount).toBe(0);
  });

  it("falls back to a temporary textarea on an HTTP origin", async () => {
    const execCommand = vi.fn().mockReturnValue(true);

    await expect(
      copyTextToClipboard("http://10.0.0.235:3000/books/behave", {
        isSecureContext: false,
        navigator: {},
        document: Object.assign(document, { execCommand }),
      }),
    ).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.body.childElementCount).toBe(0);
  });
});
