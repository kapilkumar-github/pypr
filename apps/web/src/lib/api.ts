import { z } from 'zod';

/** An error response from the API, with the machine-readable `code` when there is one. */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | undefined,
    readonly body: unknown,
  ) {
    super(message);
  }
}

const errorBodySchema = z.looseObject({
  message: z.union([z.string(), z.array(z.string())]).optional(),
  code: z.string().optional(),
});

const NO_REFRESH = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/verify-email',
  '/api/auth/resend-verification',
]);

let refreshing: Promise<boolean> | null = null;

/**
 * Swaps the refresh cookie for new tokens, once at a time: within this tab through a shared
 * promise, and across tabs through a Web Lock, because the API ends the session when one
 * refresh token is used twice (decision D12).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const run = async () => {
      const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' });
      return res.ok;
    };
    try {
      return typeof navigator !== 'undefined' && 'locks' in navigator
        ? await navigator.locks.request('pypr-auth-refresh', run)
        : await run();
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Sent with the page being closed (autosave on tab close). */
  keepalive?: boolean;
}

/**
 * Calls the API through the same-origin /api proxy. On 401 it refreshes the session once and
 * retries. Resolves with the parsed JSON body (undefined for 204); throws ApiError otherwise.
 */
export async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<unknown> {
  const send = () =>
    fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      keepalive: options.keepalive ?? false,
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && !NO_REFRESH.has(path) && (await refreshSession())) {
      res = await send();
    }
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.', undefined, null);
  }

  if (res.status === 204) return undefined;
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return body;

  const parsed = errorBodySchema.safeParse(body);
  const raw = parsed.success ? parsed.data.message : undefined;
  const message = Array.isArray(raw) ? raw.join(' ') : (raw ?? defaultMessage(res.status));
  throw new ApiError(res.status, message, parsed.success ? parsed.data.code : undefined, body);
}

/** apiRequest + response validation. */
export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  return schema.parse(await apiRequest(path));
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 404) return 'Not found.';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  return 'Something went wrong. Please try again.';
}

/**
 * Downloads a file from the API (refreshing the session once on 401) and returns it with the
 * server's file name from Content-Disposition.
 */
export async function apiDownload(path: string): Promise<{ blob: Blob; fileName: string }> {
  const send = () => fetch(path, { credentials: 'same-origin' });
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.', undefined, null);
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const parsed = errorBodySchema.safeParse(body);
    const raw = parsed.success ? parsed.data.message : undefined;
    throw new ApiError(
      res.status,
      (Array.isArray(raw) ? raw.join(' ') : raw) ?? defaultMessage(res.status),
      parsed.success ? parsed.data.code : undefined,
      body,
    );
  }
  return { blob: await res.blob(), fileName: fileNameFrom(res.headers.get('content-disposition')) };
}

/** Prefers the UTF-8 filename* form; falls back to filename, then a default. */
export function fileNameFrom(disposition: string | null, fallback = 'Resume.pdf'): string {
  if (!disposition) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8);
    } catch {
      // fall through to the plain name
    }
  }
  return /filename="([^"]+)"/i.exec(disposition)?.[1] ?? fallback;
}

/**
 * Uploads a file as multipart/form-data (refreshing the session once on 401) and returns the
 * parsed JSON. Abort with `signal` (e.g. the user cancels).
 */
export async function apiUpload(
  path: string,
  form: FormData,
  signal?: AbortSignal,
): Promise<unknown> {
  const send = () =>
    fetch(path, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
      ...(signal && { signal }),
    });
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Network error. Check your connection and try again.', undefined, null);
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) return body;
  const parsed = errorBodySchema.safeParse(body);
  const raw = parsed.success ? parsed.data.message : undefined;
  throw new ApiError(
    res.status,
    (Array.isArray(raw) ? raw.join(' ') : raw) ??
      (res.status === 413 ? 'The file is larger than 5 MB.' : defaultMessage(res.status)),
    parsed.success ? parsed.data.code : undefined,
    body,
  );
}
