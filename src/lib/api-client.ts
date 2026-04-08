/**
 * Centralized API fetch wrapper.
 *
 * Standardizes headers, JSON parsing, and error handling for all client-side
 * API calls. Replaces 18+ scattered fetch() patterns with typed helpers.
 *
 * Each helper supports two call styles:
 *   1. `apiGet<T>(url, opts?)` — unchecked cast (existing callers)
 *   2. `apiGet(url, schema, opts?)` — Zod-validated at runtime
 */

import type { ZodType } from "zod";

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

async function request<T extends Record<string, unknown>>(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  schema?: ZodType<T>,
): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const message = json?.error ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  if (schema) {
    return schema.parse(json);
  }

  return json as T;
}

// ─── GET ────────────────────────────────────────────────────

/** GET request with Zod validation. */
export function apiGet<T extends Record<string, unknown>>(
  url: string,
  schema: ZodType<T>,
  opts?: RequestOptions,
): Promise<T>;
/** GET request — unchecked cast. */
export function apiGet<T extends Record<string, unknown>>(
  url: string,
  opts?: RequestOptions,
): Promise<T>;
export function apiGet<T extends Record<string, unknown>>(
  url: string,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions,
): Promise<T> {
  const isSchema = schemaOrOpts && "parse" in schemaOrOpts;
  const schema = isSchema ? (schemaOrOpts as ZodType<T>) : undefined;
  const options = isSchema ? opts : (schemaOrOpts as RequestOptions | undefined);

  return request<T>(
    url,
    { method: "GET", signal: options?.signal, headers: options?.headers },
    schema,
  );
}

// ─── POST ───────────────────────────────────────────────────

/** POST request with Zod validation. */
export function apiPost<T extends Record<string, unknown>>(
  url: string,
  body: unknown,
  schema: ZodType<T>,
  opts?: RequestOptions,
): Promise<T>;
/** POST request — unchecked cast. */
export function apiPost<T extends Record<string, unknown>>(
  url: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T>;
export function apiPost<T extends Record<string, unknown>>(
  url: string,
  body?: unknown,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions,
): Promise<T> {
  const isSchema = schemaOrOpts && "parse" in schemaOrOpts;
  const schema = isSchema ? (schemaOrOpts as ZodType<T>) : undefined;
  const options = isSchema ? opts : (schemaOrOpts as RequestOptions | undefined);

  return request<T>(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    },
    schema,
  );
}

// ─── PUT ────────────────────────────────────────────────────

/** PUT request with Zod validation. */
export function apiPut<T extends Record<string, unknown>>(
  url: string,
  body: unknown,
  schema: ZodType<T>,
  opts?: RequestOptions,
): Promise<T>;
/** PUT request — unchecked cast. */
export function apiPut<T extends Record<string, unknown>>(
  url: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T>;
export function apiPut<T extends Record<string, unknown>>(
  url: string,
  body?: unknown,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions,
): Promise<T> {
  const isSchema = schemaOrOpts && "parse" in schemaOrOpts;
  const schema = isSchema ? (schemaOrOpts as ZodType<T>) : undefined;
  const options = isSchema ? opts : (schemaOrOpts as RequestOptions | undefined);

  return request<T>(
    url,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    },
    schema,
  );
}

// ─── PATCH ──────────────────────────────────────────────────

/** PATCH request with Zod validation. */
export function apiPatch<T extends Record<string, unknown>>(
  url: string,
  body: unknown,
  schema: ZodType<T>,
  opts?: RequestOptions,
): Promise<T>;
/** PATCH request — unchecked cast. */
export function apiPatch<T extends Record<string, unknown>>(
  url: string,
  body?: unknown,
  opts?: RequestOptions,
): Promise<T>;
export function apiPatch<T extends Record<string, unknown>>(
  url: string,
  body?: unknown,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions,
): Promise<T> {
  const isSchema = schemaOrOpts && "parse" in schemaOrOpts;
  const schema = isSchema ? (schemaOrOpts as ZodType<T>) : undefined;
  const options = isSchema ? opts : (schemaOrOpts as RequestOptions | undefined);

  return request<T>(
    url,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: options?.signal,
    },
    schema,
  );
}

// ─── DELETE ─────────────────────────────────────────────────

/** DELETE request with Zod validation. */
export function apiDelete<T extends Record<string, unknown>>(
  url: string,
  schema: ZodType<T>,
  opts?: RequestOptions,
): Promise<T>;
/** DELETE request — unchecked cast. */
export function apiDelete<T extends Record<string, unknown>>(
  url: string,
  opts?: RequestOptions,
): Promise<T>;
export function apiDelete<T extends Record<string, unknown>>(
  url: string,
  schemaOrOpts?: ZodType<T> | RequestOptions,
  opts?: RequestOptions,
): Promise<T> {
  const isSchema = schemaOrOpts && "parse" in schemaOrOpts;
  const schema = isSchema ? (schemaOrOpts as ZodType<T>) : undefined;
  const options = isSchema ? opts : (schemaOrOpts as RequestOptions | undefined);

  return request<T>(
    url,
    { method: "DELETE", signal: options?.signal, headers: options?.headers },
    schema,
  );
}
