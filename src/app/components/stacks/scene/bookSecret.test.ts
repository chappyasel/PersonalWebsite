import { beforeEach, describe, expect, it } from "vitest";

import {
  allowsBookSecretProjectedRecovery,
  beginBookSecretPull,
  bookSecretSnapshot,
  closeBookSecret,
  releaseBookSecretPull,
  requestBookSecretHint,
  resetBookSecret,
  setBookSecretPull,
  setBookSecretReducedMotion,
  tickBookSecret,
} from "./bookSecret";

describe("book secret reveal", () => {
  beforeEach(() => {
    resetBookSecret();
    setBookSecretReducedMotion(false);
  });

  it("requires a deliberate pull beyond the latch", () => {
    expect(beginBookSecretPull("open")).toBe(true);
    setBookSecretPull(0.69);
    releaseBookSecretPull(false);

    expect(bookSecretSnapshot()).toMatchObject({
      phase: "closed",
      progress: 0,
      pull: 0,
    });

    expect(beginBookSecretPull("open")).toBe(true);
    setBookSecretPull(0.7);
    releaseBookSecretPull(true);

    expect(bookSecretSnapshot().phase).toBe("opening");
  });

  it("opens and returns on a frame-rate-independent timeline", () => {
    beginBookSecretPull("open");
    setBookSecretPull(1);
    releaseBookSecretPull(true);

    for (let frame = 0; frame < 120; frame += 1) tickBookSecret(1 / 60);
    expect(bookSecretSnapshot()).toMatchObject({ phase: "open", progress: 1 });

    closeBookSecret();
    for (let frame = 0; frame < 120; frame += 1) tickBookSecret(1 / 60);
    expect(bookSecretSnapshot()).toMatchObject({
      phase: "closed",
      progress: 0,
    });
  });

  it("snaps autonomous choreography for reduced motion", () => {
    setBookSecretReducedMotion(true);
    beginBookSecretPull("open");
    setBookSecretPull(1);
    releaseBookSecretPull(true);
    tickBookSecret(1 / 60);

    expect(bookSecretSnapshot()).toMatchObject({
      phase: "open",
      progress: 1,
      reducedMotion: true,
    });

    closeBookSecret();
    tickBookSecret(1 / 60);
    expect(bookSecretSnapshot()).toMatchObject({
      phase: "closed",
      progress: 0,
    });
  });

  it("turns a shelf-background interaction into a visible pull clue", () => {
    expect(requestBookSecretHint()).toBe(true);
    expect(bookSecretSnapshot().hintProgress).toBeGreaterThan(0);

    tickBookSecret(0.3);
    expect(bookSecretSnapshot().hintProgress).toBeGreaterThan(0);

    for (let frame = 0; frame < 90; frame += 1) tickBookSecret(1 / 60);
    expect(bookSecretSnapshot().hintProgress).toBe(0);

    beginBookSecretPull("open");
    setBookSecretPull(1);
    releaseBookSecretPull(true);
    expect(requestBookSecretHint()).toBe(false);
  });

  it("lets the exact spine supersede its shelf clue but not another prop", () => {
    const shelf = "secret:books:shelf-clue";
    expect(allowsBookSecretProjectedRecovery(null, shelf)).toBe(true);
    expect(allowsBookSecretProjectedRecovery(shelf, shelf)).toBe(true);
    expect(
      allowsBookSecretProjectedRecovery("grab:books:featured-cover", shelf),
    ).toBe(false);
    expect(allowsBookSecretProjectedRecovery("grab:plant", shelf)).toBe(false);
  });
});
