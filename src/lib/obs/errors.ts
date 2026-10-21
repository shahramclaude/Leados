// Standard error envelope. correlationId/traceId here is what ties a user
// bug report straight back to structured logs and the trace ring buffer.
import { getContext } from "./context";

export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    correlationId: string;
    traceId: string;
  };
}

export function buildErrorEnvelope(err: unknown): { body: ErrorEnvelope; status: number } {
  const ctx = getContext();
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, correlationId: ctx.correlationId, traceId: ctx.traceId } },
    };
  }
  const message = err instanceof Error ? err.message : "internal error";
  return {
    status: 500,
    body: { error: { code: "internal_error", message, correlationId: ctx.correlationId, traceId: ctx.traceId } },
  };
}
