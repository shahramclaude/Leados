import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { CORRELATION_ID_HEADER, newCorrelationId, runWithRequestContext } from "./requestContext";
import { logger } from "./logger";
import { recordRequest } from "./metrics";
import { captureError } from "./errorTracking";

type RouteHandler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response> | Response;

/**
 * Wraps a Next.js route handler so every request/response gets:
 *  - a correlation id (read from the header `middleware.ts` guarantees, or
 *    minted fresh for direct server-side/test calls that skip middleware)
 *  - structured start/end log lines
 *  - latency + error-rate metrics recorded against the route name
 *  - uncaught errors routed through the error-tracking hook instead of
 *    crashing the process or leaking a stack trace to the client
 */
export function withObservability<Ctx = unknown>(
  routeName: string,
  handler: RouteHandler<Ctx>,
): RouteHandler<Ctx> {
  return async (req, ctx) => {
    const correlationId = req.headers.get(CORRELATION_ID_HEADER) ?? newCorrelationId();
    const startedAt = Date.now();

    return runWithRequestContext({ correlationId, route: routeName, startedAt }, async () => {
      logger.info("request_started", { route: routeName, method: req.method });
      try {
        const res = await handler(req, ctx);
        const durationMs = Date.now() - startedAt;
        const isError = res.status >= 500;
        recordRequest(routeName, durationMs, isError);
        logger.info("request_completed", {
          route: routeName,
          method: req.method,
          status: res.status,
          durationMs,
        });
        res.headers.set(CORRELATION_ID_HEADER, correlationId);
        return res;
      } catch (error) {
        const durationMs = Date.now() - startedAt;
        recordRequest(routeName, durationMs, true);
        await captureError(error, { route: routeName });
        logger.error("request_failed", { route: routeName, method: req.method, durationMs });
        const res = NextResponse.json(
          { error: "internal_error", correlationId },
          { status: 500 },
        );
        res.headers.set(CORRELATION_ID_HEADER, correlationId);
        return res;
      }
    });
  };
}
