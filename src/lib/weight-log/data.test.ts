import { beforeEach, describe, expect, it, vi } from "vitest";

import { getWeightLog } from "./data";
import { encryptWeightLog } from "./encryption";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  read: vi.fn(),
  send: vi.fn(),
  env: {
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
  historicalContext: {
    anchor: {
      date: "2019-01-01",
      bodyFatLow: 20,
      bodyFatHigh: 30,
      note: "Synthetic private recollection",
    },
    strength: [{ date: "2019-01-01", lift: "Synthetic lift", value: 100 }],
  },
  phases: [],
  weeks: [],
  scans: [],
};
describe("weight log server storage boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.NODE_ENV = "development";
  });
  it("decrypts and validates data without an access cookie", async () => {
    mocks.read.mockResolvedValue(
      encryptWeightLog(JSON.stringify(fixture), mocks.env.NEXTAUTH_SECRET),
    );
    await expect(getWeightLog()).resolves.toEqual(fixture);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("loads production data at runtime, without local file access", async () => {
    mocks.env.NODE_ENV = "production";
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
    mocks.read.mockResolvedValue(
      encryptWeightLog('{"version":99}', mocks.env.NEXTAUTH_SECRET),
    );
    await expect(getWeightLog()).rejects.toThrow();
  });
});
