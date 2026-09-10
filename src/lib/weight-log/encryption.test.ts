import { describe, expect, it } from "vitest";

import { decryptWeightLog, encryptWeightLog } from "./encryption";

const secret = "synthetic-test-key-".repeat(4);
describe("weight snapshot encryption", () => {
  it("round trips without retaining plaintext, with fresh randomness on every export", () => {
    const source = JSON.stringify({ privateFixture: "synthetic-record" });
    const encrypted = encryptWeightLog(source, secret);
    expect(decryptWeightLog(encrypted, secret)).toBe(source);
    expect(encrypted.includes(Buffer.from("synthetic-record"))).toBe(false);
    expect(encryptWeightLog(source, secret).equals(encrypted)).toBe(false);
  });
  it("rejects a changed key, modified ciphertext, and malformed files", () => {
    const encrypted = encryptWeightLog("synthetic", secret);
    expect(() => decryptWeightLog(encrypted, "different-".repeat(8))).toThrow();
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
    expect(() => decryptWeightLog(tampered, secret)).toThrow();
    expect(() => decryptWeightLog(Buffer.from("plaintext"), secret)).toThrow();
    expect(() => encryptWeightLog("synthetic", "short")).toThrow();
  });
});
