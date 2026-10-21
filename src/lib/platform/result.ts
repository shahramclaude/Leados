// Typed Result<T, DomainError> contract used by every write path (repository
// layer, API routes, scripts). No write path throws for expected failure
// modes — only genuinely exceptional conditions (DB down, programmer error)
// are allowed to throw.

export type DomainErrorCode =
  | "conflict"
  | "not_found"
  | "forbidden"
  | "invalid"
  | "idempotent_replay";

export type DomainError = {
  code: DomainErrorCode;
  message: string;
  details?: unknown;
};

export type Ok<T> = { ok: true; value: T; replayed?: boolean };
export type Err = { ok: false; error: DomainError };
export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T, replayed = false): Ok<T> {
  return replayed ? { ok: true, value, replayed: true } : { ok: true, value };
}

export function err(code: DomainErrorCode, message: string, details?: unknown): Err {
  return { ok: false, error: { code, message, details } };
}

/** HTTP status mapping used by every API route — kept in one place. */
export function statusForError(code: DomainErrorCode): number {
  switch (code) {
    case "conflict":
      return 409;
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    case "invalid":
      return 400;
    case "idempotent_replay":
      return 200;
  }
}
