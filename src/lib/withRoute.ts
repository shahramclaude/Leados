// API route wrapper: binds correlation/trace context, records RED metrics
// (rate/errors/duration) per route family, logs the request/response, and
// opens a root tracing span for the handler.
import { NextRequest, NextResponse } from "next/server";
import { correlationFromHeaders, runWithCorrelation } from "./context";
import { logger } from "./logger";
import { recordHttpRequest, routeFamily } from "./metrics";
import { startSpan } from "./tracing";

const log = logger.child({ component: "http" });

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

export function withRoute(handler: Handler): Handler {
  return async (req, ctx) => {
    const correlation = correlationFromHeaders(req.headers);
    return runWithCorrelation(correlation, async () => {
      const start = Date.now();
      const family = routeFamily(new URL(req.url).pathname);
      const span = startSpan(`${req.method} ${family}`, "api", {
        attributes: { method: req.method, path: new URL(req.url).pathname },
      });
      log.info("http.request.start", { method: req.method, path: new URL(req.url).pathname });
      let status = 500;
      try {
        const res = await handler(req, ctx);
        status = res.status;
        const headers = new Headers(res.headers);
        headers.set("x-correlation-id", correlation.correlationId);
        headers.set("x-trace-id", correlation.traceId);
        await span.end(status >= 500 ? "error" : "ok", { status });
        const durationSeconds = (Date.now() - start) / 1000;
        recordHttpRequest({ routeFamily: family, method: req.method, status, durationSeconds });
        log.info("http.request.end", {
          method: req.method,
          path: new URL(req.url).pathname,
          status,
          durationMs: Date.now() - start,
        });
        return new NextResponse(res.body, { status: res.status, headers });
      } catch (err) {
        await span.end("error", { error: String(err) });
        const durationSeconds = (Date.now() - start) / 1000;
        recordHttpRequest({ routeFamily: family, method: req.method, status: 500, durationSeconds });
        log.error("http.request.failed", {
          method: req.method,
          path: new URL(req.url).pathname,
          error: String(err),
          durationMs: Date.now() - start,
        });
        return NextResponse.json(
          { error: "internal_error", correlationId: correlation.correlationId },
          { status: 500, headers: { "x-correlation-id": correlation.correlationId } }
        );
      }
    });
  };
}
