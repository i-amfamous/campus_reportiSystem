/**
 * Typed API client.
 *
 * The API is versioned under `/api/v1` and authenticates with a server-managed
 * session cookie. Unsafe methods must echo the CSRF token that the server
 * sets in the readable `campus_csrf` cookie.
 */

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, string[]>;

  constructor(code: string, message: string, status: number, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Field-level messages for react-hook-form. */
  fieldErrors(): Record<string, string> {
    const output: Record<string, string> = {};
    for (const [field, messages] of Object.entries(this.details ?? {})) {
      if (Array.isArray(messages) && messages[0]) output[field] = messages[0];
    }
    return output;
  }
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function csrfToken(): string | null {
  return readCookie('campus_csrf');
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  raw?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Request-Id': globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    ...((options.headers as Record<string, string>) ?? {}),
  };

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const token = csrfToken();
    if (token) headers['X-CSRF-Token'] = token;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    body,
    credentials: 'include',
  });

  if (response.status === 401 && !path.startsWith('/api/v1/auth/login')) {
    window.dispatchEvent(new CustomEvent('campus:unauthorized'));
  }

  if (options.raw) {
    if (!response.ok) {
      throw new ApiError('INTERNAL_ERROR', response.statusText, response.status);
    }
    return (await response.blob()) as T;
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = (
      payload as { error?: { code?: string; message?: string; details?: Record<string, string[]> } }
    )?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? `Request failed with status ${response.status}.`,
      response.status,
      error?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: 'DELETE', body }),
};
