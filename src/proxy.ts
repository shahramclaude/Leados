// Next.js 16 request-interception layer (proxy.ts, successor to
// middleware.ts — runs on the Node.js runtime by default, which is why it can
// use `pg`/Drizzle directly). Responsible for:
//   1. Assigning/propagating a correlationId onto every request so the
//      telemetry trio (logs/metrics/traces) can stitch a request to its
//      downstream orchestrator/agent-run/query work.
//   2. Enforcing maintenance mode: mutating API calls are queued instead of
//      applied while maintenance is enabled (read-only banner + write
//      queueing, Phase 2/3).
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getMaintenanceState, isBypassPath, enqueueDeferredWrite } from "@/lib/maintenance";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const correlationId = request.headers.get("x-correlation-id") || `cor_${randomUUID()}`;
  const traceId = request.headers.get("x-trace-id") || randomUUID().replace(/-/g, "");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-correlation-id", correlationId);
  requestHeaders.set("x-trace-id", traceId);

  const isApi = pathname.startsWith("/api/");
  const isReplayedWrite = request.headers.get("x-replayed-write") === "true";

  if (isApi && !isBypassPath(pathname) && MUTATING_METHODS.has(request.method) && !isReplayedWrite) {
    try {
      const maintenance = await getMaintenanceState();
      if (maintenance.enabled) {
        const body = await request.clone().json().catch(() => ({}));
        const id = await enqueueDeferredWrite({
          method: request.method,
          path: pathname + request.nextUrl.search,
          body,
          correlationId,
        });
        return NextResponse.json(
          {
            queued: true,
            deferredWriteId: id,
            message:
              "The system is in maintenance mode. Your write was queued and will be applied automatically once maintenance ends.",
            correlationId,
          },
          { status: 202, headers: { "x-correlation-id": correlationId } }
        );
      }
    } catch {
      // If the maintenance check itself fails (e.g. db down), fall through
      // and let the route handler's own health/db checks surface the error —
      // we do not want proxy failures to silently swallow writes.
    }
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-correlation-id", correlationId);
  response.headers.set("x-trace-id", traceId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
