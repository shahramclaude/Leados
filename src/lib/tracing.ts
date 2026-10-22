// Minimal tracing: spans across API -> orchestrator -> agent-run -> repo/
// external, with declared sampling, persisted to `trace_spans` so the
// "explain this correlationId" viewer can reconstruct a trace without a
// separate APM backend.
//
// Declared sampling policy (see docs/TELEMETRY.md):
//  - 100% of requests that error (status >= 500 or span.status = "error")
//  - TRACE_SAMPLE_RATE (default 0.2 = 20%) of everything else
import { db } from "@/db";
import { traceSpans } from "@/db/schema";
import { getCorrelationContext, newSpanId } from "./context";
import { logger } from "./logger";

const log = logger.child({ component: "tracing" });

export const TRACE_SAMPLE_RATE = Number(process.env.TRACE_SAMPLE_RATE ?? 0.2);

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: Date;
  attributes: Record<string, unknown>;
  sampled: boolean;
  end: (status?: "ok" | "error", extraAttributes?: Record<string, unknown>) => Promise<void>;
}

function decideSample(forceSample: boolean): boolean {
  if (forceSample) return true;
  return Math.random() < TRACE_SAMPLE_RATE;
}

export function startSpan(
  name: string,
  service: string,
  opts: { parentSpanId?: string; attributes?: Record<string, unknown>; forceSample?: boolean } = {}
): Span {
  const ctx = getCorrelationContext();
  const traceId = ctx?.traceId ?? "trace_unbound";
  const spanId = newSpanId();
  const startTime = new Date();
  const sampled = decideSample(Boolean(opts.forceSample));

  return {
    traceId,
    spanId,
    parentSpanId: opts.parentSpanId,
    name,
    service,
    startTime,
    attributes: opts.attributes ?? {},
    sampled,
    end: async (status = "ok", extraAttributes = {}) => {
      const endTime = new Date();
      const durationMs = endTime.getTime() - startTime.getTime();
      const attributes = { ...(opts.attributes ?? {}), ...extraAttributes };
      const shouldPersist = sampled || status === "error";
      log.debug("span.end", {
        traceId,
        spanId,
        name,
        service,
        durationMs,
        status,
        sampled: shouldPersist,
      });
      if (!shouldPersist) return;
      try {
        await db.insert(traceSpans).values({
          correlationId: ctx?.correlationId ?? "cor_unbound",
          traceId,
          spanId,
          parentSpanId: opts.parentSpanId ?? null,
          name,
          service,
          startTime,
          endTime,
          durationMs,
          status,
          attributes,
        });
      } catch (err) {
        log.warn("span.persist_failed", { error: String(err) });
      }
    },
  };
}

/** Convenience wrapper: runs `fn`, timing + ending the span automatically. */
export async function withSpan<T>(
  name: string,
  service: string,
  fn: (span: Span) => Promise<T>,
  opts: { parentSpanId?: string; attributes?: Record<string, unknown> } = {}
): Promise<T> {
  const span = startSpan(name, service, opts);
  try {
    const result = await fn(span);
    await span.end("ok");
    return result;
  } catch (err) {
    await span.end("error", { error: String(err) });
    throw err;
  }
}
