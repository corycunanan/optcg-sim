/**
 * Centralized API fetch wrapper.
 *
 * Standardizes headers, JSON parsing, and error handling for all client-side
 * API calls. Replaces 18+ scattered fetch() patterns with typed helpers.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function request<T>(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message = json?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return json as T;
}

/** GET request — returns the full JSON response. */
export function apiGet<T>(url: string, opts?: RequestOptions): Promise<T> {
  return request<T>(url, {
    method: "GET",
    signal: opts?.signal,
    headers: opts?.headers,
  });
}

/** POST request with JSON body. */
export function apiPost<T>(
  url: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts?.signal,
  });
}

/** PUT request with JSON body. */
export function apiPut<T>(
  url: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts?.signal,
  });
}

/** PATCH request with JSON body. */
export function apiPatch<T>(
  url: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T> {
  return request<T>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...opts?.headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: opts?.signal,
  });
}

/** DELETE request. */
export function apiDelete<T>(url: string, opts?: RequestOptions): Promise<T> {
  return request<T>(url, {
    method: "DELETE",
    signal: opts?.signal,
    headers: opts?.headers,
  });
}
