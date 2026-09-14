import { beforeEach, expect, it, vi } from "vitest";

import { PACIFIC_DATE_REFERENCES } from "./exportTimeZone";
import { WorkoutSyncBusyError, syncWeightlifting } from "./sync";

const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  state: vi.fn(),
  download: vi.fn(),
  findFirst: vi.fn(),
  remove: vi.fn(),
  updates: [] as Record<string, unknown>[],
}));
vi.mock("./s3", () => ({
  getWldObjectState: mocks.state,
  downloadWldFromS3: mocks.download,
}));
vi.mock("~/server/db", () => {
  const db = {
    execute: mocks.lock,
    query: { wlSyncMetadata: { findFirst: mocks.findFirst } },
    delete: mocks.remove,
    insert: () => ({
      values: (rows: unknown) => ({
        returning: async () =>
          Array.isArray(rows)
            ? rows.map((row: { uuid?: string }, id: number) => ({
                ...row,
                id: id + 1,
              }))
            : [{ id: 1 }],
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mocks.updates.push(values);
        return { where: async () => undefined };
      },
    }),
    transaction: async (
      fn: (tx: unknown) => Promise<unknown>,
    ): Promise<unknown> => fn(db),
  };
  return { db };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates.length = 0;
  mocks.lock.mockResolvedValue([{ acquired: true }]);
  mocks.state.mockResolvedValue({
    etag: '"new"',
    fingerprint: "new-fingerprint",
  });
  mocks.findFirst.mockResolvedValue(null);
  mocks.remove.mockResolvedValue(undefined);
  mocks.download.mockResolvedValue({
    typeList: { list: [] },
    workouts: PACIFIC_DATE_REFERENCES.map((w) => ({
      ...w,
      dateModified: false,
      name: "Workout",
      duration: 60,
      supersets: [],
      exercises: [],
    })),
  });
});

it("skips unchanged backups without downloading or replacing workouts", async () => {
  mocks.findFirst.mockResolvedValue({
    fileHash: "new-fingerprint",
    totalWorkouts: 12,
  });
  expect(await syncWeightlifting("s3")).toMatchObject({
    skipped: true,
    totalWorkouts: 12,
  });
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.updates[0]).toMatchObject({
    status: "success",
    fileHash: "new-fingerprint",
  });
});
it("rejects overlapping syncs before reading S3 or changing workouts", async () => {
  mocks.lock.mockResolvedValue([{ acquired: false }]);
  await expect(syncWeightlifting("cron")).rejects.toBeInstanceOf(
    WorkoutSyncBusyError,
  );
  expect(mocks.state).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});
it("imports a changed backup with the ETag condition and records its fingerprint", async () => {
  expect(await syncWeightlifting("s3")).toMatchObject({
    skipped: false,
    totalWorkouts: 12,
  });
  expect(mocks.download).toHaveBeenCalledWith('"new"');
  expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.state.mock.invocationCallOrder[0]!,
  );
  expect(mocks.remove).toHaveBeenCalledTimes(4);
  expect(mocks.updates.at(-1)).toMatchObject({
    status: "success",
    fileHash: "new-fingerprint",
  });
});
it("preserves workouts when a replacement upload races the conditional download", async () => {
  mocks.download.mockRejectedValue(new Error("PreconditionFailed"));
  await expect(syncWeightlifting("s3")).rejects.toThrow("PreconditionFailed");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.updates.at(-1)).toMatchObject({
    status: "failed",
    fileHash: null,
  });
});
it("preserves workouts when the backup fails date validation", async () => {
  mocks.download.mockResolvedValue({ workouts: [], typeList: { list: [] } });
  await expect(syncWeightlifting("s3")).rejects.toThrow(
    "Cannot identify workout export time zone",
  );
  expect(mocks.remove).not.toHaveBeenCalled();
});
