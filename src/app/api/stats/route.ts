import { routeRegistry } from "@/lib/api/spec";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

/**
 * Unauthenticated operational heartbeat — intentionally coarse (no business
 * data) so it is safe to expose publicly for uptime dashboards. Full
 * business metrics live behind auth at GET /api/v1/stats.
 */
export async function GET() {
  return Response.json({
    status: "ok",
    apiVersion: "v1",
    routeCount: routeRegistry.length,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
}
