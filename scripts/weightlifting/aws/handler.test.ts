import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handler } from "./handler.cjs";
import { withWorkoutNotification, workoutSyncTemplate } from "./stack.mjs";

const upload = (key = "backups/my+workout.wld") => ({
  Records: [
    {
      eventSource: "aws:s3",
      eventName: "ObjectCreated:Put",
      s3: { bucket: { name: "test-bucket" }, object: { key } },
    },
  ],
});
const request = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubEnv("WORKOUT_BUCKET", "test-bucket");
  vi.stubEnv("WORKOUT_KEY", "backups/my workout.wld");
  vi.stubEnv("SYNC_SECRET", "test-secret");
  vi.stubEnv("SYNC_ENDPOINT", "https://example.com/sync");
  vi.stubGlobal("fetch", request);
  request.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("workout upload delivery", () => {
  it("ignores unrelated keys and S3 configuration test events", async () => {
    expect(await handler({})).toEqual({ ignored: true });
    expect(await handler(upload("backups/my+workout.wld.extra"))).toEqual({
      ignored: true,
    });
    expect(request).not.toHaveBeenCalled();
  });
  it("ignores the same filename in another bucket and deletion events", async () => {
    const otherBucket = upload();
    otherBucket.Records[0]!.s3.bucket.name = "someone-elses-bucket";
    expect(await handler(otherBucket)).toEqual({ ignored: true });
    const deletion = upload();
    deletion.Records[0]!.eventName = "ObjectRemoved:Delete";
    expect(await handler(deletion)).toEqual({ ignored: true });
    expect(request).not.toHaveBeenCalled();
  });
  it("decodes the key and authenticates completed uploads", async () => {
    request.mockResolvedValue(
      Response.json({ success: true, result: { skipped: true } }),
    );
    expect(await handler(upload())).toEqual({ synced: true, skipped: true });
    expect(request).toHaveBeenCalledWith(
      "https://example.com/sync",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: {
          authorization: "Bearer test-secret",
          "x-workout-sync-source": "s3",
        },
      }),
    );
  });
  it.each([401, 500, 503])(
    "throws on HTTP %s so Lambda retries",
    async (status) => {
      request.mockResolvedValue(
        new Response("private upstream details", { status }),
      );
      await expect(handler(upload())).rejects.toThrow(
        `Workout sync returned HTTP ${status}`,
      );
    },
  );
  it("treats malformed or unsuccessful responses as failed deliveries", async () => {
    request.mockResolvedValueOnce(new Response("not json"));
    await expect(handler(upload())).rejects.toThrow("invalid JSON");
    request.mockResolvedValueOnce(Response.json({ success: false }));
    await expect(handler(upload())).rejects.toThrow("did not report success");
  });
  it("does not expose network error details", async () => {
    request.mockRejectedValue(new Error("private-url-and-credentials"));
    await expect(handler(upload())).rejects.toThrow(
      "Workout sync request failed or timed out",
    );
  });
  it("preserves other bucket notifications when installing or updating", () => {
    const other = { Id: "other", LambdaFunctionArn: "other-arn" };
    const existing = {
      EventBridgeConfiguration: {},
      TopicConfigurations: [{ Id: "topic" }],
      LambdaFunctionConfigurations: [
        other,
        { Id: "personalwebsite-workout-sync" },
      ],
    };
    const result = withWorkoutNotification(
      existing,
      "new-arn",
      "backup file.wld",
    );
    expect(result.TopicConfigurations).toEqual(existing.TopicConfigurations);
    expect(result.EventBridgeConfiguration).toEqual({});
    expect(result.LambdaFunctionConfigurations).toHaveLength(2);
    expect(result.LambdaFunctionConfigurations[0]).toEqual(other);
    expect(
      result.LambdaFunctionConfigurations[1]?.Filter?.Key.FilterRules[0]?.Value,
    ).toBe("backup%20file.wld");
    expect(
      withWorkoutNotification(result, "new-arn", "backup file.wld"),
    ).toEqual(result);
  });
  it("retains exhausted deliveries and restricts S3 invocation to this account and bucket", () => {
    const { Resources: r, Parameters: p } = workoutSyncTemplate();
    expect(p.SyncSecret.NoEcho).toBe(true);
    expect(r.RetryPolicy.Properties.MaximumRetryAttempts).toBe(2);
    expect(
      r.RetryPolicy.Properties.DestinationConfig.OnFailure.Destination,
    ).toEqual({ "Fn::GetAtt": ["FailureQueue", "Arn"] });
    expect(r.UploadPermission.Properties.SourceAccount).toEqual({
      Ref: "AWS::AccountId",
    });
    expect(r.UploadPermission.Properties.SourceArn).toEqual({
      "Fn::Sub": "arn:${AWS::Partition}:s3:::${Bucket}",
    });
  });
});
