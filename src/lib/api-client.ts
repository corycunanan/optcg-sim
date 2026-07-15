/**
 * Centralized API fetch wrapper.
 *
 * Standardizes headers, JSON parsing, and error handling for all client-side
 * API calls. Replaces 18+ scattered fetch() patterns with typed helpers.
 *
 * Response bodies are `unknown` unless the caller supplies a Zod schema.
 * Callers that consume response data must validate it at this boundary.
 */

import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
  cache?: RequestCache;
  credentials?: RequestCredentials;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSchema<T>(
  value: ZodType<T> | RequestOptions | undefined
): value is ZodType<T> {
  return Boolean(value && "safeParse" in value);
}

function resolveRequestArgs<T>(
  schemaOrOpts: ZodType<T> | RequestOptions | undefined,
  opts: RequestOptions | undefined
): { schema?: ZodType<T>; options?: RequestOptions } {
  if (isSchema(schemaOrOpts)) {
    return { schema: schemaOrOpts, options: opts };
  }
  return { options: schemaOrOpts };
}

async function request<T>(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  schema?: ZodType<T>
): Promise<T | unknown> {
  const res = await fetch(url, init);
  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const error = isRecord(json) ? json.error : undefined;
    const message =
      typeof error === "string" ? error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  if (schema) {
    return schema.parse(json);
  }

  return json;
}

// ─── GET ────────────────────────────────────────────────────

/** GET request with Zod validation. */
export function apiGet<T>(
  url: string,
  schema: ZodType<T>,
  opts?: RequestOptions
): Promise<T>;
/** GET request when the response body is intentionally ignored or inspected manually. */
export function apiGet(url: string, opts?: RequestOptions): Promise<unknown>;
export function apiGet<T>(
  url: string,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions
): Promise<T | unknown> {
  const { schema, options } = resolveRequestArgs(schemaOrOpts, opts);

  return request<T>(
    url,
    {
      method: "GET",
      signal: options?.signal,
      headers: options?.headers,
      cache: options?.cache,
      credentials: options?.credentials,
    },
    schema
  );
}

// ─── POST ───────────────────────────────────────────────────

/** POST request with Zod validation. */
export function apiPost<T>(
  url: string,
  body: unknown,
  schema: ZodType<T>,
  opts?: RequestOptions
): Promise<T>;
/** POST request when the response body is intentionally ignored or inspected manually. */
export function apiPost(
  url: string,
  body?: unknown,
  opts?: RequestOptions
): Promise<unknown>;
export function apiPost<T>(
  url: string,
  body?: unknown,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions
): Promise<T | unknown> {
  const { schema, options } = resolveRequestArgs(schemaOrOpts, opts);

  return request<T>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
      cache: options?.cache,
      credentials: options?.credentials,
    },
    schema
  );
}

// ─── PUT ────────────────────────────────────────────────────

/** PUT request with Zod validation. */
export function apiPut<T>(
  url: string,
  body: unknown,
  schema: ZodType<T>,
  opts?: RequestOptions
): Promise<T>;
/** PUT request when the response body is intentionally ignored or inspected manually. */
export function apiPut(
  url: string,
  body?: unknown,
  opts?: RequestOptions
): Promise<unknown>;
export function apiPut<T>(
  url: string,
  body?: unknown,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions
): Promise<T | unknown> {
  const { schema, options } = resolveRequestArgs(schemaOrOpts, opts);

  return request<T>(
    url,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
      cache: options?.cache,
      credentials: options?.credentials,
    },
    schema
  );
}

// ─── PATCH ──────────────────────────────────────────────────

/** PATCH request with Zod validation. */
export function apiPatch<T>(
  url: string,
  body: unknown,
  schema: ZodType<T>,
  opts?: RequestOptions
): Promise<T>;
/** PATCH request when the response body is intentionally ignored or inspected manually. */
export function apiPatch(
  url: string,
  body?: unknown,
  opts?: RequestOptions
): Promise<unknown>;
export function apiPatch<T>(
  url: string,
  body?: unknown,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions
): Promise<T | unknown> {
  const { schema, options } = resolveRequestArgs(schemaOrOpts, opts);

  return request<T>(
    url,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
      cache: options?.cache,
      credentials: options?.credentials,
    },
    schema
  );
}

// ─── DELETE ─────────────────────────────────────────────────

/** DELETE request with Zod validation. */
export function apiDelete<T>(
  url: string,
  schema: ZodType<T>,
  opts?: RequestOptions
): Promise<T>;
/** DELETE request when the response body is intentionally ignored or inspected manually. */
export function apiDelete(url: string, opts?: RequestOptions): Promise<unknown>;
export function apiDelete<T>(
  url: string,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions
): Promise<T | unknown> {
  const { schema, options } = resolveRequestArgs(schemaOrOpts, opts);

  return request<T>(
    url,
    {
      method: "DELETE",
      signal: options?.signal,
      headers: options?.headers,
      cache: options?.cache,
      credentials: options?.credentials,
    },
    schema
  );
}
