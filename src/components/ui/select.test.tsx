// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";

function Options({ label = "Choose a person" }: { label?: string }) {
  return (
    <>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 40 }, (_, i) => (
          <SelectItem key={i} value={String(i)}>
            Person {i + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </>
  );
}

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);
const originalHasPointerCapture = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "hasPointerCapture",
);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});
afterEach(() => {
  cleanup();
  if (originalScrollIntoView)
    Object.defineProperty(
      Element.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  else Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  if (originalHasPointerCapture)
    Object.defineProperty(
      Element.prototype,
      "hasPointerCapture",
      originalHasPointerCapture,
    );
  else Reflect.deleteProperty(Element.prototype, "hasPointerCapture");
  vi.restoreAllMocks();
});

describe("shared select interactions", () => {
  it("honors defaultOpen and lets the keyboard select the end of a long list", async () => {
    const onValueChange = vi.fn();
    render(
      <Select defaultOpen defaultValue="0" onValueChange={onValueChange}>
        <Options />
      </Select>,
    );
    const list = await screen.findByRole("listbox");
    fireEvent.keyDown(list, { key: "End" });
    await waitFor(() =>
      expect(document.activeElement?.textContent).toBe("Person 40"),
    );
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(onValueChange).toHaveBeenCalledWith("39");
    await waitFor(() => expect(list.isConnected).toBe(false));
    expect(screen.getByRole("combobox").textContent).toBe("Person 40");
  });

  it("keeps a closing dropdown visible briefly, then removes it", async () => {
    render(
      <Select defaultOpen defaultValue="0">
        <Options />
      </Select>,
    );
    const list = await screen.findByRole("listbox");
    fireEvent.keyDown(list, { key: "Escape" });
    expect(list.isConnected).toBe(true);
    expect(list.getAttribute("data-state")).toBe("closed");
    await waitFor(() => expect(list.isConnected).toBe(false));
  });

  it.each(["mouse", "touch"])(
    "opens a second select in one %s interaction",
    async (pointer) => {
      const user = userEvent.setup();
      render(
        <>
          <Select defaultOpen defaultValue="0">
            <Options label="First person" />
          </Select>
          <Select defaultValue="1">
            <Options label="Second person" />
          </Select>
        </>,
      );
      await screen.findByRole("listbox");
      // Radix hides the rest of the page from accessibility while a select is open.
      const second = screen.getAllByRole("combobox", { hidden: true })[1]!;
      if (pointer === "mouse") await user.click(second);
      else
        await user.pointer([
          { keys: "[TouchA>]", target: second },
          { keys: "[/TouchA]" },
        ]);
      await waitFor(() =>
        expect(second.getAttribute("aria-expanded")).toBe("true"),
      );
      expect(screen.getAllByRole("listbox")).toHaveLength(1);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      expect(second.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByRole("listbox").contains(document.activeElement)).toBe(
        true,
      );
    },
  );

  it("supports controlled opening, Escape, and reopening without a stale close timer", async () => {
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <Select open={open} onOpenChange={setOpen} defaultValue="0">
          <Options />
        </Select>
      );
    }
    render(<Controlled />);
    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(await screen.findByRole("listbox"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(await screen.findByRole("listbox")).toBeTruthy();
  });
});
