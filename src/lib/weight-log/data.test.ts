import { beforeEach, describe, expect, it, vi } from "vitest";

import { dadAccessToken } from "~/lib/dad/access";

import { getWeightLog } from "./data";
import { encryptWeightLog } from "./encryption";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  read: vi.fn(),
  send: vi.fn(),
  env: {
    DAD_CONTENT_PASSWORD: "test-password",
    NEXTAUTH_SECRET: "synthetic-secret".repeat(4),
    NODE_ENV: "development",
    AWS_BUCKET_NAME: "test-bucket",
    AWS_REGION: "us-east-1",
  },
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.get }) }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
vi.mock("~/env", () => ({ env: mocks.env }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = mocks.send;
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));

const fixture = {
  version: 1,
  setPoints: [],
  importedAt: "2020-01-01",
  sourceModifiedAt: "2020-01-01",
  phases: [],
  weeks: [],
  scans: [],
};
describe("private weight data boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.NODE_ENV = "development";
  });
  it.each([undefined, "true", "forged", "é".repeat(64)])(
    "rejects unauthenticated or forged cookies before any I/O",
    async (value) => {
      mocks.get.mockReturnValue(value ? { value } : undefined);
      await expect(getWeightLog()).rejects.toThrow("Unauthorized");
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );
  it("decrypts and validates data only for an authorized request", async () => {
    mocks.get.mockReturnValue({
      value: dadAccessToken(mocks.env.DAD_CONTENT_PASSWORD),
    });
    mocks.read.mockResolvedValue(
      encryptWeightLog(JSON.stringify(fixture), mocks.env.NEXTAUTH_SECRET),
    );
    await expect(getWeightLog()).resolves.toEqual(fixture);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("loads production data at runtime, without local file access", async () => {
    mocks.env.NODE_ENV = "production";
    mocks.get.mockReturnValue({
      value: dadAccessToken(mocks.env.DAD_CONTENT_PASSWORD),
    });
    mocks.send.mockResolvedValue({
      Body: {
        transformToByteArray: async () =>
          encryptWeightLog(JSON.stringify(fixture), mocks.env.NEXTAUTH_SECRET),
      },
    });
    await expect(getWeightLog()).resolves.toEqual(fixture);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects a snapshot with the wrong schema", async () => {
    mocks.get.mockReturnValue({
      value: dadAccessToken(mocks.env.DAD_CONTENT_PASSWORD),
    });
    mocks.read.mockResolvedValue(
      encryptWeightLog('{"version":99}', mocks.env.NEXTAUTH_SECRET),
    );
    await expect(getWeightLog()).rejects.toThrow();
  });
});
