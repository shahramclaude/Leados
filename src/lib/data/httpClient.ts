"use client";

// The ONE typed fetch layer for all `/api/**` calls. Everything that talks
// to the server from client components goes through `apiGet`/`apiMutate` so
// request shape, error handling, and idempotency are consistent everywhere
// — see docs/FRONTEND.md "Server-first data flow".
//
// Deliberately hand-rolled (no generated client yet): isolated behind this
// one module so Part 14 can swap the body for an OpenAPI-generated client
// without touching call sites (`apiGet`/`apiMutate` signatures stay the
// same).
import type { ApiErrorBody } from "./types";

export class ApiRequestError extends Error {
  code: string;
  status: number;
  details?: unknown;
  correlationId: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.name = "ApiRequestError";
    this.code = body.error.code;
    this.status = status;
    this.details = body.error.details;
    this.correlationId = body.correlationId;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "object"
  );
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : {};
  if (!res.ok) {
    if (isApiErrorBody(json)) throw new ApiRequestError(res.status, json);
    throw new ApiRequestError(res.status, {
      error: { code: "UNKNOWN", message: `Request failed with status ${res.status}` },
      correlationId: res.headers.get("x-correlation-id") ?? "unknown",
    });
  }
  return (json as { data: T }).data;
}

const IDEMPOTENT_METHODS = new Set(["GET", "PUT", "PATCH", "DELETE"]);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  /** Max retry attempts for idempotent methods on network/5xx failure. */
  retries?: number;
  signal?: AbortSignal;
}

/**
 * Core request function. Retries with exponential backoff ONLY for methods
 * that are safe to retry (GET/PUT/PATCH/DELETE), or for POST when an
 * `idempotencyKey` is supplied (making the write itself idempotent — the
 * server dedupes by key, see src/lib/server/idempotency.ts).
 */
export async function apiRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const canRetry = IDEMPOTENT_METHODS.has(method) || (method === "POST" && !!options.idempotencyKey);
  const maxAttempts = canRetry ? options.retries ?? 3 : 1;

  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal: options.signal,
      });
      if (res.status >= 500 && attempt < maxAttempts - 1) {
        await sleep(2 ** attempt * 250);
        continue;
      }
      return await parseResponse<T>(res);
    } catch (err) {
      lastError = err;
      if (err instanceof ApiRequestError) throw err;
      if (attempt < maxAttempts - 1) {
        await sleep(2 ** attempt * 250);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

export function apiGet<T>(url: string, signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(url, { method: "GET", signal });
}

export function apiMutate<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  return apiRequest<T>(url, { method, body, idempotencyKey });
}
