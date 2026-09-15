/** In-memory S3 used only by focused tests. */
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export function fakeS3() {
  const objects = new Map<string, { body: Buffer; etag: string }>();
  const writes: Array<{ Key?: string }> = [];
  let version = 0;
  const client = {
    send: async (
      command: GetObjectCommand | PutObjectCommand | ListObjectsV2Command,
    ) => {
      if (command instanceof ListObjectsV2Command) {
        const prefix = command.input.Prefix ?? "";
        return {
          Contents: [...objects.keys()]
            .filter((key) => key.startsWith(prefix))
            .sort()
            .map((Key) => ({ Key })),
        };
      }
      const key = command.input.Key!;
      const old = objects.get(key);
      if (command instanceof GetObjectCommand) {
        if (!old)
          throw Object.assign(new Error("missing"), {
            $metadata: { httpStatusCode: 404 },
          });
        return {
          ETag: old.etag,
          Body: {
            transformToString: async () => old.body.toString(),
            transformToByteArray: async () => old.body,
          },
        };
      }
      if (!(command instanceof PutObjectCommand))
        throw new Error("unsupported command");
      writes.push(command.input);
      const body = Buffer.isBuffer(command.input.Body)
        ? command.input.Body
        : Buffer.from(command.input.Body as string);
      objects.set(key, { body, etag: `"${++version}"` });
      return {};
    },
  } as unknown as S3Client;
  return { client, objects, writes };
}
