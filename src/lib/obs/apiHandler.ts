// Wraps every API route so correlationId/tracing/structured logging/RED
// metrics/error-envelope/maintenance-mode behavior is applied uniformly
// instead of copy-pasted per route.
import { newId, runWithContext } from "./context";
import { logger } from "./logger";
import { recordHttpRequest } from "./metrics";
import { buildErrorEnvelope } from "./errors";
import { isMaintenanceModeEnabled } from "@/lib/ops/maintenance";

export type RouteHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

interface HandlerOptions {
  /** Route family used as a metric label — keep this a small closed set
   * (e.g. "health", "metrics", "automation_runs"), never a raw path with
   * dynamic ids in it (cardinality). */
  routeFamily: string;
  /** Mutating methods are rejected with 503 while maintenance mode is on,
   * except for the maintenance-control route itself. */
  allowDuringMaintenance?: boolean;
}

function extractCorrelationId(req: Request): string {
  return req.headers.get("x-correlation-id") || req.headers.get("x-request-id") || newId("corr-");
}

export function withApiHandler(options: HandlerOptions, handler: RouteHandler): RouteHandler {
  return async (req, routeCtx) => {
    const correlationId = extractCorrelationId(req);
    const traceId = newId();
    const spanId = newId();
    const start = Date.now();
    return runWithContext({ correlationId, traceId, spanId, route: options.routeFamily }, async () => {
      logger.info("http.request.start", { method: req.method, route: options.routeFamily, url: req.url });
      try {
        if (
          !options.allowDuringMaintenance &&
          req.method !== "GET" &&
          req.method !== "HEAD" &&
          (await isMaintenanceModeEnabled())
        ) {
          const res = Response.json(
            {
              error: {
                code: "maintenance_mode",
                message: "The system is in maintenance mode; writes are queued/rejected until it is lifted.",
                correlationId,
                traceId,
              },
            },
            { status: 503, headers: { "x-correlation-id": correlationId, "retry-after": "60" } },
          );
          recordHttpRequest(options.routeFamily, req.method, 503, Date.now() - start);
          return res;
        }

        const res = await handler(req, routeCtx);
        const duration = Date.now() - start;
        recordHttpRequest(options.routeFamily, req.method, res.status, duration);
        logger.info("http.request.end", { method: req.method, route: options.routeFamily, status: res.status, durationMs: duration });
        res.headers.set("x-correlation-id", correlationId);
        res.headers.set("x-trace-id", traceId);
        return res;
      } catch (err) {
        const duration = Date.now() - start;
        const { body, status } = buildErrorEnvelope(err);
        logger.error("http.request.error", {
          method: req.method,
          route: options.routeFamily,
          durationMs: duration,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        recordHttpRequest(options.routeFamily, req.method, status, duration);
        return Response.json(body, { status, headers: { "x-correlation-id": correlationId, "x-trace-id": traceId } });
      }
    });
  };
}
