// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CaptionEditorSnapshot } from "~/lib/stacks/captionEditorData";

import { CaptionEditor } from "./CaptionEditor";

const initialSnapshot: CaptionEditorSnapshot = {
  revision: "first",
  entries: [
    {
      id: "photo:one",
      title: "Family portrait",
      status: "written",
      body: "Old family caption.",
      visitor: true,
      image: "/images/stacks/v8/about-family.webp",
      section: "About",
      kind: "photo",
    },
    {
      id: "prop:two",
      title: "Apple Vision Pro",
      status: "written",
      body: "Old Vision Pro caption.",
      visitor: true,
      section: "About",
      kind: "object",
    },
  ],
};

afterEach(cleanup);

describe("CaptionEditor", () => {
  it("filters captions and tracks edits", () => {
    render(
      <CaptionEditor initialSnapshot={initialSnapshot} saveAction={vi.fn()} />,
    );

    expect(screen.getByText("2 captions")).toBeTruthy();
    expect(screen.getAllByText("About")).toHaveLength(2);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Save captions" })
        .disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Search captions"), {
      target: { value: "Vision" },
    });
    expect(screen.queryByText("Family portrait")).toBeNull();
    expect(screen.getByText("Apple Vision Pro")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Apple Vision Pro caption"), {
      target: { value: "The product I helped launch at Apple." },
    });
    expect(screen.getByText("1 unsaved")).toBeTruthy();
  });

  it("disables editing while saving and adopts the returned revision", async () => {
    let resolveSave!: (value: {
      saved: true;
      snapshot: CaptionEditorSnapshot;
    }) => void;
    const saveAction = vi.fn(
      () =>
        new Promise<{ saved: true; snapshot: CaptionEditorSnapshot }>(
          (resolve) => {
            resolveSave = resolve;
          },
        ),
    );
    render(
      <CaptionEditor
        initialSnapshot={initialSnapshot}
        saveAction={saveAction}
      />,
    );

    const textarea = screen.getByLabelText<HTMLTextAreaElement>(
      "Family portrait caption",
    );
    fireEvent.change(textarea, { target: { value: "New family caption." } });
    fireEvent.click(screen.getByRole("button", { name: "Save captions" }));
    expect(textarea.disabled).toBe(true);

    resolveSave({
      saved: true,
      snapshot: {
        revision: "second",
        entries: [
          { ...initialSnapshot.entries[0]!, body: "New family caption." },
          initialSnapshot.entries[1]!,
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByText("All changes saved")).toBeTruthy(),
    );
    expect(saveAction).toHaveBeenCalledWith({
      revision: "first",
      edits: [{ id: "photo:one", body: "New family caption." }],
    });
  });

  it("keeps edits after a failed or stale save", async () => {
    const saveAction = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk"))
      .mockResolvedValueOnce({ saved: false, reason: "stale" });
    render(
      <CaptionEditor
        initialSnapshot={initialSnapshot}
        saveAction={saveAction}
      />,
    );
    const textarea = screen.getByLabelText<HTMLTextAreaElement>(
      "Family portrait caption",
    );
    fireEvent.change(textarea, { target: { value: "New family caption." } });

    fireEvent.click(screen.getByRole("button", { name: "Save captions" }));
    expect(
      await screen.findByText("Save failed. Your edits are still here."),
    ).toBeTruthy();
    expect(textarea.value).toBe("New family caption.");

    fireEvent.click(screen.getByRole("button", { name: "Save captions" }));
    expect(
      await screen.findByText(
        "The caption file changed elsewhere. Reload before saving so nothing gets overwritten.",
      ),
    ).toBeTruthy();
    expect(textarea.value).toBe("New family caption.");
  });

  it("saves visibility without changing prose and keeps the hidden entry editable", async () => {
    const hiddenSnapshot = {
      ...initialSnapshot,
      revision: "hidden",
      entries: initialSnapshot.entries.map((entry) => ({
        ...entry,
        visitor: false,
      })),
    };
    const saveAction = vi
      .fn()
      .mockResolvedValue({ saved: true, snapshot: hiddenSnapshot });
    render(
      <CaptionEditor
        initialSnapshot={initialSnapshot}
        saveAction={saveAction}
      />,
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Family portrait caption enabled" }),
    );
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Family portrait caption")
        .value,
    ).toBe("Old family caption.");
    fireEvent.click(screen.getByRole("button", { name: "Save captions" }));
    await waitFor(() =>
      expect(screen.getByText("All changes saved")).toBeTruthy(),
    );
    expect(saveAction).toHaveBeenCalledWith({
      revision: "first",
      edits: [{ id: "photo:one", visitor: false }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Hidden" }));
    expect(
      screen.getByLabelText<HTMLTextAreaElement>("Family portrait caption")
        .value,
    ).toBe("Old family caption.");
    fireEvent.click(
      screen.getByRole("switch", { name: "Family portrait caption enabled" }),
    );
    expect(screen.getByText("1 unsaved")).toBeTruthy();
  });

  it("requires a description before enabling an empty hidden caption", () => {
    render(
      <CaptionEditor
        initialSnapshot={{
          ...initialSnapshot,
          entries: [
            {
              ...initialSnapshot.entries[0]!,
              body: "",
              status: "needs-owner",
              visitor: false,
              needs: "Where was this?",
            },
          ],
        }}
        saveAction={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hidden" }));
    const toggle = screen.getByRole<HTMLButtonElement>("switch", {
      name: "Family portrait caption enabled",
    });
    expect(toggle.disabled).toBe(true);
    expect(screen.getByText("Needs your input: Where was this?")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Family portrait caption"), {
      target: { value: "At home with family." },
    });
    expect(toggle.disabled).toBe(false);
  });
});
