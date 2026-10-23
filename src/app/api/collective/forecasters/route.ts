import { NextResponse } from "next/server";
import { listForecasters } from "@/lib/collective/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listForecasters();
  return NextResponse.json({ forecasters: items });
}
