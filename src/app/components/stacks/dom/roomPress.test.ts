// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { pressLandsInRoom } from "./roomPress";

/**
 * The expanded mobile placard collapses for a press in the room. The
 * listener is on `window`, so it also hears presses on surfaces presented
 * over the world, and collapsing for those popped THEIR history entry (a
 * manual opened from the expanded sheet closed on every tap). Only the room
 * counts.
 */
describe("pressLandsInRoom", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div class="stacks-world-shell">
        <canvas id="room"></canvas>
        <button id="toggle" class="stacks-theme-toggle"></button>
        <nav class="stacks-unit-rail-mobile"><button id="rail">Systems</button></nav>
        <div data-stacks-mobile-panel><p id="panel-text">Systems</p></div>
      </div>
      <div id="sheet" role="dialog"><p id="sheet-text">Manual</p></div>
      <div class="PhotoView-Portal"><img id="viewer" alt="" /></div>
    `;
  });

  const at = (id: string) => document.getElementById(id);

  it("counts the canvas and the world chrome as the room", () => {
    expect(pressLandsInRoom(at("room"))).toBe(true);
    expect(pressLandsInRoom(at("toggle"))).toBe(true);
    // A text node inside the room resolves through its parent.
    at("toggle")!.append("light");
    expect(pressLandsInRoom(at("toggle")!.firstChild)).toBe(true);
  });

  it("leaves the panel and the mobile rail to their own handlers", () => {
    expect(pressLandsInRoom(at("panel-text"))).toBe(false);
    expect(pressLandsInRoom(at("rail"))).toBe(false);
  });

  it("ignores surfaces presented over the world", () => {
    expect(pressLandsInRoom(at("sheet-text"))).toBe(false);
    expect(pressLandsInRoom(at("sheet"))).toBe(false);
    expect(pressLandsInRoom(at("viewer"))).toBe(false);
  });

  it("ignores presses with no element", () => {
    expect(pressLandsInRoom(null)).toBe(false);
    expect(pressLandsInRoom(window)).toBe(false);
  });
});
