import { describe, expect, it } from "vitest";

import { versionRoomAssetUrl } from "./roomAssetVersion";

describe("versionRoomAssetUrl", () => {
  it("tags room models and images with the asset version", () => {
    expect(versionRoomAssetUrl("/models/arduino.glb", "abc123")).toBe(
      "/models/arduino.glb?v=abc123",
    );
    expect(
      versionRoomAssetUrl("/images/stacks/boot/books/dark-phone.svg", "abc123"),
    ).toBe("/images/stacks/boot/books/dark-phone.svg?v=abc123");
  });

  it("leaves other URLs, queried URLs, and unversioned builds alone", () => {
    expect(versionRoomAssetUrl("/images/about/profile.jpg", "abc")).toBe(
      "/images/about/profile.jpg",
    );
    expect(versionRoomAssetUrl("https://covers.example/x.jpg", "abc")).toBe(
      "https://covers.example/x.jpg",
    );
    expect(versionRoomAssetUrl("/models/a.glb?raw", "abc")).toBe(
      "/models/a.glb?raw",
    );
    expect(versionRoomAssetUrl("/models/a.glb", undefined)).toBe(
      "/models/a.glb",
    );
    expect(versionRoomAssetUrl("/models/a.glb", "")).toBe("/models/a.glb");
  });
});
