/**
 * The Notion endpoints this feature needs, over the supported public API.
 *
 * Setting a page icon to a rendered book jacket takes three calls: create a
 * FileUpload, send the bytes, then attach the upload as the page's icon. All
 * three are documented and none of them needs a browser, a private endpoint,
 * or a session cookie.
 *
 * Two behaviours here were measured against the live API on 2026-09-15 rather
 * than assumed, because both shape the callers:
 *
 *   1. An unattached upload expires one hour after it is created. Attaching it
 *      to anything sets `expiry_time` to null and the file becomes permanent.
 *      So an upload is only worth caching once something points at it.
 *   2. Attaching returns the icon as `type: "file"`, never `type: "file_upload"`,
 *      and the URL is signed with a one-hour credential that is different on
 *      every read. The URL *path* is stable, which is what ownership compares.
 *      See `fileUrlKey` in ./iconPolicy.
 */

/** Custom emoji and file-upload icons both need a recent API version. */
export const NOTION_VERSION = "2026-03-11";

export type NotionFetch = typeof fetch;

export type NotionApiOptions = {
  token: string;
  fetchImpl?: NotionFetch;
  /** Injected in tests so backoff costs no wall clock. */
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  timeoutMs?: number;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class NotionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionAuthError";
  }
}

/** A 4xx that is not auth: retrying will not help, so callers stop. */
export class NotionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "NotionRequestError";
  }
}

type Body = BodyInit | (() => BodyInit);

/**
 * One request, with Notion's own pacing honored.
 *
 * A 429 carries Retry-After in seconds. Waiting exactly that long is the
 * difference between backing off and being told to back off again, so the
 * header wins over any local guess whenever it is present. A 401 or 403 stops
 * immediately: retrying a credential problem only turns one clear failure into
 * a slow one.
 *
 * `body` may be a factory because a multipart upload cannot be replayed from
 * an already-consumed FormData. Building it per attempt keeps retries honest.
 */
async function request<T>(
  path: string,
  init: { method: string; body?: Body },
  options: NotionApiOptions,
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? 4;
  const timeoutMs = options.timeoutMs ?? 30_000;

  let lastError = "no attempt made";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const body =
      typeof init.body === "function" ? init.body() : init.body;
    // Let fetch set the multipart boundary; naming a content-type breaks it.
    const isForm =
      typeof FormData !== "undefined" && body instanceof FormData;

    let response: Response;
    try {
      response = await fetchImpl(`https://api.notion.com${path}`, {
        method: init.method,
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          authorization: `Bearer ${options.token}`,
          "notion-version": NOTION_VERSION,
          ...(isForm ? {} : { "content-type": "application/json" }),
        },
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === maxAttempts) break;
      await sleep(500 * attempt);
      continue;
    }

    if (response.ok) return (await response.json()) as T;

    if (response.status === 401 || response.status === 403) {
      throw new NotionAuthError(
        `Notion rejected the integration token (http ${response.status})`,
      );
    }

    if (response.status === 429) {
      const header = response.headers.get("retry-after");
      const seconds = header ? Number(header) : Number.NaN;
      const waitMs =
        Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000 * attempt;
      lastError = `http 429, retry-after ${header ?? "absent"}`;
      if (attempt === maxAttempts) break;
      await sleep(waitMs);
      continue;
    }

    if (response.status < 500) {
      throw new NotionRequestError(
        `Notion request failed: ${path}: http ${response.status}`,
        response.status,
      );
    }

    lastError = `http ${response.status}`;
    if (attempt === maxAttempts) break;
    await sleep(500 * attempt);
  }
  throw new Error(`Notion request failed: ${path}: ${lastError}`);
}

export type NotionParent =
  | { type: "data_source_id"; data_source_id: string }
  | { type: "database_id"; database_id: string }
  | { type: "page_id"; page_id: string }
  | { type: "workspace"; workspace: true }
  | { type: string };

export type NotionPage = {
  id: string;
  /** Raw icon JSON exactly as the API returns it. Decode before use. */
  icon: unknown;
  parent?: NotionParent;
  in_trash?: boolean;
  archived?: boolean;
};

export type FileUploadStatus = "pending" | "uploaded" | "expired" | "failed";

export type FileUpload = {
  id: string;
  status: FileUploadStatus;
  /** Null once the upload is attached to something, which makes it permanent. */
  expiry_time: string | null;
  filename?: string | null;
  content_type?: string | null;
  content_length?: number | null;
};

export function getPage(
  pageId: string,
  options: NotionApiOptions,
): Promise<NotionPage> {
  return request<NotionPage>(`/v1/pages/${pageId}`, { method: "GET" }, options);
}

/** Step one: reserve an upload. Expires in an hour unless it gets attached. */
export function createFileUpload(
  filename: string,
  contentType: string,
  options: NotionApiOptions,
): Promise<FileUpload> {
  return request<FileUpload>(
    "/v1/file_uploads",
    {
      method: "POST",
      body: JSON.stringify({ filename, content_type: contentType }),
    },
    options,
  );
}

export function getFileUpload(
  uploadId: string,
  options: NotionApiOptions,
): Promise<FileUpload> {
  return request<FileUpload>(
    `/v1/file_uploads/${uploadId}`,
    { method: "GET" },
    options,
  );
}

/**
 * Step two: send the bytes. The field name is `file` and the boundary is the
 * client's business, so the body is rebuilt per attempt and no content-type
 * header is set by hand.
 */
export function sendFileUpload(
  uploadId: string,
  bytes: Uint8Array,
  filename: string,
  contentType: string,
  options: NotionApiOptions,
): Promise<FileUpload> {
  return request<FileUpload>(
    `/v1/file_uploads/${uploadId}/send`,
    {
      method: "POST",
      body: () => {
        const form = new FormData();
        form.append("file", new Blob([bytes], { type: contentType }), filename);
        return form;
      },
    },
    // Sending half a megabyte deserves longer than a metadata call.
    { timeoutMs: 60_000, ...options },
  );
}

/** Step three: attach. The response carries the icon in its `file` form. */
export function setPageFileIcon(
  pageId: string,
  uploadId: string,
  options: NotionApiOptions,
): Promise<NotionPage> {
  return request<NotionPage>(
    `/v1/pages/${pageId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        icon: { type: "file_upload", file_upload: { id: uploadId } },
      }),
    },
    options,
  );
}

/**
 * Put back whatever was there before, verbatim. Used by the revert path; the
 * original icon is stored raw in every page record precisely so this can pass
 * it straight back without reinterpreting it.
 */
export function setPageIconRaw(
  pageId: string,
  icon: unknown,
  options: NotionApiOptions,
): Promise<NotionPage> {
  return request<NotionPage>(
    `/v1/pages/${pageId}`,
    { method: "PATCH", body: JSON.stringify({ icon: icon ?? null }) },
    options,
  );
}

/** Who the token is, and which workspace it can see. */
export async function whoAmI(options: NotionApiOptions): Promise<{
  workspace_name?: string;
  workspace_id?: string;
  name?: string;
}> {
  const me = await request<{
    bot?: { workspace_name?: string; workspace_id?: string };
    name?: string;
  }>("/v1/users/me", { method: "GET" }, options);
  return {
    workspace_name: me.bot?.workspace_name,
    workspace_id: me.bot?.workspace_id,
    name: me.name,
  };
}
