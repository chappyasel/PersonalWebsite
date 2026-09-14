import type * as S3SDK from "@aws-sdk/client-s3";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { beforeEach, expect, it, vi } from "vitest";

import { downloadWldFromS3, getWldObjectState } from "./s3";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("~/env", () => ({
  env: {
    AWS_REGION: "us-east-1",
    AWS_BUCKET_NAME: "bucket",
    AWS_KEY_NAME: "backup.wld",
  },
}));
vi.mock("@aws-sdk/client-s3", async (original) => ({
  ...(await original<typeof S3SDK>()),
  S3Client: class {
    send = mocks.send;
  },
}));
beforeEach(() => vi.clearAllMocks());
it("uses HEAD and treats ETags and version IDs as change tokens", async () => {
  mocks.send.mockResolvedValue({ ETag: '"one"', ContentLength: 100 });
  const first = await getWldObjectState();
  expect(mocks.send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  expect(await getWldObjectState()).toEqual(first);
  mocks.send.mockResolvedValue({ ETag: '"two"', ContentLength: 100 });
  expect((await getWldObjectState()).fingerprint).not.toBe(first.fingerprint);
  mocks.send.mockResolvedValue({
    ETag: '"one"',
    ContentLength: 100,
    VersionId: "new-version",
  });
  expect((await getWldObjectState()).fingerprint).not.toBe(first.fingerprint);
});
it("refuses to skip based on missing object identity", async () => {
  mocks.send.mockResolvedValue({});
  await expect(getWldObjectState()).rejects.toThrow("no ETag");
});
it("conditions the download on the inspected ETag", async () => {
  mocks.send.mockResolvedValue({
    Body: { transformToString: async () => '{"workouts":[]}' },
  });
  expect(await downloadWldFromS3('"one"')).toEqual({ workouts: [] });
  const command = mocks.send.mock.calls[0]?.[0] as GetObjectCommand;
  expect(command).toBeInstanceOf(GetObjectCommand);
  expect(command.input.IfMatch).toBe('"one"');
});
