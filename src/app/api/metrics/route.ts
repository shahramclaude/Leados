import { NextResponse } from "next/server";
import { renderPrometheusExposition } from "@/lib/metrics";
import { pool } from "@/db";
import { registry } from "@/lib/metrics";

export const dynamic = "force-dynamic";

// Not wrapped in withRoute: scraping /metrics should not itself inflate the
// RED metrics it is reporting, and must stay reachable even during
// maintenance/incident states (see MAINTENANCE_BYPASS_PREFIXES).
export async function GET() {
  registry.dbPoolInUse.set({}, pool.totalCount - pool.idleCount);
  registry.dbPoolSize.set({}, pool.totalCount);
  const body = renderPrometheusExposition();
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
