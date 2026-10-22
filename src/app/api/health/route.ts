import { NextRequest, NextResponse } from "next/server";
import { getCompositeHealth } from "@/lib/health";
import { withRoute } from "@/lib/withRoute";

export const dynamic = "force-dynamic";

export const GET = withRoute(async (_req: NextRequest) => {
  const health = await getCompositeHealth();
  const httpStatus = health.status === "failing" ? 503 : 200;
  return NextResponse.json(health, { status: httpStatus });
});
