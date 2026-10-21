// ---------------------------------------------------------------------------
// The single async-state contract used by every query/mutation in LEADOS.
// Every hook, store slice, and API-backed component reads/writes this shape
// instead of inventing its own { loading, error, data } tuple. This is what
// Phase 0 found missing: three different ad-hoc shapes across routes.
// ---------------------------------------------------------------------------

export type AsyncStatus =
  | "idle"
  | "loading"
  | "refreshing"
  | "optimistic"
  | "success"
  | "error"
  | "conflict";

export type AsyncErrorCode =
  | "NETWORK"
  | "TIMEOUT"
  | "VALIDATION"
  | "VERSION_CONFLICT"
  | "NOT_FOUND"
  | "SERVER"
  | "UNKNOWN";

export interface AsyncError {
  code: AsyncErrorCode;
  message: string;
  retryable: boolean;
  correlationId?: string;
}

export interface AsyncMeta {
  updatedAt: number;
  stale: boolean;
  source: "server" | "cache" | "optimistic";
}

export interface AsyncState<T> {
  status: AsyncStatus;
  data?: T;
  error?: AsyncError;
  meta?: AsyncMeta;
  /** Present only when status === "conflict": the two versions to resolve. */
  conflict?: {
    mine: T;
    theirs: T;
    expectedVersion: number;
    actualVersion: number;
  };
}

export function idleState<T>(): AsyncState<T> {
  return { status: "idle" };
}

export function loadingState<T>(previous?: AsyncState<T>): AsyncState<T> {
  return {
    status: previous?.data ? "refreshing" : "loading",
    data: previous?.data,
    meta: previous?.meta,
  };
}

export function successState<T>(data: T, source: AsyncMeta["source"] = "server"): AsyncState<T> {
  return {
    status: "success",
    data,
    meta: { updatedAt: Date.now(), stale: false, source },
  };
}

export function optimisticState<T>(data: T, previous?: AsyncState<T>): AsyncState<T> {
  return {
    status: "optimistic",
    data,
    meta: { updatedAt: Date.now(), stale: false, source: "optimistic" },
    error: previous?.error,
  };
}

export function errorState<T>(error: AsyncError, previous?: AsyncState<T>): AsyncState<T> {
  return {
    status: "error",
    data: previous?.data,
    meta: previous?.meta ? { ...previous.meta, stale: true } : undefined,
    error,
  };
}

export function conflictState<T>(
  mine: T,
  theirs: T,
  expectedVersion: number,
  actualVersion: number,
): AsyncState<T> {
  return {
    status: "conflict",
    data: mine,
    conflict: { mine, theirs, expectedVersion, actualVersion },
    meta: { updatedAt: Date.now(), stale: true, source: "optimistic" },
  };
}

export function markStale<T>(state: AsyncState<T>): AsyncState<T> {
  if (!state.meta) return state;
  return { ...state, meta: { ...state.meta, stale: true } };
}

export function toAsyncError(err: unknown, fallbackCode: AsyncErrorCode = "UNKNOWN"): AsyncError {
  if (err instanceof Response) {
    return {
      code: err.status === 409 ? "VERSION_CONFLICT" : err.status === 404 ? "NOT_FOUND" : "SERVER",
      message: `Request failed with status ${err.status}`,
      retryable: err.status >= 500,
    };
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return { code: "TIMEOUT", message: "The request timed out.", retryable: true };
  }
  if (err instanceof TypeError) {
    return {
      code: "NETWORK",
      message: "Could not reach the server. Check your connection.",
      retryable: true,
    };
  }
  if (err instanceof Error) {
    return { code: fallbackCode, message: err.message, retryable: fallbackCode !== "VALIDATION" };
  }
  return { code: fallbackCode, message: "Something unexpected happened.", retryable: true };
}
