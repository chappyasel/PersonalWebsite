/**
 * A Notion stand-in for focused tests, modelled on what the live API actually
 * did on 2026-09-15 rather than on what the docs imply.
 *
 * The two behaviours worth simulating faithfully:
 *   - Attaching returns the icon as `type: "file"` with a presigned URL whose
 *     query is different on every read, while the path stays put.
 *   - One upload attaches to many pages and every page resolves to the same
 *     attachment path, which is what a reread depends on.
 */
import { BOOK_DATA_SOURCE_ID } from "./pageGuard";

export const TEST_WORKSPACE = "859fbc85-7644-4498-88d8-e0229d8cea32";

type FakePage = {
  id: string;
  icon: unknown;
  /** Set when the icon is one of our attachments, so reads can re-sign it. */
  attachedUpload?: string;
  in_trash?: boolean;
};

export function fakeNotion(options?: {
  workspaceId?: string;
  pages?: Record<string, unknown>;
}) {
  const workspaceId = options?.workspaceId ?? TEST_WORKSPACE;
  const pages = new Map<string, FakePage>();
  for (const [id, icon] of Object.entries(options?.pages ?? {})) {
    pages.set(id, { id, icon });
  }
  const uploads = new Map<string, { filename: string; sent: boolean }>();
  /** uploadId to attachment id, so one upload always resolves to one path. */
  const attachments = new Map<string, string>();
  const calls: string[] = [];
  const failures: Array<(url: string, method: string) => Response | null> = [];
  let signature = 0;
  let uploadCount = 0;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  const fileIcon = (uploadId: string) => {
    const attachment = attachments.get(uploadId)!;
    const filename = uploads.get(uploadId)?.filename ?? "file.png";
    return {
      type: "file",
      file: {
        url: `https://prod-files-secure.s3.us-west-2.amazonaws.com/${workspaceId}/${attachment}/${filename}?X-Amz-Signature=${++signature}`,
        expiry_time: "2026-09-15T20:24:38.368Z",
      },
    };
  };

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const method = init?.method ?? "GET";
    const path = new URL(url).pathname;
    calls.push(`${method} ${path}`);

    // Only the matching failure is consumed. Splicing them all out here meant
    // a failure queued for a PATCH was swallowed by the preceding GET.
    for (const [index, failure] of failures.entries()) {
      const response = failure(path, method);
      if (response) {
        failures.splice(index, 1);
        return response;
      }
    }

    if (path === "/v1/users/me") {
      return json({ bot: { workspace_id: workspaceId, workspace_name: "Personal" } });
    }
    if (path === "/v1/file_uploads" && method === "POST") {
      const body = JSON.parse(init?.body as string) as { filename: string };
      const id = `upload-${++uploadCount}`;
      uploads.set(id, { filename: body.filename, sent: false });
      return json({ id, status: "pending", expiry_time: "2026-09-15T20:24:00.000Z" });
    }
    const send = /^\/v1\/file_uploads\/([^/]+)\/send$/.exec(path);
    if (send && method === "POST") {
      const upload = uploads.get(send[1]!);
      if (!upload) return json({ message: "not found" }, 404);
      upload.sent = true;
      return json({ id: send[1], status: "uploaded", expiry_time: "2026-09-15T20:24:00.000Z" });
    }
    const page = /^\/v1\/pages\/([^/]+)$/.exec(path);
    if (page) {
      const record = pages.get(page[1]!);
      if (!record) return json({ message: "not found" }, 404);
      if (method === "PATCH") {
        const body = JSON.parse(init?.body as string) as {
          icon: { type: string; file_upload?: { id: string } } | null;
        };
        const uploadId = body.icon?.file_upload?.id;
        if (uploadId) {
          if (!uploads.get(uploadId)?.sent) return json({ message: "not uploaded" }, 400);
          if (!attachments.has(uploadId)) {
            attachments.set(uploadId, `attach-${attachments.size + 1}`);
          }
          record.attachedUpload = uploadId;
        } else {
          delete record.attachedUpload;
          record.icon = body.icon;
        }
      }
      // Re-sign on every read, exactly as the real API does.
      const icon = record.attachedUpload
        ? fileIcon(record.attachedUpload)
        : record.icon;
      record.icon = icon;
      return json({
        id: record.id,
        icon,
        parent: { type: "data_source_id", data_source_id: BOOK_DATA_SOURCE_ID },
        in_trash: record.in_trash ?? false,
      });
    }
    return json({ message: `unhandled ${method} ${path}` }, 500);
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    calls,
    pages,
    uploads,
    attachments,
    /** Queue a one-shot failure for the next matching request. */
    failNext: (matcher: (path: string, method: string) => Response | null) => {
      failures.push(matcher);
    },
    countCalls: (prefix: string) =>
      calls.filter((call) => call.startsWith(prefix)).length,
    iconOf: (pageId: string) => pages.get(pageId)?.icon,
  };
}
