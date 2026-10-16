/** Browser-side client for the app's own proxy at /api/tools. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** The backend wraps JSON as { success, message, data }. */
function unwrap<T>(payload: any): T {
  return (payload && typeof payload === "object" && "data" in payload ? payload.data : payload) as T;
}

async function toError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => null);
  const raw = payload?.message ?? payload?.error ?? `Request failed (${response.status})`;
  const message = Array.isArray(raw) ? raw.join(", ") : String(raw);
  const retry = Number(payload?.retry_after_seconds ?? payload?.data?.retry_after_seconds);
  return new ApiError(message, response.status, Number.isFinite(retry) ? retry : undefined, payload?.code);
}

async function call(method: string, path: string, body?: BodyInit, json = false): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`/api/tools/${path}`, {
      method,
      body,
      cache: "no-store",
      headers: {
        ...(json ? { "Content-Type": "application/json" } : {}),
        ...(method === "POST" ? { "Idempotency-Key": crypto.randomUUID() } : {}),
      },
    });
  } catch {
    throw new ApiError("Network error. Check your connection and try again.", 0);
  }
  if (!response.ok) {
    const error = await toError(response);
    if (error.code === "LOGIN_REQUIRED") window.location.assign(`/login?next=${encodeURIComponent(location.pathname)}`);
    throw error;
  }
  return response;
}

export async function getJson<T>(path: string): Promise<T> {
  return unwrap<T>(await (await call("GET", path)).json());
}

/** GET for status polling: rides out a few transient failures before giving up. */
export async function pollJson<T>(path: string, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await getJson<T>(path);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 0;
      const transient = status === 0 || status === 429 || status >= 500;
      if (!transient || attempt >= attempts) throw error;
      const retryAfter = error instanceof ApiError ? error.retryAfterSeconds : undefined;
      await sleep(Math.min(20_000, (retryAfter ?? 2 * attempt) * 1000));
    }
  }
}

export async function postJson<T>(path: string, body: unknown): Promise<T> {
  return unwrap<T>(await (await call("POST", path, JSON.stringify(body), true)).json());
}

export async function postFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  return unwrap<T>(await (await call("POST", path, form)).json());
}

export async function remove(path: string): Promise<void> {
  await call("DELETE", path);
}

/** POST that returns a file, saved to disk under `filename`. */
export async function downloadPost(path: string, body: unknown, filename: string): Promise<void> {
  const blob = await (await call("POST", path, JSON.stringify(body), true)).blob();
  saveBlob(blob, filename);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Uploads go through a Vercel function, which rejects request bodies over
 * 4.5 MB, so files are capped a little below that.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
