/**
 * src/lib/domain/types.ts
 *
 * The single canonical domain model for LEADOS. Pure types only — no
 * imports from `src/app`, `src/lib/platform`, or any I/O library. This is
 * the file future parts (1-14) extend when they add real
 * leadership-intelligence entities (Signal, Finding, RiskRegisterEntry,
 * Attractor, etc.).
 *
 * There is currently no `src/lib/types.ts` / `clientTypes.ts` pair to
 * consolidate in this codebase (see AI-SESSION-LOG.md for the provenance
 * note on why). This file exists so that consolidation has exactly one
 * place to land in future parts instead of starting from zero again.
 */
import type { EventType } from "./eventCatalog";

export interface EventRecord {
  id: number;
  type: EventType | (string & {});
  version: number;
  payload: unknown;
  createdAt: Date;
}

export interface NewEventInput {
  type: EventType | (string & {});
  version: number;
  payload: unknown;
}

/** Narrow discriminated result type used across the use-case layer. */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
