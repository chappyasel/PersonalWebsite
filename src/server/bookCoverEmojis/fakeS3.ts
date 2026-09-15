/** In-memory conditional S3 used only by focused tests. */
import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export function fakeS3() {
  const objects = new Map<string, { body: Buffer; etag: string }>();
  const writes: Array<{
    Key?: string;
    IfMatch?: string;
    IfNoneMatch?: string;
  }> = [];
  let version = 0;
  let failHead = false;
  const client = {
    send: async (command: GetObjectCommand | PutObjectCommand) => {
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
      if (failHead && key.endsWith("/head.json")) {
        failHead = false;
        throw new Error("injected head failure");
      }
      if (
        (command.input.IfNoneMatch === "*" && old) ||
        (command.input.IfMatch && command.input.IfMatch !== old?.etag)
      )
        throw Object.assign(new Error("precondition"), {
          $metadata: { httpStatusCode: 412 },
        });
      const body = Buffer.isBuffer(command.input.Body)
        ? command.input.Body
        : Buffer.from(command.input.Body as string);
      objects.set(key, { body, etag: `"${++version}"` });
      return {};
    },
  } as unknown as S3Client;
  return {
    client,
    objects,
    writes,
    failNextHead: () => {
      failHead = true;
    },
  };
}
